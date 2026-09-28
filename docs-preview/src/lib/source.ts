import fs from "node:fs";

import { docsNavTransformer } from "@quantinuum/documentation-ui/docs-source";
import { loader } from "fumadocs-core/source";
import { docs } from "collections/server";

import { resolveHarnessPaths } from "./paths.mjs";

const { navTitlesFile, navNestingFile, basePath } = resolveHarnessPaths();

// Sidebar labels and nesting produced alongside the MDX. Read from disk rather
// than imported so a repo without the files just gets no overrides instead of a
// build error.
function readJson<T>(file: string): Record<string, T> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: basePath,
  pageTree: {
    transformers: [
      docsNavTransformer({
        titles: readJson<string>(navTitlesFile),
        nesting: readJson<string[]>(navNestingFile),
      }),
    ],
  },
});

/** Segments of the published URL prefix, stripped from incoming route slugs. */
export const basePathSegments = basePath.split("/").filter(Boolean);
