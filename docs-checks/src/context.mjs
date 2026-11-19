// Resolves what a checker run looks at: the consuming repo's root, the house
// style merged with the repo's own `prose.config.mjs`, and any word lists or API
// reference trees named on the command line.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import houseStyle from "../prose.config.mjs";

export const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Company-wide vocabulary, shared by every repo. */
export const companyWords = path.join(packageDir, "project-words.txt");

/** Name of a product's own word list, at the root of its docs repo. */
export const PRODUCT_WORDS_FILE = "project-words.txt";

/**
 * @typedef {import("./prose/types.mjs").ProseConfig & {
 *   productDictionaries: Record<string, string>,
 *   words: string[],
 * }} CheckConfig
 */

/** @type {{ root: string, config: CheckConfig } | undefined} */
let current;

/** The context loaded by `loadContext`. */
export function context() {
  if (!current) throw new Error("loadContext() has not been called");
  return current;
}

/**
 * Pull the shared options out of `argv`, leaving the checker-specific ones.
 *
 *   --config <file>          consumer config (default: ./prose.config.mjs if present)
 *   --words <file>           extra word list applied to every file (repeatable);
 *                            ./project-words.txt is always included when present
 *   --api-reference <path>   tree checked in API-reference mode (repeatable)
 *
 * @param {string[]} argv
 */
export async function loadContext(argv) {
  /** @type {string[]} */
  const rest = [];
  let configFile;
  /** @type {string[]} */
  const words = [];
  /** @type {string[]} */
  const apiReference = [];

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--config") configFile = argv[++i];
    else if (argument === "--words") words.push(argv[++i]);
    else if (argument === "--api-reference") apiReference.push(argv[++i]);
    else rest.push(argument);
  }

  const defaultConfig = path.resolve("prose.config.mjs");
  if (!configFile && fs.existsSync(defaultConfig)) configFile = defaultConfig;

  const root = configFile ? path.dirname(path.resolve(configFile)) : process.cwd();
  const consumer = configFile
    ? (await import(pathToFileURL(path.resolve(configFile)).href)).default
    : {};

  const cwdRelative = (/** @type {string} */ entry) =>
    path.relative(root, path.resolve(entry)).split(path.sep).join("/");

  // A product repo's own word list, by convention at its root.
  const localWords = path.join(root, PRODUCT_WORDS_FILE);

  /** @type {CheckConfig} */
  const config = {
    ...houseStyle,
    include: [{ dir: "docs", extensions: [".mdx"], kind: "mdx" }],
    exclude: [],
    productDictionaries: {},
    ...consumer,
    dictionary: companyWords,
    harper: {
      ...houseStyle.harper,
      ...consumer.harper,
      rules: { ...houseStyle.harper?.rules, ...consumer.harper?.rules },
    },
    words: [
      ...(fs.existsSync(localWords) ? [localWords] : []),
      ...(consumer.words ?? []).map((/** @type {string} */ file) =>
        path.resolve(root, file),
      ),
      ...words.map((file) => path.resolve(file)),
    ],
    apiReference: [
      ...(consumer.apiReference ?? []),
      ...apiReference.map(cwdRelative),
    ],
  };

  current = { root, config };
  return { root, config, argv: rest };
}
