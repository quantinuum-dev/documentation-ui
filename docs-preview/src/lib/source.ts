import fs from "node:fs";
import path from "node:path";

import { frozenNav, readNavContent } from "@quantinuum/docs-build/frozen-nav";
import { docsNavTransformer } from "@quantinuum/documentation-ui/docs-source";
import { loader } from "fumadocs-core/source";
import { docs } from "collections/server";

import { resolveHarnessPaths } from "./paths.mjs";

const { contentDir, navTitlesFile, navNestingFile, navTreeFile, basePath } = resolveHarnessPaths();

// Sidebar files a generate step produced alongside the MDX. Read from disk
// rather than imported so a repo without them just gets no overrides.
function readJson<T>(file: string): Record<string, T> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

// The sidebar the committed pages declare in their frontmatter, as the central
// build derives it. Pages the content dir doesn't have (notebooks and API pages
// until a --full run generates them) are left out rather than failing.
const declared = frozenNav({
  ...readNavContent(contentDir),
  baseUrl: basePath,
  references: fs.existsSync(path.join(contentDir, "api"))
    ? { api: `${basePath.replace(/\/$/, "")}/api` }
    : {},
  prune: true,
});

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: basePath,
  pageTree: {
    transformers: [
      docsNavTransformer({
        titles: { ...readJson<string>(navTitlesFile), ...declared.titles },
        nesting: { ...readJson<string[]>(navNestingFile), ...declared.nesting },
        tree:
          declared.tree ??
          (fs.existsSync(navTreeFile)
            ? JSON.parse(fs.readFileSync(navTreeFile, "utf8"))
            : undefined),
      }),
    ],
  },
});

/** Segments of the published URL prefix, stripped from incoming route slugs. */
export const basePathSegments = basePath.split("/").filter(Boolean);
