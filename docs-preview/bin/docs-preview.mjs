#!/usr/bin/env node
// Runs the Fumadocs preview harness against a documentation repo's committed MDX.
//
//   docs-preview dev            fast tier  — serve the committed MDX as-is
//   docs-preview dev --full     full tier  — run the repo's generate step first
//   docs-preview build [--full] static export of the same, written to
//                               <repo>/build/site (or --out-dir <dir>)
//
// Invoke from the module repo root (or pass --repo <dir>).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveHarnessPaths } from "../src/lib/paths.mjs";

const require = createRequire(import.meta.url);
const harnessDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const command = argv.find((a) => !a.startsWith("-")) ?? "dev";
const full = argv.includes("--full");

function flagValue(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const repoDir = path.resolve(flagValue("--repo") ?? process.cwd());
if (flagValue("--content")) process.env.DOCS_CONTENT_DIR = path.resolve(flagValue("--content"));
process.env.DOCS_REPO_DIR = repoDir;

const paths = resolveHarnessPaths(repoDir);
const exporting = command === "build";
const outDir = path.resolve(repoDir, flagValue("--out-dir") ?? path.join("build", "site"));

if (full) {
  if (paths.generateCommand) {
    console.log(`docs-preview: regenerating derived pages — ${paths.generateCommand}`);
    const generated = spawnSync(paths.generateCommand, {
      cwd: paths.repoDir,
      shell: true,
      stdio: "inherit",
      // The harness depends on @quantinuum/docs-build, so `docs-build` resolves
      // in a repo's generate command without the repo installing anything.
      env: {
        ...process.env,
        PATH: [path.join(harnessDir, "node_modules", ".bin"), process.env.PATH].join(
          path.delimiter,
        ),
      },
    });
    if (generated.status !== 0) process.exit(generated.status ?? 1);
  } else {
    // Prose-only repos (e.g. Origin) have nothing code-derived to rebuild, so the
    // two tiers are identical; say so rather than failing.
    console.log("docs-preview: no generate step declared; --full is equivalent to the fast tier.");
  }
}

if (!fs.existsSync(paths.contentDir)) {
  console.error(
    `docs-preview: no documentation found at ${paths.contentDir}\n` +
      (paths.generateCommand
        ? "This repo generates its pages; run with --full first."
        : "Pass --content <dir>, or add a docs-preview.config.json with a contentDir."),
  );
  process.exit(1);
}

// The MDX references assets by root-absolute URL (e.g. /origin-assets/…), which
// Next only serves from this package's own public/. Link the repo's assets in
// for dev; copy them for an export, which must be self-contained. Asset folders
// are recreated rather than linked so downloads can be added inside them.
function stageAssets() {
  const publicDir = path.join(harnessDir, "public");
  fs.mkdirSync(publicDir, { recursive: true });
  for (const entry of fs.readdirSync(publicDir)) {
    if (entry === ".gitkeep") continue;
    fs.rmSync(path.join(publicDir, entry), { recursive: true, force: true });
  }
  /** @param {string} from @param {string} to */
  const place = (from, to) => {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (exporting) fs.cpSync(from, to, { recursive: true });
    else fs.symlinkSync(from, to);
  };
  if (fs.existsSync(paths.publicDir)) {
    /** @param {string} from @param {string} to @param {boolean} [inDownloads] */
    const placeTree = (from, to, inDownloads = false) => {
      for (const child of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, child.name);
        const dest = path.join(to, child.name);
        // `_downloads` gets repo files added below, so no part of it can be a link into the repo.
        if (child.isDirectory() && (inDownloads || child.name === "_downloads")) {
          placeTree(src, dest, true);
        } else {
          place(src, dest);
        }
      }
    };
    for (const entry of fs.readdirSync(paths.publicDir, { withFileTypes: true })) {
      const from = path.join(paths.publicDir, entry.name);
      if (entry.isDirectory()) placeTree(from, path.join(publicDir, entry.name));
      else place(from, path.join(publicDir, entry.name));
    }
  }
  stageDownloads(publicDir, place);
}

// Downloads link files elsewhere in the repo (`/<x>-assets/_downloads/<path>`,
// relative to the docs dir's parent), which the build stages rather than the
// repo committing a copy; stage them the same way.
/** @param {string} publicDir @param {(from: string, to: string) => void} place */
function stageDownloads(publicDir, place) {
  const root = path.dirname(paths.contentDir);
  const url = /\/([\w.-]+-assets)\/_downloads\/([^\s)"'<>{}]+)/g;
  /** @type {Set<string>} */
  const seen = new Set();
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "public" && !entry.name.startsWith(".")) walk(full);
        continue;
      }
      if (!/\.mdx?$/.test(entry.name)) continue;
      for (const [, assets, rel] of fs.readFileSync(full, "utf8").matchAll(url)) {
        const file = decodeURI(rel);
        const to = path.join(publicDir, assets, "_downloads", file);
        if (seen.has(to) || fs.existsSync(to)) continue;
        seen.add(to);
        const from = path.join(root, file);
        if (fs.existsSync(from)) place(from, to);
        else console.warn(`docs-preview: download not found in the repo: ${file}`);
      }
    }
  };
  if (fs.existsSync(paths.contentDir)) walk(paths.contentDir);
}
stageAssets();

console.log(
  `docs-preview: serving ${paths.contentDir} at ${paths.basePath} (${full ? "full" : "fast"} tier)`,
);

const nextBin = require.resolve("next/dist/bin/next");
if (exporting) fs.rmSync(path.join(harnessDir, "out"), { recursive: true, force: true });
const passthrough = argv.filter((a) => a !== command && a !== "--full");
for (const flag of ["--repo", "--content", "--out-dir"]) {
  const i = passthrough.indexOf(flag);
  if (i >= 0) passthrough.splice(i, 2);
}

const child = spawn(process.execPath, [nextBin, command, ...passthrough], {
  cwd: harnessDir,
  stdio: "inherit",
  env: {
    ...process.env,
    DOCS_REPO_DIR: paths.repoDir,
    DOCS_CONTENT_DIR: paths.contentDir,
    DOCS_PUBLIC_DIR: paths.publicDir,
    DOCS_NAV_TITLES: paths.navTitlesFile,
    DOCS_NAV_NESTING: paths.navNestingFile,
    DOCS_BASE_PATH: paths.basePath,
    ...(exporting ? { DOCS_PREVIEW_EXPORT: "1" } : {}),
  },
});
child.on("exit", (code) => {
  if (code === 0 && exporting) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.cpSync(path.join(harnessDir, "out"), outDir, { recursive: true });
    console.log(`docs-preview: static site written to ${outDir}`);
  }
  process.exit(code ?? 0);
});
