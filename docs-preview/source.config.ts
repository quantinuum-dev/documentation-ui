import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { docsMdxOptions } from "@quantinuum/documentation-ui/docs-config";

import { resolveHarnessPaths } from "./src/lib/paths.mjs";

// Content lives in the module repo being previewed, not in this package, so the
// collection directory is resolved at config-load time from DOCS_CONTENT_DIR
// (set by the `docs-preview` CLI) and falls back to a `docs/` dir beside the cwd.
export const docs = defineDocs({
  dir: resolveHarnessPaths().contentDir,
});

// The MDX pipeline is the shared one the central site uses, so a page previewed
// here compiles exactly as it will when published.
export default defineConfig({
  mdxOptions: docsMdxOptions,
});
