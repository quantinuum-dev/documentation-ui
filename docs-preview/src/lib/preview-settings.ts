import { resolveHarnessPaths } from "./paths.mjs";

const { basePath, contentDir, repoDir, generateCommand } = resolveHarnessPaths();

/** Module slug the docs publish under, e.g. "origin" for /origin/. */
const moduleName = basePath.split("/").filter(Boolean)[0] ?? "";

export const previewSettings = {
  basePath,
  moduleName,
  contentDir,
  repoDir,
  /** Whether the repo declares a notebook/API generation step (full tier). */
  hasGenerateStep: generateCommand !== null,
};
