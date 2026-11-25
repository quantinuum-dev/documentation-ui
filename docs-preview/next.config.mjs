import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";

import { resolveHarnessPaths } from "./src/lib/paths.mjs";

const { contentDir, repoDir } = resolveHarnessPaths();
const harnessDir = import.meta.dirname;

// The previewed MDX lives in the module repo, outside this package, so Turbopack
// needs its resolution root raised to the nearest common ancestor of the two.
function commonAncestor(a, b) {
  let root = a;
  while (root !== b && !b.startsWith(root + path.sep)) {
    const parent = path.dirname(root);
    if (parent === root) break;
    root = parent;
  }
  return root;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This package is a harness, not an authored app; don't scatter AGENTS.md /
  // CLAUDE.md into it (or into a consuming repo's checkout).
  agentRules: false,
  turbopack: {
    root: commonAncestor(harnessDir, contentDir),
  },
  experimental: {
    externalDir: true,
  },
  env: {
    DOCS_REPO_DIR: repoDir,
    DOCS_CONTENT_DIR: contentDir,
  },
  // Matches the central site so previewed URLs are the published URLs.
  trailingSlash: true,
  // `docs-preview build` publishes a static site (e.g. as a CI artifact) that
  // any file server can host; images are served as-is since there is no
  // optimisation server behind it.
  ...(process.env.DOCS_PREVIEW_EXPORT
    ? { output: "export", images: { unoptimized: true } }
    : {}),
};

export default createMDX({ configPath: "source.config.ts" })(nextConfig);
