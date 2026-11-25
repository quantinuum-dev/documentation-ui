// Single entry point for turning a file into prose segments, so the prose and
// spelling checkers cannot drift apart in what they consider prose.

import fs from "node:fs/promises";
import path from "node:path";

import { context } from "../context.mjs";
import { extractMdx } from "./extract-mdx.mjs";
import { extractTsx } from "./extract-tsx.mjs";

/**
 * @param {string} file Path relative to the checked repo's root.
 * @returns {Promise<{ source: string, segments: import("./segments.mjs").Segment[], error: string | null }>}
 */
export async function extractFile(file) {
  const { root, config } = context();
  const absolute = path.join(root, file);

  let source;
  try {
    source = await fs.readFile(absolute, "utf8");
  } catch (error) {
    return { source: "", segments: [], error: error.message };
  }

  const isTypeScript = file.endsWith(".tsx") || file.endsWith(".ts");

  try {
    const segments = isTypeScript
      ? extractTsx(source, absolute, config)
      : extractMdx(source, config, { apiReference: isApiReference(file) });
    return { source, segments, error: null };
  } catch (error) {
    return { source, segments: [], error: error.message };
  }
}

function isApiReference(file) {
  const normalised = file.split(path.sep).join("/");
  return (context().config.apiReference ?? []).some(
    (prefix) => normalised === prefix || normalised.startsWith(`${prefix}/`),
  );
}
