#!/usr/bin/env node
// Spell checker for Quantinuum documentation.
//
//   docs-check-spelling                       check the configured files (default: docs/**/*.mdx)
//   docs-check-spelling docs build/mdx        check these files/directories, in order
//   docs-check-spelling --words words.txt     also accept the words in this list
//   docs-check-spelling --api-reference dir   check dir in API-reference mode
//   docs-check-spelling --config <file>       consumer config (default: ./prose.config.mjs)
//   docs-check-spelling --keep-mask           leave the masked copies for inspection
//
// Files are parsed with remark-mdx / the TypeScript compiler and everything
// that is not reader-facing prose is blanked out before cspell sees it, so code
// fences, class names and JSX expressions are never spell-checked while prose
// inside components and attributes always is. The masked copies keep their
// original line and column layout, so cspell's positions apply unchanged to the
// real files.
//
// Company-wide vocabulary comes from this package's project-words.txt; a
// product's own list is its repo's project-words.txt, picked up automatically
// from the directory the checker runs in.

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadContext, packageDir } from "../src/context.mjs";
import { loadProductWords } from "../src/prose/dictionaries.mjs";
import { extractFile } from "../src/prose/extract.mjs";
import { discoverFiles, resolveArguments } from "../src/prose/files.mjs";
import { maskNonProse } from "../src/prose/mask.mjs";

const CSPELL_BIN = fileURLToPath(import.meta.resolve("cspell/bin.mjs"));

async function main() {
  const { root, config, argv } = await loadContext(process.argv.slice(2));
  const options = parseArguments(argv);

  const files =
    options.files.length > 0
      ? await resolveArguments(options.files)
      : await discoverFiles();

  if (files.length === 0) {
    process.stderr.write("No files to check. Build the documentation first?\n");
    return 0;
  }

  const maskRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "prose-mask-"));

  try {
    const masked = await writeMaskedCopies(files, maskRoot);
    if (masked.length === 0) return 0;

    const configFile = await writeConfig(maskRoot, root, config.words);
    const output = await runCspell(masked, maskRoot, configFile);
    process.stdout.write(rewritePaths(output.text, maskRoot));
    return output.code;
  } finally {
    if (options.keepMask) {
      process.stderr.write(`Masked copies left in ${maskRoot}\n`);
    } else {
      await fsp.rm(maskRoot, { recursive: true, force: true });
    }
  }
}

async function writeMaskedCopies(files, maskRoot) {
  const written = [];

  for (const file of files) {
    const { source, segments, error } = await extractFile(file);

    if (error) {
      process.stderr.write(`Skipping ${file}: ${error}\n`);
      continue;
    }
    if (segments.length === 0) continue;

    const target = path.join(maskRoot, file);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, maskNonProse(source, segments));
    written.push(target);
  }

  return written;
}

// A repo's own cspell.config.yaml (which should import this package's) wins, so
// the editor extension and the CLI agree; otherwise use the shared one.
function baseConfig(root) {
  const local = path.join(root, "cspell.config.yaml");
  return fs.existsSync(local)
    ? local
    : path.join(packageDir, "cspell.config.yaml");
}

// Each product's own word list is scoped to that product's pages with a cspell
// override, so a term accepted for one product does not mask a typo in another.
// Lists passed with --words apply to every file.
async function writeConfig(maskRoot, root, words) {
  const base = baseConfig(root);
  const products = await loadProductWords();
  if (products.size === 0 && words.length === 0) return base;

  const dictionaryName = (label) => `${label.replace(/[^\w-]/g, "-")}-words`;
  const extra = words.map((file, i) => ({
    name: dictionaryName(`extra-${i}`),
    path: file,
  }));

  const overrides = [...products].map(([module, { file }]) => {
    const name = dictionaryName(module);
    return {
      filename: `**/generated/${module}/**`,
      dictionaryDefinitions: [{ name, path: file }],
      dictionaries: [name],
    };
  });

  const generated = path.join(maskRoot, "cspell.generated.json");
  await fsp.writeFile(
    generated,
    JSON.stringify(
      {
        version: "0.2",
        import: [base],
        dictionaryDefinitions: extra,
        dictionaries: extra.map(({ name }) => name),
        overrides,
      },
      null,
      2,
    ),
  );
  return generated;
}

// cspell resolves `dictionaryDefinitions` paths relative to the config file, so
// importing the real config keeps its word lists working from the temp
// directory. Files are passed explicitly because the config's globs describe
// the real tree, not the mask.
function runCspell(files, maskRoot, configFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        CSPELL_BIN,
        "lint",
        "--config",
        configFile,
        "--no-progress",
        "--no-must-find-files",
        "--show-suggestions",
        "--relative",
        ...files,
      ],
      { cwd: maskRoot },
    );

    let text = "";
    child.stdout.on("data", (chunk) => {
      text += chunk;
    });
    child.stderr.on("data", (chunk) => {
      text += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ text, code: code ?? 0 }));
  });
}

// Report against the real files rather than the throwaway mask.
function rewritePaths(text, maskRoot) {
  return text
    .split(maskRoot + path.sep)
    .join("")
    .split(maskRoot)
    .join(".");
}

function parseArguments(argv) {
  const options = { files: [], keepMask: false };

  for (const argument of argv) {
    if (argument === "--keep-mask") options.keepMask = true;
    else if (argument.startsWith("--"))
      throw new Error(`Unknown option: ${argument}`);
    else options.files.push(argument);
  }

  return options;
}

process.exitCode = await main();
