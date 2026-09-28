#!/usr/bin/env node
// Builds a documentation repo's generated pages (notebooks, API reference) into
// Fumadocs MDX, alongside any committed MDX prose.
//
//   docs-build                      use ./docs-build.config.json
//   docs-build --config <file>      use another config
//   docs-build --skip-api           reuse the existing quartodoc output
//
// Config (paths are relative to the config file):
//   {
//     "outDir": "build/mdx",
//     "modules": [{
//       "name": "lambeq",
//       "sourceDir": "docs",              // notebooks + index live here
//       "indexFile": "index.rst",
//       "mergedProse": "docs",            // committed MDX staged into the output
//       "quartodoc": "quartodoc",         // quartodoc project (uv) to build
//       "apiSource": "quartodoc/reference"
//     }]
//   }
//
// Output: <outDir>/content/<name>/** (MDX + meta.json),
// <outDir>/content/<name>-{nav-titles,nav-nesting,xref-manifest}.json and
// <outDir>/public/<name>-assets/**. Any other module field is passed through
// to the converter unchanged (see DocsModule in src/generate.mjs).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { convertModules } from "../src/generate.mjs";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quartodocCommon = path.join(packageDir, "quartodoc");

const argv = process.argv.slice(2);
const configIndex = argv.indexOf("--config");
const configFile = path.resolve(
  configIndex >= 0 ? argv[configIndex + 1] : "docs-build.config.json",
);
const skipApi = argv.includes("--skip-api");

if (!fs.existsSync(configFile)) {
  console.error(`docs-build: no config found at ${configFile}`);
  process.exit(1);
}

const configDir = path.dirname(configFile);
const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
/** @param {string | undefined} p */
const resolve = (p) => (p ? path.resolve(configDir, p) : undefined);

const outDir = resolve(config.outDir ?? "build/mdx");

const modules = (config.modules ?? []).map((entry) => {
  const { sourceDir, quartodoc, ...rest } = entry;
  return {
    contentSubdir: "",
    ...rest,
    sphinxRoot: resolve(sourceDir),
    mergedProse: resolve(entry.mergedProse),
    apiSource: resolve(entry.apiSource) ?? null,
    doxygen: entry.doxygen
      ? { ...entry.doxygen, input: resolve(entry.doxygen.input) }
      : undefined,
    quartodoc: resolve(quartodoc),
  };
});

for (const mod of modules) {
  if (!mod.quartodoc || skipApi) continue;
  console.log(`docs-build: ${mod.name}: building the API reference (quartodoc)`);
  fs.rmSync(path.join(mod.quartodoc, "reference"), { recursive: true, force: true });
  // build_api.py imports the shared renderer patches from this package.
  const result = spawnSync("uv", ["run", "--frozen", "python", "build_api.py"], {
    cwd: mod.quartodoc,
    stdio: "inherit",
    env: {
      ...process.env,
      PYTHONPATH: [quartodocCommon, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    },
  });
  if (result.error) {
    console.error(`docs-build: could not run uv: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

convertModules(
  modules.map(({ quartodoc, ...mod }) => mod),
  {
    outputRoot: path.join(outDir, "content"),
    publicRoot: path.join(outDir, "public"),
    cacheRoot: outDir,
    logRoot: configDir,
  },
);
