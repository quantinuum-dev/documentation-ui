// Resolves the word lists used by both checkers.
//
// Vocabulary that spans products lives in this package's project-words.txt.
// Vocabulary specific to one product lives in a file of the same name in that
// product's own documentation repository, so the team that owns the docs owns
// the list, and it travels with the source rather than with the build.

import fs from "node:fs/promises";
import path from "node:path";

import { context, PRODUCT_WORDS_FILE } from "../context.mjs";

/** Product a checked file belongs to, or null when no product list applies. */
export function moduleForFile(file) {
  const [root, module] = file.split(path.sep);
  return root === "generated" && module ? module : null;
}

export async function readWordList(absolute) {
  try {
    const contents = await fs.readFile(absolute, "utf8");
    return contents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    return null;
  }
}

/** Company-wide words plus any list applied to every file (`--words`). */
export async function loadBaseWords() {
  const { config } = context();
  const words = [];
  for (const file of [config.dictionary, ...config.words]) {
    words.push(...((await readWordList(file)) ?? []));
  }
  return words;
}

/**
 * Product word lists that actually exist. A product without one is simply
 * absent from the map — the file is optional, and a missing documentation
 * checkout must not fail the run.
 *
 * @returns {Promise<Map<string, { file: string, words: string[] }>>}
 */
export async function loadProductWords() {
  const { root, config } = context();
  const found = new Map();

  for (const [module, repo] of Object.entries(
    config.productDictionaries ?? {},
  )) {
    const file = path.resolve(root, repo, PRODUCT_WORDS_FILE);
    const words = await readWordList(file);
    if (words) found.set(module, { file, words });
  }

  return found;
}
