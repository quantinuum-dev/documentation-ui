// @ts-check
import fs from "node:fs";
import path from "node:path";

const CONFIG_FILE = "docs-preview.config.json";

/**
 * @typedef {object} DocsPreviewConfig
 * @property {string} [contentDir] MDX + meta.json root, relative to the repo.
 * @property {string} [publicDir] Static assets root, relative to the repo.
 * @property {string} [navTitles] Sidebar-label map, relative to the repo.
 * @property {string} [navNesting] Sidebar parent -> children map, relative to the repo.
 * @property {string} [basePath] URL prefix the published docs are served under.
 * @property {string} [generate] Command regenerating notebook/API MDX (full tier).
 */

/**
 * @typedef {object} HarnessPaths
 * @property {string} repoDir
 * @property {string} contentDir
 * @property {string} publicDir
 * @property {string} navTitlesFile
 * @property {string} navNestingFile
 * @property {string} basePath
 * @property {string | null} generateCommand
 */

/**
 * @param {string} repoDir
 * @returns {DocsPreviewConfig}
 */
function readConfig(repoDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoDir, CONFIG_FILE), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Resolve everything the harness needs to preview a module repo. Environment
 * variables win (the CLI sets them), then `docs-preview.config.json` at the repo
 * root, then conventional defaults — so a repo laid out as `docs/` with
 * `docs/nav-titles.json` and `docs/public/` needs no config file at all.
 *
 * @param {string} [cwd]
 * @returns {HarnessPaths}
 */
export function resolveHarnessPaths(cwd = process.env.DOCS_REPO_DIR || process.cwd()) {
  const repoDir = path.resolve(cwd);
  const config = readConfig(repoDir);

  const contentDir = process.env.DOCS_CONTENT_DIR
    ? path.resolve(process.env.DOCS_CONTENT_DIR)
    : path.resolve(repoDir, config.contentDir ?? "docs");

  const publicDir = process.env.DOCS_PUBLIC_DIR
    ? path.resolve(process.env.DOCS_PUBLIC_DIR)
    : path.resolve(repoDir, config.publicDir ?? path.join(config.contentDir ?? "docs", "public"));

  const navTitlesFile = process.env.DOCS_NAV_TITLES
    ? path.resolve(process.env.DOCS_NAV_TITLES)
    : path.resolve(repoDir, config.navTitles ?? path.join(config.contentDir ?? "docs", "nav-titles.json"));

  const navNestingFile = process.env.DOCS_NAV_NESTING
    ? path.resolve(process.env.DOCS_NAV_NESTING)
    : path.resolve(repoDir, config.navNesting ?? path.join(config.contentDir ?? "docs", "nav-nesting.json"));

  return {
    repoDir,
    contentDir,
    publicDir,
    navTitlesFile,
    navNestingFile,
    // Published docs live under /<module>/; previewing at the same prefix keeps
    // the root-absolute asset URLs in the MDX resolvable without rewriting them.
    basePath: process.env.DOCS_BASE_PATH ?? config.basePath ?? "/",
    generateCommand: process.env.DOCS_GENERATE ?? config.generate ?? null,
  };
}
