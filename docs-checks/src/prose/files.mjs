// File discovery shared by the prose and spelling checkers, so both look at
// exactly the same set of files.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { context } from "../context.mjs";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".source",
  "node_modules",
]);

const excludedPaths = () =>
  context().config.exclude.map((entry) => entry.replaceAll("/", path.sep));

export async function discoverFiles() {
  const { root, config } = context();
  const excluded = excludedPaths();
  const files = [];

  for (const target of config.include) {
    const found = [];
    await walk(path.join(root, target.dir), target, excluded, found);
    files.push(...found.sort());
  }

  return dedupe(files);
}

/** Arguments may name files or directories, so `check-prose src/app` works.
 * They are checked in the order given. */
export async function resolveArguments(entries) {
  const { root, config } = context();
  const excluded = excludedPaths();
  const extensions = [
    ...new Set(config.include.flatMap((target) => target.extensions)),
  ];
  const files = [];

  for (const entry of entries) {
    const absolute = path.resolve(entry);

    let stats;
    try {
      stats = await fs.stat(absolute);
    } catch {
      process.stderr.write(`Skipping ${entry}: no such file or directory\n`);
      continue;
    }

    const found = [];
    if (stats.isDirectory())
      await walk(absolute, { extensions }, excluded, found);
    else found.push(path.relative(root, absolute));
    files.push(...found.sort());
  }

  return dedupe(files);
}

// A published tree can hold verbatim copies of committed sources (a docs repo's
// prose staged beside its generated pages); check each text once, at the first
// path it was found under, so reports point at the file an author edits.
async function dedupe(files) {
  const { root } = context();
  const seen = new Set();
  const unique = [];
  for (const file of files) {
    let digest;
    try {
      digest = createHash("sha1")
        .update(await fs.readFile(path.join(root, file)))
        .digest("hex");
    } catch {
      unique.push(file);
      continue;
    }
    if (seen.has(digest)) continue;
    seen.add(digest);
    unique.push(file);
  }
  return unique;
}

async function walk(directory, target, excluded, files) {
  const { root } = context();
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);

    if (
      excluded.some(
        (prefix) =>
          relative === prefix || relative.startsWith(`${prefix}${path.sep}`),
      )
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await walk(absolute, target, excluded, files);
      continue;
    }

    if (target.extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(relative);
    }
  }
}
