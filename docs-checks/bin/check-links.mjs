#!/usr/bin/env node
// Link checker for one product's statically exported documentation site (e.g.
// `docs-preview build` output), run from that product's own repo.
//
//   docs-check-links <site-dir> --base-path /origin
//   docs-check-links build/site --base-path /lambeq --no-remote
//   docs-check-links build/site --base-path /lambeq -- --verbose   (extra lychee args)
//
// Three passes, all against the built HTML:
//   1. intra-product links (root-absolute paths under the product's base path,
//      its `/<product>-assets/` and Next's `/_next/`), resolved against the
//      files on disk, INCLUDING `#fragment` anchors;
//   2. external http(s) links (skipped with --no-remote), without fragments —
//      remote anchors are often script-generated and would fail spuriously;
//   3. retired-but-working URLs (old GitHub org, old company domain).
//
// Root-absolute links to anything else — other products, the site home page,
// the product's own landing page when the site does not export one — belong to
// the central documentation site and cannot be resolved here, so they are
// skipped and counted. The central build checks them.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { packageDir } from "../src/context.mjs";
import { findRetiredUrls } from "../src/links/retired.mjs";

const LYCHEE_CONFIG = path.join(packageDir, "lychee.toml");

function parseArguments(argv) {
  const options = { site: "", basePath: "", remote: true, lychee: [] };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--") {
      options.lychee.push(...argv.slice(i + 1));
      break;
    }
    if (argument === "--base-path") options.basePath = argv[++i];
    else if (argument === "--no-remote") options.remote = false;
    else if (argument.startsWith("--"))
      throw new Error(`Unknown option: ${argument}`);
    else options.site = argument;
  }
  if (!options.site || !options.basePath) {
    throw new Error("usage: docs-check-links <site-dir> --base-path /<product>");
  }
  return options;
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function htmlFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

function lychee(args, capture = false) {
  const result = spawnSync("lychee", args, {
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const site = path.resolve(options.site);
  const product = options.basePath.split("/").filter(Boolean)[0];
  if (!product) throw new Error(`--base-path must name a product, e.g. /origin`);

  if (spawnSync("lychee", ["--version"], { stdio: "ignore" }).status !== 0) {
    console.error("error: lychee not found on PATH. Install it from https://lychee.cli.rs/");
    return 127;
  }

  const files = htmlFiles(site);
  if (files.length === 0) {
    console.error(`error: no HTML found under ${site}. Build the site first.`);
    return 1;
  }

  // lychee resolves root-absolute links against --root-dir, and a directory
  // link (Next's trailing-slash URLs) against its index.html.
  const common = [
    "--config",
    LYCHEE_CONFIG,
    "--root-dir",
    site,
    "--index-files",
    "index.html",
    ...(process.env.CI ? ["--no-progress"] : []),
  ];
  const inputs = files;

  // Every local link, to work out which top-level paths are someone else's.
  const dumped = lychee([...common, "--dump", "--scheme", "file", ...inputs], true);
  const rootUrl = pathToFileURL(site).href.replace(/\/?$/, "/");
  const owned = new Set([product, `${product}-assets`, "_next"]);
  const foreign = new Set();
  let skipped = 0;
  for (const line of dumped.stdout.split("\n")) {
    const url = line.trim().split(/\s/)[0];
    if (!url.startsWith(rootUrl)) continue;
    const segment = decodeURIComponent(url.slice(rootUrl.length).split(/[/?#]/)[0]);
    if (!owned.has(segment)) {
      foreign.add(segment);
      skipped += 1;
    }
  }

  const root = escapeRegExp(rootUrl.slice(0, -1));
  const excludes = [];
  // The site home page ("/") is always the central site's.
  excludes.push(`^${root}/?(?:[?#].*)?$`);
  const others = [...foreign].filter(Boolean);
  if (others.length > 0) {
    excludes.push(`^${root}/(?:${others.map(escapeRegExp).join("|")})(?:[/?#]|$)`);
  }
  // A product without its own landing page gets one from the central site.
  if (!fs.existsSync(path.join(site, product, "index.html"))) {
    excludes.push(`^${root}/${escapeRegExp(product)}/?(?:[?#].*)?$`);
  }
  const excludeArgs = excludes.flatMap((pattern) => ["--exclude", pattern]);

  console.log(
    `Checking ${files.length} page(s) under ${options.basePath}/` +
      (others.length > 0
        ? ` — skipping ${skipped} link(s) into the central site (${others.map((s) => `/${s}/`).join(", ")})`
        : ""),
  );

  console.log("\n== Links within the product (with #fragments) ==");
  const local = lychee([
    ...common,
    ...excludeArgs,
    "--scheme",
    "file",
    "--include-fragments",
    ...options.lychee,
    ...inputs,
  ]);

  let remote = { status: 0 };
  if (options.remote) {
    console.log("\n== External links ==");
    remote = lychee([
      ...common,
      "--scheme",
      "https",
      "--scheme",
      "http",
      ...options.lychee,
      ...inputs,
    ]);
  }

  const retired = [];
  for (const file of files) {
    const hits = findRetiredUrls(fs.readFileSync(file, "utf8"));
    if (hits.length > 0) retired.push({ file: path.relative(process.cwd(), file), hits });
  }
  if (retired.length > 0) {
    const count = retired.reduce((sum, { hits }) => sum + hits.length, 0);
    console.error(`\n${count} retired URL(s) on ${retired.length} page(s) (reported as failures):`);
    for (const { file, hits } of retired) {
      console.error(`  ${file}`);
      for (const hit of hits) console.error(`    ${hit.url}  -- ${hit.reason}`);
    }
  }

  return local.status || remote.status || (retired.length > 0 ? 1 : 0);
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
