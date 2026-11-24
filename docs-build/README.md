# @quantinuum/docs-build

Converts Sphinx RST/MyST, Jupyter notebooks and quartodoc API reference into
Fumadocs MDX. CLI usage is at the top of [`bin/docs-build.mjs`](bin/docs-build.mjs);
module options are the `DocsModule` typedef in [`src/generate.mjs`](src/generate.mjs).

## Porting a product's prose from RST to committed MDX

The aim is for the product repo to author MDX directly, with each page's git
history (`git log --follow`, `git blame`) continuing back through its RST.

### 1. Parallel period: RST is still the source

- **Freeze** the RST pages into the product's docs dir with the module's `freeze`
  option (`pages` globs, `outDir`, optional `exclude`, `nav`). In central-build-qd
  (module listed in `BACKPORTED_DOCS`), from `base/landing-pages`:

  ```sh
  env GEN_MODULES=inquanto DOCS_FREEZE='inquanto:manual/**' node scripts/generate-docs.mjs
  ```

  `DOCS_FREEZE_NAV=1` also writes the sidebar. Each freeze writes the pages,
  `_name.mdx` partials for `.. include::`d files, the images they use under
  `public/<module>-assets/`, and `freeze-sources.json` (frozen file -> source).
  Citations become `[](cite:p#key1,key2)` (parenthetical) or `[](cite:t#key)`
  (textual) links and the bibliography page a `<Bibliography />` placeholder;
  both are filled in at build time from `references.bib`, which the freeze
  copies beside the pages. Figures aren't numbered in the MDX: with the module's
  `numfig` option the root `meta.json` gets `"numfig": true`, the site numbers
  captioned `<figure>`s, and `:numref:` becomes `[](#label)`, which the site
  fills in with `Fig. N`.
- Commit the frozen MDX **next to** the RST on the port branch.
- **Never hand-edit the frozen files.** Fix the RST (or the converter) and
  re-freeze. After merging develop into the branch, re-freeze and commit; the
  RST merges cleanly and the MDX is simply regenerated.

### 2. Cutover: the last step before merging back

1. Re-freeze everything, commit, and make sure the working tree is clean.
2. `docs-build cutover <docs dir> --dry-run` to review, then without `--dry-run`.

It makes three commits from `freeze-sources.json`:

| Commit | Change | Why |
| --- | --- | --- |
| A | `git rm` the frozen files | B's targets must be new paths, or git reads a rewrite, not a rename |
| B | `git mv` each source onto its frozen path, content unchanged | an exact (R100) rename that history follows |
| C | restore the frozen content | the conversion, as an ordinary edit |

A single commit loses the history: converted files are only ~10-35% similar to
their RST, below git's 50% rename threshold. Images still mentioned by another
tracked file (a notebook, an unconverted page) stay in place; the MDX keeps its
own copy. If it stops part-way it prints the `git reset --hard` that undoes it.
If develop changes after the cutover, reset to before A, merge develop,
re-freeze, and run it again.

Afterwards, remove the RST that was not converted (`conf.py`, `api/*.rst`,
toctree-only index pages) in a separate commit and switch the build over.

### 3. Merging into develop

Use a **merge commit** or **rebase and merge**, never squash: squashing folds A,
B and C into one commit and the renames are lost. Check with
`git log --follow --name-status <page>.mdx`, which should show
`R100 <page>.rst <page>.mdx`.
