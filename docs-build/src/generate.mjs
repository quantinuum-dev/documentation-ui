// @ts-check
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import GithubSlugger from "github-slugger";

/**
 * Sphinx/RST/MyST/notebook -> MDX converter for the Quantinuum documentation.
 *
 * Shared by the central documentation site (every product) and by each product's
 * own repository (the pages it still generates from code — notebooks and the
 * API reference — around its committed MDX prose). See `convertModules`.
 *
 * Writes clean, committable MDX + `meta.json` nav files into a generated tree.
 * The transforms are MATERIALISED here (not applied as build-time-only remark
 * plugins), so backporting a module is just promoting these files into its docs
 * repo and retiring the RST; only rendering concerns (Shiki, math, slugs) stay
 * in the Fumadocs config.
 *
 * Per-page pipeline: pandoc (RST -> commonmark_x) -> resolveRoles (`:ref:`/`:doc:`
 * -> Fumadocs links) -> imageTransform (stage assets -> public/, rewrite src) ->
 * calloutTransform (admonition alerts -> <Callout>) -> tabsTransform (sphinx-tabs
 * divs -> <Tabs>/<Tab>) -> mdxSafe (neutralise remaining pandoc-only constructs)
 * -> frontmatter. `commonmark_x` is used because it preserves the role/class info
 * (`:ref:` as `{.interpreted-text role="ref"}`) that resolveRoles needs.
 *
 * Still TODO for later Phase 2 increments: sphinx_design cards/grids (unused in
 * origin; needed when rolling out to modules that use them).
 */

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// Roots for the current `convertModules` run (see its options).
let outputRoot = "";
let publicRoot = "";
let cacheRoot = "";
let logRoot = "";

/**
 * One documentation module to convert. Its Sphinx tree is converted into
 * `<outputRoot>/<routeBase>/` (served at `/<routeBase>`) and its images into
 * `<publicRoot>/<name>-assets/`.
 *
 * @typedef {object} DocsModule
 * @property {string} name
 * @property {string} sphinxRoot Absolute path to the module's docs source tree.
 * @property {string} contentSubdir Subtree to convert ("" = the whole tree).
 * @property {string} indexFile Root toctree file, relative to `sphinxRoot`.
 * @property {string | null} apiSource Directory of quartodoc `.qmd` pages (null = no API docs).
 * @property {string} [apiIndexFile] Prose overview for the API landing.
 * @property {string[]} [apiProsePages] Prose pages served alongside an API-only module.
 * @property {string} [apiTitle] API sidebar folder label.
 * @property {boolean} [markdown] Prose is MyST markdown rather than RST.
 * @property {string[]} [skipDirs] Module-specific directories to skip.
 * @property {string} [outPrefix] Nest output + URLs under `<name>/<outPrefix>`.
 * @property {string} [routeBase] Explicit output/URL base (wins over outPrefix).
 * @property {boolean} [emitIndex] Publish the root index as the module landing.
 * @property {boolean} [apiOnly] No prose; the whole sidebar comes from the API.
 * @property {string} [apiSubdir] Where API pages land under routeBase (default "api").
 * @property {{ input: string, filePatterns?: string }} [doxygen] C headers rendered via Doxygen.
 * @property {string} [mergedProse] Absolute path to committed MDX prose (a `merged`
 *   backport): it is staged into the output and only notebooks/API are rebuilt.
 * @property {NotebookExecution} [execute] Execute notebooks (and MyST-NB `.md`
 *   pages) at build time instead of rendering only their stored outputs.
 */

/**
 * Build-time notebook execution, mirroring myst-nb's `nb_execution_mode = "cache"`.
 * Every `.ipynb` and MyST-NB page (`file_format: mystnb`) not matched by `exclude`
 * is run by execute_notebooks.py inside the product's uv project, and the results
 * are cached under `<cacheRoot>/.nb-exec/<module>/` keyed on each source's hash.
 *
 * @typedef {object} NotebookExecution
 * @property {string} project Absolute path to the uv project providing the kernel
 *   environment (it must include nbclient and ipykernel).
 * @property {string[]} [exclude] Sphinx-style globs, relative to `sphinxRoot`, of
 *   sources to leave unexecuted (`nb_execution_excludepatterns`).
 * @property {number} [timeout] Per-cell timeout in seconds (default 120).
 */

// The module currently being converted (set by convertModule); module-specific
// helpers read it instead of threading a context through every signature.
/** @type {DocsModule & { routeBase: string, apiSubdir: string, assetSubdir: string, assetRoot: string }} */
let M;

// `version.rst` files are include-only partials (skipped); `api/` is Sphinx
// autodoc (needs quartodoc, not pandoc) — skipped until the API pipeline lands.
// `README.md`/`DEVELOPMENT.md` are repo docs (excluded by Sphinx conf), never pages.
const SKIP_BASENAMES = new Set(["version.rst", "README.md", "DEVELOPMENT.md"]);

/**
 * Recursively collect convertible source files (prose + `.ipynb` notebooks) under
 * `dir`, skipping build/theme dirs and Sphinx autodoc (`api/`, which needs
 * quartodoc, not pandoc). Prose is `.rst` by default, or `.md` for MyST-markdown
 * modules (`M.markdown`); `M.skipDirs` adds module-specific excludes.
 * @param {string} dir @param {string[]} out
 */
function collectRst(dir, out) {
  const SKIP_DIRS = new Set([
    ".venv",
    ".git",
    ".github",
    "quantinuum-sphinx",
    "_static",
    "_templates",
    "_build",
    "api",
    // A backported module keeps its staged images and `{download}` copies in
    // `public/`; those are build output, not source pages to convert again.
    "public",
    ...(M?.skipDirs ?? []),
  ]);
  const proseExt = M?.markdown ? ".md" : ".rst";
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectRst(full, out);
    } else if (
      (entry.name.endsWith(proseExt) || entry.name.endsWith(".ipynb")) &&
      !SKIP_BASENAMES.has(entry.name)
    ) {
      out.push(full);
    }
  }
}

/** Resolve Sphinx `.. only:: <expr>` blocks for web output: unwrap `html`
 * blocks (keep + de-indent their body) and drop the rest (`pdf`, `latex`, ...).
 * @param {string} text @returns {string} */
function resolveOnlyBlocks(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)\.\.\s+only::\s*(.+?)\s*$/);
    if (!m) {
      out.push(lines[i]);
      continue;
    }
    const indent = m[1].length;
    const keep = /\bhtml\b/.test(m[2]) && !/\bnot\s+html\b/.test(m[2]);
    /** @type {string[]} */
    const body = [];
    for (i += 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "" || line.match(/^(\s*)/)[1].length > indent) {
        body.push(line);
        continue;
      }
      break; // dedent ends the directive block
    }
    i -= 1;
    if (!keep) continue; // drop pdf/latex/etc. bodies entirely
    const dents = body
      .filter((l) => l.trim() !== "")
      .map((l) => l.search(/\S/));
    const trim = dents.length ? Math.min(...dents) : 0;
    for (const l of body) out.push(l.trim() === "" ? "" : l.slice(trim));
  }
  return out.join("\n");
}

/** Remove `.. toctree::` directive blocks (directive line + options + entries).
 * Navigation comes from the sidebar/meta.json, so an in-body toctree would just
 * render as garbled escaped text.
 * @param {string} text @returns {string} */
function stripToctrees(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)\.\.\s+toctree::/);
    if (!m) {
      out.push(lines[i]);
      continue;
    }
    const indent = m[1].length;
    for (i += 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() !== "" && line.match(/^(\s*)/)[1].length <= indent) break;
    }
    i -= 1; // re-examine the dedented line on the next iteration
  }
  return out.join("\n");
}

/** Insert a blank line between a `.. _label:` hyperlink target and a directive
 * that immediately follows it. Without the blank line pandoc folds the directive
 * into the target and DROPS it, so labelled `.. figure::` images and
 * `.. csv-table::` tables vanish (docutils tolerates the missing blank line).
 * @param {string} text @returns {string} */
function separateLabelDirectives(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    if (
      /^\.\.\s+_[^:]+:\s*$/.test(lines[i]) &&
      /^\s*\.\.\s+[A-Za-z][\w-]*::/.test(lines[i + 1] ?? "")
    ) {
      out.push("");
    }
  }
  return out.join("\n");
}

/** Rewrite sphinxcontrib-bibtex `:cite:*:` roles to placeholder roles that pandoc
 * preserves. Pandoc's RST reader recognises `cite`/`citep`/`citet` and silently
 * reduces them to their bare key text, so resolveRoles never sees them; renaming
 * to `bibref` (parenthetical) / `bibreft` (textual) keeps the interpreted-text
 * span intact for later resolution.
 * @param {string} text @returns {string} */
function rewriteCiteRoles(text) {
  return text.replace(
    /:cite:(?:(\w+):)?`([^`]+)`/g,
    (_full, subtype, keys) =>
      `:${subtype === "t" || subtype === "ts" ? "bibreft" : "bibref"}:\`${keys}\``,
  );
}

/** @param {string} src @returns {string} */
/** Unwrap pandoc's labeled-equation output. A `.. math::` with a `:label:`
 * becomes `[$$…$$]{label="id"}`; the `{label=…}` attribute is not a valid MDX
 * attribute span (mdxSafe only strips `.`/`#` spans) and MDX parses it as an
 * undefined `label` expression, crashing the page. Drop the wrapper and keep the
 * bare math (equation numbering/`:eq:` refs are not reproduced).
 * @param {string} md @returns {string} */
function resolveMathLabels(md) {
  return md.replace(
    /\[([\s\S]*?)\]\{[^}]*\blabel="[^"]+"[^}]*\}/g,
    (_m, body) => body,
  );
}

/** Rewrite jupyter_sphinx directives so pandoc renders them as code blocks. The
 * docs embed executable Python in RST prose via `.. jupyter-execute::` (281×);
 * we don't execute RST, so each becomes a `.. code-block:: python` showing its
 * source (no output). `.. jupyter-input::` -> python, `.. jupyter-output::` ->
 * a plain-text output block. Directive option lines (`:hide-output:`, …) are
 * dropped; the indented body is kept for pandoc to fence.
 * @param {string} text @returns {string} */
function resolveJupyterDirectives(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      /^(\s*)\.\.\s+jupyter-(execute|input|output)::[ \t]*(.*)$/,
    );
    if (!m) {
      out.push(lines[i]);
      continue;
    }
    const lang = m[2] === "output" ? "text" : "python";
    out.push(`${m[1]}.. code-block:: ${lang}`);
    // Drop the directive's option lines (`:key:` / `:key: value`) that follow
    // it directly; the blank line + indented body are left for pandoc.
    let j = i + 1;
    while (j < lines.length && /^\s+:[\w-]+:/.test(lines[j])) j++;
    i = j - 1;
  }
  return out.join("\n");
}

/** Column at which the body text of the last non-blank emitted line starts — the
 * line's own indent, or the position after a bullet/enumerated marker.
 * @param {string[]} lines @returns {number} */
function precedingIndent(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === "") continue;
    const m = lines[i].match(/^(\s*)(?:[*+-]|\(?\w{1,3}[.)])\s+/);
    return m ? m[0].length : lines[i].match(/^\s*/)[0].length;
  }
  return 0;
}

/** Inline RST `.. include:: <file>` directives before pandoc so our RST
 * preprocessors (jupyter-execute conversion, label spacing, …) also apply to
 * included partials (`.rst.inc`); paths resolve relative to the including file's
 * dir, recursively. A `:literal:`/`:code:` include is instead re-emitted as a
 * `.. code-block::` holding the file verbatim — pandoc ignores those options and
 * splices the raw text into the surrounding prose, which shreds the enclosing
 * list/paragraph. Missing files are dropped (the inquanto source has one stale
 * include). InQuanto's `.rst.inc` partials contain no images/nested includes, so
 * textual inlining is safe.
 * @param {string} text @param {string} dir @param {number} [depth]
 * @returns {string} */
function inlineIncludes(text, dir, depth = 0) {
  if (depth > 12) return text;
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)\.\.\s+include::\s*(\S+)\s*$/);
    if (!m) {
      out.push(lines[i]);
      continue;
    }
    const [, indent, target] = m;
    /** @type {Map<string, string>} */
    const opts = new Map();
    let j = i + 1;
    for (; j < lines.length; j++) {
      const o = lines[j].match(/^\s+:([\w-]+):[ \t]*(.*)$/);
      if (!o) break;
      opts.set(o[1], o[2].trim());
    }
    i = j - 1;
    const incPath = path.resolve(dir, target);
    if (!fs.existsSync(incPath)) continue; // stale include -> drop
    const body = fs.readFileSync(incPath, "utf8");
    if (opts.has("literal") || opts.has("code")) {
      // The origin source over-indents these includes and omits the preceding
      // blank line, so verbatim re-indentation would parse as a definition list
      // (the prose becomes the term). Emit the block at the enclosing content
      // indent instead: a sibling block of the paragraph / list item above it.
      const pad = " ".repeat(Math.min(indent.length, precedingIndent(out)));
      out.push("", `${pad}.. code-block:: ${opts.get("code") || "text"}`, "");
      for (const line of body.replace(/\s+$/, "").split(/\r?\n/)) {
        out.push(line.trim() === "" ? "" : `${pad}   ${line}`);
      }
      out.push("");
      continue;
    }
    out.push(inlineIncludes(body, path.dirname(incPath), depth + 1));
  }
  return out.join("\n");
}

/** Drop RST comment blocks (`..` or `.. some prose`, plus their indented body).
 * Pandoc only recognises a comment whose body starts on the marker line or the
 * one directly below; source that separates them with a blank line is read as a
 * blockquote instead and the authoring note gets published as prose. Directives
 * (`::`), labels (`_name:`), substitutions (`|name|`) and citation/footnote
 * targets (`[…]`) are left for the passes that handle them.
 * @param {string} text @returns {string} */
function stripRstComments(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)\.\.(?:\s+(.*))?$/);
    const rest = m?.[2]?.trim() ?? "";
    if (!m || /::/.test(rest) || /^[_|[]/.test(rest)) {
      out.push(lines[i]);
      continue;
    }
    const indent = m[1].length;
    let last = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") continue;
      if (lines[j].search(/\S/) <= indent) break;
      last = j;
    }
    i = last;
  }
  return out.join("\n");
}

/** Drop `:widths: auto` from `.. table::` directives. That option alone makes
 * pandoc's RST reader emit the table with no column specs, so every writer then
 * produces empty rows — the origin SDK error-code tables came out as bare `||`.
 * Explicit widths, `:width:` and `.. list-table::` are unaffected, and column
 * widths are a print hint the MDX pipeline ignores anyway.
 * @param {string} text @returns {string} */
function dropAutoTableWidths(text) {
  /** @type {string[]} */
  const out = [];
  let inOptions = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\.\.\s+table::/.test(line)) {
      inOptions = true;
      out.push(line);
      continue;
    }
    if (inOptions) {
      const option = line.match(/^\s+:([\w-]+):\s*(.*)$/);
      if (!option) inOptions = false;
      else if (option[1] === "widths" && option[2].trim() === "auto") continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function convertRst(src) {
  const dir = path.dirname(src);
  const cleaned = rewriteCiteRoles(
    stripToctrees(
      resolveOnlyBlocks(
        resolveJupyterDirectives(
          separateLabelDirectives(
            dropAutoTableWidths(
              stripRstComments(inlineIncludes(fs.readFileSync(src, "utf8"), dir)),
            ),
          ),
        ),
      ),
    ),
  );
  // Run pandoc on a temp file IN the source dir so `.. include::`, csv-table
  // `:file:` and images still resolve relative to it (stdin loses that).
  const tmp = path.join(
    dir,
    `.__generate_docs_${process.pid}_${path.basename(src)}`,
  );
  fs.writeFileSync(tmp, cleaned, "utf8");
  try {
    return pandocHtmlMath(
      execFileSync(
        "pandoc",
        [
          "-f",
          "rst",
          "-t",
          "commonmark_x",
          // Math inside raw HTML (figure captions) stays TeX; see pandocHtmlMath.
          "--mathjax",
          // Drop raw passthrough (`.. raw:: html`) — unusable, MDX-breaking widgets.
          "--lua-filter",
          path.join(scriptDir, "pandoc-mdx.lua"),
          // preserve source line breaks: sphinx-tabs `code-tab` bodies are parsed
          // by pandoc as paragraphs, so `--wrap=none` would join every code line
          // into one; `preserve` keeps them separable for re-fencing.
          "--wrap=preserve",
          "--resource-path",
          dir,
          tmp,
        ],
        { encoding: "utf8" },
      ),
    );
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Pandoc writes math inside raw-HTML blocks (figure captions) as MathJax spans
 * rather than `$…$`; rewrite them so remark-math/KaTeX render them like prose
 * math. `<`/`>` become `\lt`/`\gt` since a literal `<` would read as a JSX tag.
 * @param {string} md @returns {string} */
function pandocHtmlMath(md) {
  return md.replace(
    /<span class="math (inline|display)">\\[([]([\s\S]*?)\\[)\]]<\/span>/g,
    (_m, kind, body) => {
      const tex = body
        .replace(/&lt;/g, "\\lt ")
        .replace(/&gt;/g, "\\gt ")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
      return kind === "display" ? `$$${tex}$$` : `$${tex}$`;
    },
  );
}

/** Reduce common MyST roles found in notebook markdown cells to plain text /
 * inline code (a prototype: full xref/citation resolution is a later step).
 * `{term}`/`{ref}`/`{doc}` -> their text; `{py:*}` -> the short symbol as code;
 * `{cite}`/`{download}` -> dropped.
 * @param {string} md @returns {string} */
function stripMystRoles(md) {
  return md.replace(/\{([\w:+-]+)\}`([^`]+)`/g, (_full, role, body) => {
    const m = body.match(/^(.*?)\s*<[^<>]+>$/); // "text <target>"
    const text = (m ? m[1] : body).trim();
    if (/^py:|^(class|func|meth|mod|attr|obj|data|exc)$/.test(role)) {
      const short = text.replace(/^~/, "").split(/[.#]/).pop();
      return `\`${short || text}\``;
    }
    if (/^cite/.test(role) || role === "download") return "";
    return text;
  });
}

/** Slug for a glossary term: `term-` + lowercased, punctuation collapsed to `-`.
 * Both the injected anchor (glossaryAnchors) and the `{term}` link use this, so
 * they stay in sync regardless of the term's casing/punctuation.
 * @param {string} term @returns {string} */
function glossarySlug(term) {
  return `term-${term
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

/** Parse the term headwords from a Sphinx `.. glossary::` directive (the least-
 * indented entries; their deeper-indented bodies are the definitions).
 * @param {string} glossaryPath @returns {string[]} */
function parseGlossaryTerms(glossaryPath) {
  /** @type {string[]} */
  const terms = [];
  let inGlossary = false;
  let termIndent = null;
  for (const line of fs.readFileSync(glossaryPath, "utf8").split(/\r?\n/)) {
    if (/^\.\.\s+glossary::/.test(line)) {
      inGlossary = true;
      continue;
    }
    if (!inGlossary) continue;
    if (line.trim() === "") continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent === 0) break; // directive block ended
    if (termIndent === null) termIndent = indent; // first entry = term indent
    if (indent === termIndent) terms.push(line.trim());
  }
  return terms;
}

/** Inject `<a id="term-…"/>` scroll anchors before each glossary definition-list
 * term so `{term}` links can target them. Terms are matched against the parsed
 * headword set; the pandoc filter flattens a definition list to a `**term**`
 * paragraph followed by its definition.
 * @param {string} md @param {string[]} terms @returns {string} */
function glossaryAnchors(md, terms) {
  const slugs = new Map(terms.map((t) => [t, glossarySlug(t)]));
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const headword = lines[i].trim().match(/^\*\*(.+)\*\*$/)?.[1];
    const slug = headword ? slugs.get(headword) : undefined;
    if (
      slug &&
      (lines[i + 1] ?? "").trim() === "" &&
      (lines[i + 2] ?? "").trim() !== ""
    ) {
      out.push(`<a id="${slug}" />`, "");
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}

/** Build the Python-domain symbol index for a module from its quartodoc `.qmd`
 * pages (heading ids `### Name { #dotted.id }`), mapping each dotted id and its
 * short (last-segment) name to the routed API page URL + anchor. Mirrors the flat
 * vs. foldered layout convertApi emits so the anchors resolve.
 * @param {DocsModule} mod
 * @returns {{ map: Map<string, XRef>, shortMap: Map<string, XRef> }} */
function buildApiSymbolIndex(mod) {
  /** @type {Map<string, XRef>} */
  const map = new Map();
  /** @type {Map<string, XRef>} */
  const shortMap = new Map();
  /** @type {ApiSymbol[]} */
  const entries = [];
  if (!mod.apiSource) return { map, shortMap, entries };
  const indexPath = path.join(mod.apiSource, "index.qmd");
  if (!fs.existsSync(indexPath)) return { map, shortMap, entries };
  for (const sec of parseApiIndex(indexPath)) {
    const short = sec.title.replace(new RegExp(`^${mod.name}\\.`), "");
    for (const base of sec.bases) {
      // Nexus ingests one page per index.qmd section (file); lambeq uses a flat
      // or foldered per-submodule layout.
      const url = mod.markdown
        ? `/${mod.name}/api/${sec.title}`
        : sec.bases.length === 1
          ? `/${mod.name}/api/${mod.name}.${base}`
          : `/${mod.name}/api/${mod.name}.${short}/${base.slice(short.length + 1)}`;
      const qmd = path.join(mod.apiSource, `${base}.qmd`);
      if (!fs.existsSync(qmd)) continue;
      // Heading depth is quartodoc's only signal of what a symbol IS: `#` a
      // module, `###` a class/function, `#####` one of its members.
      const re = /^(#{1,6})\s+.*\{\s*#([\w.]+)\s*\}/gm;
      let m;
      const text = fs.readFileSync(qmd, "utf8");
      while ((m = re.exec(text)) !== null) {
        const id = m[2];
        const entry = { url, anchor: id };
        entries.push({ id, url, anchor: id, depth: m[1].length });
        map.set(id.toLowerCase(), entry);
        const last = id.split(".").pop()?.toLowerCase();
        if (last && !shortMap.has(last)) shortMap.set(last, entry);
      }
    }
  }
  return { map, shortMap, entries };
}

/** Resolve a Python-domain role target (`~pkg.Cls`, `.Cls`, `Cls.method`) to an
 * API page anchor: exact dotted id, else the id ending with `.target`, else the
 * last name segment. Returns null when the symbol isn't documented.
 * @param {string} target @returns {XRef | null} */
function resolvePySymbol(target) {
  const clean = target
    .replace(/^[~.]+/, "")
    .replace(/\(\)$/, "")
    .trim();
  const lc = clean.toLowerCase();
  if (apiSymbolIndex.map.has(lc)) return apiSymbolIndex.map.get(lc) ?? null;
  for (const [id, entry] of apiSymbolIndex.map) {
    if (id.endsWith(`.${lc}`)) return entry;
  }
  // Only fall back to a last-segment match for a bare name (e.g. `.Reader`); a
  // fully-qualified miss (an undocumented/inherited member) has no good target.
  if (!lc.includes(".")) return apiSymbolIndex.shortMap.get(lc) || null;
  return null;
}

/** Stage a `{download}`/`{nb-download}` target as a static asset and return an
 * anchored download link. Sphinx generates `_code/<nb>.ipynb` (a code-cells-only
 * copy) at build time, so when the referenced file is that missing copy we
 * regenerate it from the source notebook; otherwise the referenced file is copied
 * verbatim (what `{nb-download}` asks for: the notebook itself).
 * @param {string} body `text <target>` (or a bare target) @param {string} nbSrc
 * @returns {string} */
function stageDownload(body, nbSrc) {
  const m = body.match(/^(.*?)\s*<([^<>]+)>$/);
  const rawPath = (m ? m[2] : body).trim();
  const abs = path.resolve(path.dirname(nbSrc), rawPath.split(/[?#]/)[0]);
  const baseName = path.basename(abs);
  // A bare target (`{nb-download}`file.ipynb``) is labelled with the file name,
  // as Sphinx does; only the `text <target>` form carries its own label.
  const text = (m ? m[1].trim() : baseName) || "Download";
  const relNb = path
    .relative(M.sphinxRoot, nbSrc)
    .replace(/\.[^./]+$/, "")
    .split(path.sep)
    .join("/");
  const outRel = `${relNb}/_downloads/${baseName}`;
  const dest = path.join(M.assetRoot, outRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(abs)) {
    fs.copyFileSync(abs, dest);
  } else if (baseName.endsWith(".ipynb") && fs.existsSync(nbSrc)) {
    const nb = JSON.parse(fs.readFileSync(nbSrc, "utf8"));
    nb.cells = (nb.cells ?? [])
      .filter((/** @type {any} */ c) => c.cell_type === "code")
      .map((/** @type {any} */ c) => ({
        ...c,
        outputs: [],
        execution_count: null,
      }));
    fs.writeFileSync(dest, JSON.stringify(nb));
  } else {
    return text; // nothing to stage — fall back to plain text
  }
  const url = `/${M.assetSubdir}/${outRel}`;
  stagedImages.add(url);
  return `<a href="${url}" download>${text}</a>`;
}

/** Strip bibtex value wrapping: surrounding quotes, case-protection braces, and
 * backslash-escaped punctuation (`COLI\_a` -> `COLI_a`). @param {string} raw */
function bibValue(raw) {
  return (raw ?? "")
    .replace(/[{}]/g, "")
    .replace(/\\([_&%#$~^])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Surname of a bibtex author name (`Coecke, Bob` / `Bob Coecke` -> `Coecke`).
 * @param {string} name @returns {string} */
function bibSurname(name) {
  const clean = bibValue(name);
  if (clean.includes(",")) return clean.split(",")[0].trim();
  const parts = clean.split(/\s+/);
  return parts[parts.length - 1] || clean;
}

/** Author surnames of an entry (splitting the bibtex ` and ` separator).
 * @param {BibEntry} e @returns {string[]} */
function bibSurnames(e) {
  const field = e.fields.author || e.fields.editor || "";
  if (!field.trim()) return [];
  return field
    .split(/\s+and\s+/i)
    .map(bibSurname)
    .filter(Boolean);
}

/** 4-digit year of an entry (or empty). @param {BibEntry} e @returns {string} */
function bibYear(e) {
  return (e.fields.year || "").match(/\d{4}/)?.[0] ?? "";
}

/** Author-portion of a citation label: `Tull`, `Coecke & Clark`, `Coecke et al.`
 * @param {BibEntry} e @returns {string} */
function bibAuthorLabel(e) {
  const s = bibSurnames(e);
  if (s.length === 0) return bibValue(e.fields.title || e.key).split(/\s+/)[0];
  if (s.length === 1) return s[0];
  if (s.length === 2) return `${s[0]} & ${s[1]}`;
  return `${s[0]} et al.`;
}

/** Parse a `references.bib` file into entries (nested-brace / quoted values
 * supported). `@comment/@string/@preamble` blocks are skipped.
 * @param {string} text @returns {BibEntry[]} */
function parseBibtex(text) {
  /** @type {BibEntry[]} */
  const entries = [];
  const re = /@(\w+)\s*\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const type = m[1].toLowerCase();
    let i = re.lastIndex;
    let depth = 1;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") depth -= 1;
    }
    const body = text.slice(re.lastIndex, i - 1);
    re.lastIndex = i;
    if (type === "comment" || type === "string" || type === "preamble")
      continue;
    const commaIdx = body.indexOf(",");
    if (commaIdx === -1) continue;
    const key = body.slice(0, commaIdx).trim();
    entries.push({
      key,
      type,
      fields: parseBibFields(body.slice(commaIdx + 1)),
    });
  }
  return entries;
}

/** Parse the `name = {value}` / `name = "value"` fields of a bibtex entry body.
 * @param {string} s @returns {Record<string, string>} */
function parseBibFields(s) {
  /** @type {Record<string, string>} */
  const fields = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i += 1;
    const nameStart = i;
    while (i < s.length && /[\w-]/.test(s[i])) i += 1;
    const name = s.slice(nameStart, i).trim().toLowerCase();
    if (!name) break;
    while (i < s.length && s[i] !== "=") i += 1;
    i += 1; // skip '='
    while (i < s.length && /\s/.test(s[i])) i += 1;
    let value = "";
    if (s[i] === "{") {
      let depth = 0;
      const start = i;
      for (; i < s.length; i += 1) {
        if (s[i] === "{") depth += 1;
        else if (s[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
        }
      }
      value = s.slice(start + 1, i - 1);
    } else if (s[i] === '"') {
      let depth = 0;
      const start = i;
      i += 1;
      for (; i < s.length; i += 1) {
        if (s[i] === "{") depth += 1;
        else if (s[i] === "}") depth -= 1;
        else if (s[i] === '"' && depth === 0) {
          i += 1;
          break;
        }
      }
      value = s.slice(start + 1, i - 1);
    } else {
      const start = i;
      while (i < s.length && s[i] !== ",") i += 1;
      value = s.slice(start, i).trim();
    }
    fields[name] = value;
  }
  return fields;
}

/** Build the citation index + ordered entry list from a module's bibtex file.
 * Entries sort by first-author surname then year (author-year bibliography).
 * @param {string} bibPath @param {string} bibRelNoExt */
function buildBibIndex(bibPath, bibRelNoExt) {
  bibIndex = new Map();
  bibEntries = [];
  if (!fs.existsSync(bibPath)) return;
  const url = urlForRel(bibRelNoExt);
  bibEntries = parseBibtex(fs.readFileSync(bibPath, "utf8")).sort((a, b) => {
    const sa = (bibSurnames(a)[0] || a.key).toLowerCase();
    const sb = (bibSurnames(b)[0] || b.key).toLowerCase();
    return sa.localeCompare(sb) || bibYear(a).localeCompare(bibYear(b));
  });
  for (const e of bibEntries) {
    const author = bibAuthorLabel(e);
    const year = bibYear(e);
    bibIndex.set(e.key.toLowerCase(), {
      url,
      anchor: `bib-${e.key.toLowerCase()}`,
      paren: year ? `${author}, ${year}` : author,
      textual: year ? `${author} (${year})` : author,
    });
  }
}

/** Format a `:cite:`/`{cite}` role (comma-separated keys) as linked author-year
 * citation(s): parenthetical `(A et al., 2020; B, 2021)` or textual `A (2020)`.
 * Unknown keys degrade to their raw text.
 * @param {string} keys @param {boolean} textual @returns {string} */
function formatCitation(keys, textual) {
  const parts = keys
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => {
      const e = bibIndex.get(k.toLowerCase());
      if (!e) return k;
      const label = textual ? e.textual : e.paren;
      return `[${label}](${e.url}#${e.anchor})`;
    });
  if (parts.length === 0) return "";
  return textual ? parts.join("; ") : `(${parts.join("; ")})`;
}

/** Render the bibliography page body (author-year list with `bib-<key>` scroll
 * anchors) from the parsed entries. @returns {string} */
function renderBibliography() {
  /** @type {string[]} */
  const out = ["# Bibliography", ""];
  for (const e of bibEntries) {
    const authors = (e.fields.author || e.fields.editor || "")
      .split(/\s+and\s+/i)
      .map((n) => bibValue(n))
      .filter(Boolean)
      .join("; ");
    const year = bibYear(e);
    const title = bibValue(e.fields.title || "");
    const container = bibValue(
      e.fields.journal ||
        e.fields.booktitle ||
        e.fields.publisher ||
        e.fields.school ||
        e.fields.institution ||
        e.fields.howpublished ||
        "",
    );
    const vol = bibValue(e.fields.volume || "");
    const num = bibValue(e.fields.number || "");
    const pages = bibValue(e.fields.pages || "").replace(/--/g, "–");
    const doi = bibValue(e.fields.doi || "");
    const rawUrl = bibValue(e.fields.url || "");
    const link = doi ? `https://doi.org/${doi}` : rawUrl;
    /** @type {string[]} */
    const segs = [];
    if (authors) segs.push(year ? `${authors} (${year}).` : `${authors}.`);
    else if (year) segs.push(`(${year}).`);
    if (title) segs.push(`*${title}*.`);
    let detail = container;
    if (vol) detail += `${detail ? ", " : ""}vol. ${vol}`;
    if (num) detail += `(${num})`;
    if (pages) detail += `${detail ? ", " : ""}pp. ${pages}`;
    if (detail) segs.push(`${detail}.`);
    if (link) segs.push(`[${link}](${link})`);
    out.push(`<a id="bib-${e.key.toLowerCase()}" />`, "", segs.join(" "), "");
  }
  return out.join("\n");
}

/**
 * Render the Sphinx `genindex` page body: an A–Z index of every documented API
 * symbol plus the glossary terms. Sphinx builds this from its object inventory,
 * so the source `genindex.rst` is only a title and converts to an empty page.
 * Quartodoc has no equivalent, but its heading anchors give us the same data.
 * @returns {string}
 */
function renderGenIndex() {
  /** @type {{ letter: string, name: string, line: string }[]} */
  const items = [];
  for (const { id, url, anchor, depth } of apiSymbolIndex.entries) {
    const parts = id.split(".");
    const parent = parts.slice(0, -1).join(".");
    // A module is indexed under its full dotted path, as Sphinx does; anything
    // else under its own name. Depth can't tell a class from a function or a
    // method from an attribute, so the qualifier stays neutral.
    const isModule = depth <= 1;
    const name = isModule ? id : parts[parts.length - 1];
    const qualifier = isModule
      ? "module"
      : depth <= 3
        ? `in \`${parent}\``
        : `\`${parent}\``;
    // A module's heading is the page H1, which is lifted into frontmatter and
    // rendered without an id, so link to the page itself.
    items.push({
      letter: indexLetter(name),
      name,
      line: `[\`${name}\`](${isModule ? url : `${url}#${anchor}`}) — ${qualifier}`,
    });
  }
  for (const [term, e] of glossaryIndex) {
    items.push({
      letter: indexLetter(term),
      name: term,
      line: `[${term}](${e.url}#${e.anchor}) — glossary`,
    });
  }
  if (items.length === 0) return "";
  items.sort(
    (a, b) =>
      a.letter.localeCompare(b.letter) ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
      a.line.localeCompare(b.line),
  );
  /** @type {string[]} */
  const out = [];
  let letter = "";
  for (const item of items) {
    if (item.letter !== letter) {
      letter = item.letter;
      out.push("", `## ${letter}`, "");
    }
    out.push(`- ${item.line}`);
  }
  return out.join("\n").trim();
}

/** A–Z grouping key for an index entry (non-alphabetic names group together).
 * @param {string} name @returns {string} */
function indexLetter(name) {
  const c = name[0]?.toUpperCase() ?? "";
  return c >= "A" && c <= "Z" ? c : "Symbols";
}

/**
 * Sphinx intersphinx/extlink base URLs (from nexus conf.py). Quantinuum sibling
 * sites are made ROOT-RELATIVE (`/tket/...`) so links resolve to the same-domain
 * subsite whatever host serves the build; genuinely external projects stay
 * absolute. Used both for extlink roles (`{tket_user_guide}`text <path>``) and
 * intersphinx `:ref:` targets (`inv:docpath:section`).
 * @type {Record<string, string>}
 */
const INTERSPHINX = {
  python: "https://docs.python.org/3/",
  tket_api: "/tket/api-docs/",
  tket_user_guide: "/tket/user-guide/",
  qiskit: "https://docs.quantum.ibm.com/api/qiskit/",
  q_systems: "/systems/",
  inquanto: "/inquanto/",
};

/** Resolve an intersphinx `:ref:` target (`inv:docpath:section`) to a link into
 * the referenced site, dropping the autosectionlabel section part (no inventory
 * to resolve exact anchors). Returns null if `inv` isn't a known project.
 * @param {string} target @returns {string | null} */
function intersphinxRefUrl(target) {
  const idx = target.indexOf(":");
  if (idx === -1) return null;
  const inv = target.slice(0, idx);
  const base = INTERSPHINX[inv];
  if (!base) return null;
  const docpath = target
    .slice(idx + 1)
    .split(":")[0]
    .trim();
  return `${base}${docpath}${docpath.endsWith("/") ? "" : ".html"}`;
}

/** Resolve MyST roles in notebook markdown to Fumadocs links (replacing the
 * lossy stripMystRoles for the Quarto path): `{term}` -> glossary anchor,
 * `{py:*}`/`{class}` etc. -> API symbol anchor, `{download}` -> download link,
 * `{cite}` -> bibliography citation, `{ref}`/`{doc}` -> indexed page links,
 * extlink roles (`{tket_user_guide}` …) -> sibling-site links, `{code}` -> code.
 * Unresolved targets degrade to their display text (or inline code for symbols).
 * @param {string} md @param {DocIndex} index @param {string} currentRelNoExt
 * @param {string} nbSrc @returns {string} */
function resolveMystRoles(md, index, currentRelNoExt, nbSrc) {
  return md.replace(/\{([\w:+-]+)\}`([^`]+)`/g, (_full, role, body) => {
    const m = body.match(/^(.*?)\s*<([^<>]+)>$/); // "text <target>"
    const text = (m ? m[1] : body).trim();
    const target = (m ? m[2] : body).trim();
    // `{nb-download}` (MyST-NB) points at the notebook source file itself.
    if (role === "download" || role === "nb-download") {
      return stageDownload(body, nbSrc);
    }
    if (role === "code") return `\`${body}\``;
    if (Object.hasOwn(INTERSPHINX, role)) {
      return `[${text || target}](${INTERSPHINX[role]}${target})`;
    }
    if (role === "term") {
      const e = glossaryIndex.get(target.toLowerCase());
      return e ? `[${text}](${e.url}#${e.anchor})` : text;
    }
    if (
      /^py:/.test(role) ||
      /^(class|func|meth|mod|attr|obj|data|exc)$/.test(role)
    ) {
      const short = target.replace(/^~/, "").split(/[.#:]/).pop() || target;
      const sym = resolvePySymbol(target);
      return sym ? `[\`${short}\`](${sym.url}#${sym.anchor})` : `\`${short}\``;
    }
    if (/^cite/.test(role)) {
      const sub = role.slice(role.indexOf(":") + 1);
      return formatCitation(body, sub === "t" || sub === "ts");
    }
    if (role === "numref") {
      const e = numfigIndex.get(target.toLowerCase());
      if (e) {
        const label =
          text || `${e.kind === "figure" ? "Fig." : "Table"} ${e.number}`;
        return `[${label}](${e.url}#${e.anchor})`;
      }
      return text;
    }
    if (role === "ref") {
      const e = index.labels.get(target.toLowerCase());
      if (e) {
        const url = e.anchor ? `${e.url}#${e.anchor}` : e.url;
        return `[${text || e.title || target}](${url})`;
      }
      const inter = intersphinxRefUrl(target);
      if (inter) return `[${text || target}](${inter})`;
      const viaPath = resolveDocPathRef(target, currentRelNoExt, index, text);
      return viaPath ?? (text || target);
    }
    if (role === "doc" || role === "std:doc") {
      const viaPath = resolveDocPathRef(target, currentRelNoExt, index, text);
      return viaPath ?? (text || target);
    }
    return text;
  });
}

/** Lift a MyST `(label)=` anchor that Quarto glued onto its following heading
 * (`(sec-x)= \# Title` -> `# Title`) back into a real heading, and drop any
 * remaining standalone label lines. Runs before withFrontmatter so the H1 is
 * recognised as the page title.
 * @param {string} md @returns {string} */
function fixNbTitleLabels(md) {
  return md
    .replace(
      /^\([^)\n]+\)=[ \t]*\\?(#{1,6})[ \t]*(.+)$/gm,
      (_m, hashes, title) => `${hashes} ${title}`,
    )
    .replace(/^\([^)\n]+\)=[ \t]*$/gm, "");
}

/** Wrap Quarto's indented notebook-output blocks in a `text` code fence. MDX does
 * not render indented code blocks, so a stored `text/plain` output (e.g.
 * `    array([-8., -8.])`) would otherwise show as plain prose. Fenced code
 * inside ``` / ~~~ is left untouched.
 * @param {string} md @returns {string} */
function fenceIndentedCode(md) {
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  /** @type {{ char: string, len: number } | null} */
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const fm = raw.match(/^(`{3,}|~{3,})/);
    if (fm) {
      const marker = fm[1];
      if (!fence) fence = { char: marker[0], len: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.len)
        fence = null;
      out.push(raw);
      continue;
    }
    if (fence) {
      out.push(raw);
      continue;
    }
    const prevBlank = out.length === 0 || out[out.length - 1].trim() === "";
    if (prevBlank && /^ {4}\S/.test(raw)) {
      /** @type {string[]} */
      const block = [];
      let j = i;
      for (; j < lines.length; j++) {
        if (/^ {4}/.test(lines[j])) block.push(lines[j].slice(4));
        else if (lines[j].trim() === "") block.push("");
        else break;
      }
      while (block.length && block[block.length - 1] === "") block.pop();
      out.push("```text", ...block, "```");
      if (j < lines.length && lines[j].trim() !== "") out.push("");
      i = j - 1;
      continue;
    }
    out.push(raw);
  }
  return out.join("\n");
}

/** Run pandoc on notebook markdown-cell text (stdin), normalising it the same
 * way as converted RST so the shared component transforms apply.
 * @param {string} text @returns {string} */
function pandocMarkdown(text) {
  return execFileSync(
    "pandoc",
    ["-f", "commonmark_x", "-t", "commonmark_x", "--wrap=preserve"],
    { encoding: "utf8", input: text },
  );
}

/** Join an nbformat multiline field (string | string[]) into one string.
 * @param {string | string[] | undefined} v @returns {string} */
function nbText(v) {
  return Array.isArray(v) ? v.join("") : (v ?? "");
}

/** Write a notebook's stored image output to public/<module>-assets and return
 * its served URL (base64 for raster, raw text for svg).
 * @param {string} data @param {string} ext @param {string} nbPath @param {string} key
 * @returns {string} */
function stageDataImage(data, ext, nbPath, key) {
  const relNb = path
    .relative(M.sphinxRoot, nbPath)
    .replace(/\.ipynb$/, "")
    .split(path.sep)
    .join("/");
  const rel = `${relNb}/${key}.${ext}`;
  const dest = path.join(M.assetRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, ext === "svg" ? data : Buffer.from(data, "base64"));
  return `/${M.assetSubdir}/${rel}`;
}

/** Render a code cell's stored outputs (stream/result/error) as MDX blocks:
 * images are staged, otherwise the text/plain repr is shown as a code block.
 * Rich text/html (pandas tables, widgets) is skipped for now — this prototype
 * uses the saved plain-text fallback rather than injecting raw HTML into MDX.
 * @param {any[]} outputs @param {string} nbPath @param {string} keyBase
 * @returns {string} */
function renderCellOutputs(outputs, nbPath, keyBase) {
  /** @type {string[]} */
  const blocks = [];
  outputs.forEach((o, i) => {
    const key = `${keyBase}-out${i}`;
    if (o.output_type === "stream") {
      const t = nbText(o.text).replace(/\n+$/, "");
      if (t.trim()) blocks.push(`\`\`\`text\n${t}\n\`\`\``);
    } else if (
      o.output_type === "execute_result" ||
      o.output_type === "display_data"
    ) {
      const d = o.data ?? {};
      if (d["image/png"]) {
        blocks.push(
          `![output](${stageDataImage(nbText(d["image/png"]).trim(), "png", nbPath, key)})`,
        );
      } else if (d["image/svg+xml"]) {
        blocks.push(
          `![output](${stageDataImage(nbText(d["image/svg+xml"]), "svg", nbPath, key)})`,
        );
      } else if (d["text/plain"]) {
        const t = nbText(d["text/plain"]).replace(/\n+$/, "");
        if (t.trim()) blocks.push(`\`\`\`text\n${t}\n\`\`\``);
      }
    } else if (o.output_type === "error") {
      const t = (o.traceback ?? []).join("\n").replace(/\u001b\[[0-9;]*m/g, "");
      if (t.trim()) blocks.push(`\`\`\`text\n${t}\n\`\`\``);
    }
  });
  return blocks.join("\n\n");
}

/** Replace the obsolete `<center>` wrapper. Tailwind's preflight makes images
 * block elements, so `text-align` no longer centres them; a flex row does, and
 * unlike a utility class it survives whatever Tailwind scans for.
 * @param {string} md @returns {string} */
function centerTransform(md) {
  return md
    .replace(/<center>/gi, '<div style="display: flex; justify-content: center">')
    .replace(/<\/center>/gi, "</div>");
}

/** Convert a Jupyter notebook to MDX using its STORED outputs (freeze-style, no
 * execution): markdown cells go through the prose transforms; code cells become
 * fenced blocks followed by their rendered outputs.
 * @param {string} src @returns {string} */
function convertNotebook(src) {
  const nb = JSON.parse(fs.readFileSync(src, "utf8"));
  const lang =
    nb.metadata?.kernelspec?.language ||
    nb.metadata?.language_info?.name ||
    "python";
  const srcDir = path.dirname(src);
  /** @type {string[]} */
  const parts = [];
  (nb.cells ?? []).forEach((cell, idx) => {
    const source = nbText(cell.source);
    if (cell.cell_type === "markdown") {
      if (source.trim() === "") return;
      const md = centerTransform(
        imageTransform(pandocMarkdown(stripMystRoles(source)), srcDir),
      );
      parts.push(mdxSafe(tabsTransform(calloutTransform(md))));
    } else if (cell.cell_type === "code") {
      const code = source.replace(/\n+$/, "");
      if (code.trim() !== "") parts.push(`\`\`\`${lang}\n${code}\n\`\`\``);
      const out = renderCellOutputs(cell.outputs ?? [], src, `cell${idx}`);
      if (out) parts.push(out);
    }
  });
  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n");
}

/** Escape a string for literal use inside a RegExp. @param {string} s */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** MyST admonition kind -> Fumadocs <Callout> type. @type {Record<string, string>} */
const ADMONITION_TYPE = {
  note: "info",
  seealso: "info",
  important: "info",
  tip: "idea",
  hint: "idea",
  warning: "warn",
  caution: "warn",
  attention: "warn",
  danger: "error",
  error: "error",
};

/** Convert Quarto's fenced MyST admonitions (```` ``` {note} ````) into
 * <Callout> components. Unknown fence kinds (e.g. `{toctree}`) are left as-is.
 * @param {string} md @returns {string} */
function mystAdmonitionTransform(md) {
  return md.replace(
    /^``` ?\{(\w+)\}\n([\s\S]*?)\n```[ \t]*$/gm,
    (full, kind, body) => {
      const type = ADMONITION_TYPE[kind.toLowerCase()];
      if (!type) return full;
      return `<Callout type="${type}">\n\n${body.trim()}\n\n</Callout>`;
    },
  );
}

// --- MyST markdown conversion (nexus) ---------------------------------------
// Nexus prose is MyST markdown, not RST: it is already Markdown, so it is
// transformed IN PLACE (no whole-file pandoc round-trip, which would mangle MyST
// directives). Only embedded `{eval-rst}` blocks are handed to pandoc; MyST
// directives (image/figure/admonition) become MDX, `{toctree}` fences are
// dropped (nav is built from the index files), and MyST roles/labels are handled
// by the shared resolvers. See convertMyst.

/** Strip a leading YAML frontmatter block, reporting whether it marks the page
 * `orphan: true` (a Sphinx page intentionally left out of every toctree).
 * @param {string} md @returns {{ body: string, orphan: boolean }} */
function stripYamlFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);
  if (!m) return { body: md, orphan: false };
  return {
    body: md.slice(m[0].length),
    orphan: /^orphan:\s*true\s*$/m.test(m[1]),
  };
}

/** Run pandoc on an embedded `{eval-rst}` fragment (RST -> commonmark_x) using a
 * temp file in the source dir so relative images/includes/csv `:file:` resolve.
 * `:cite:` roles are pre-rewritten so pandoc preserves them for resolveRoles.
 * @param {string} rst @param {string} srcDir @returns {string} */
function pandocRstFragment(rst, srcDir) {
  const tmp = path.join(srcDir, `.__generate_docs_${process.pid}_evalrst.rst`);
  fs.writeFileSync(tmp, rewriteCiteRoles(rst), "utf8");
  try {
    return pandocHtmlMath(
      execFileSync(
        "pandoc",
        [
          "-f",
          "rst",
          "-t",
          "commonmark_x",
          "--mathjax",
          "--lua-filter",
          path.join(scriptDir, "pandoc-mdx.lua"),
          "--wrap=preserve",
          "--resource-path",
          srcDir,
          tmp,
        ],
        { encoding: "utf8" },
      ),
    );
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Parse MyST directive option lines (`:key: value`) at the head of a directive
 * body, returning the options and the remaining body lines.
 * @param {string[]} body @returns {{ opts: Record<string,string>, rest: string[] }} */
function parseDirectiveOptions(body) {
  /** @type {Record<string,string>} */
  const opts = {};
  let i = 0;
  for (; i < body.length; i++) {
    const m = body[i].match(/^\s*:([\w-]+):\s*(.*)$/);
    if (!m) break;
    opts[m[1]] = m[2].trim();
  }
  // A blank line separates options from content (e.g. a figure caption).
  while (i < body.length && body[i].trim() === "") i++;
  return { opts, rest: body.slice(i) };
}

/** HTML/JSX-escape an attribute value (MDX parses `<img …>` as JSX, which does
 * NOT honour JS backslash escapes — `\"` is invalid in an attribute name).
 * @param {string} s @returns {string} */
function htmlAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Build an `<img>` tag from a MyST `{image}`/`{figure}` src + options (kept as
 * HTML so `:width:`/`:alt:` survive; imageTransform stages the src later).
 * @param {string} src @param {Record<string,string>} opts @returns {string} */
function mystImgTag(src, opts) {
  const attrs = [`src="${htmlAttr(src)}"`];
  if (opts.alt) attrs.push(`alt="${htmlAttr(opts.alt)}"`);
  if (opts.width)
    attrs.push(`width="${htmlAttr(opts.width.replace(/px$/, ""))}"`);
  if (opts.height)
    attrs.push(`height="${htmlAttr(opts.height.replace(/px$/, ""))}"`);
  return `<img ${attrs.join(" ")} />`;
}

/**
 * Resolve a sphinx_design card `:link:` target to a Fumadocs `<Card href>`.
 * External URLs pass through (opened externally); relative targets (PDF/JSON/etc.)
 * are staged into the public asset dir and returned as an encoded root-absolute
 * URL. Returns null when there is no link or the asset is missing.
 * @param {string | undefined} link @param {string} srcDir
 * @returns {{ href: string, external: boolean } | null}
 */
function resolveCardLink(link, srcDir) {
  if (!link) return null;
  if (/^(https?:)?\/\//.test(link) || link.startsWith("mailto:")) {
    return { href: link, external: true };
  }
  const decoded = decodeURIComponent(link.split(/[?#]/)[0]);
  const url = stageImage(decoded, srcDir);
  return url ? { href: encodeURI(url), external: true } : null;
}

/* ---------------------------------------------------------------------------
 * Doxygen (C API) -> MDX. Replaces Sphinx's Breathe `.. doxygenfile::`: Doxygen
 * runs over the module's headers producing XML, which is parsed here and
 * rendered as MDX (signatures, descriptions, struct/typedef tables) inline in
 * the page that carried the directive.
 * ------------------------------------------------------------------------- */

/** @typedef {{ tag: string, attrs: Record<string, string>, children: XmlNode[] }} XmlElement */
/** @typedef {string | XmlElement} XmlNode */
/** @typedef {{ file: XmlElement, structs: XmlElement[] }} DoxyCompound */

/** Header file name (`runtime.h`) -> its Doxygen `<compounddef>` plus the struct
 * compounds it declares. Rebuilt per module in convertModule; stays empty when
 * the module has no `doxygen` config, the headers are missing, or Doxygen isn't
 * installed — the directive then falls back to its placeholder callout.
 * @type {Map<string, DoxyCompound>} */
let doxygenFiles = new Map();

/** @type {Record<string, string>} */
const XML_ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** @param {string} s @returns {string} */
function decodeXml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (full, ent) => {
    if (ent[0] !== "#") return XML_ENTITIES[ent] ?? full;
    const code =
      ent[1] === "x" || ent[1] === "X"
        ? Number.parseInt(ent.slice(2), 16)
        : Number.parseInt(ent.slice(1), 10);
    return Number.isNaN(code) ? full : String.fromCodePoint(code);
  });
}

const XML_TAG =
  /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const XML_ATTR = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Minimal XML -> tree parser, sufficient for Doxygen's output (well-formed, no
 * CDATA). Hand-rolled to avoid adding an XML dependency for one module.
 * @param {string} xml @returns {XmlElement} */
function parseXml(xml) {
  const clean = xml
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  /** @type {XmlElement} */
  const root = { tag: "#root", attrs: {}, children: [] };
  /** @type {XmlElement[]} */
  const stack = [root];
  let last = 0;
  XML_TAG.lastIndex = 0;
  for (let m = XML_TAG.exec(clean); m; m = XML_TAG.exec(clean)) {
    const text = clean.slice(last, m.index);
    if (text) stack[stack.length - 1].children.push(decodeXml(text));
    last = XML_TAG.lastIndex;
    if (m[1]) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    /** @type {XmlElement} */
    const el = { tag: m[2], attrs: {}, children: [] };
    for (const a of m[3].matchAll(XML_ATTR)) {
      el.attrs[a[1]] = decodeXml(a[2] ?? a[3] ?? "");
    }
    stack[stack.length - 1].children.push(el);
    if (!m[4]) stack.push(el);
  }
  return root;
}

/** @param {XmlElement} node @param {string} [tag] @returns {XmlElement[]} */
function xmlElements(node, tag) {
  /** @type {XmlElement[]} */
  const out = [];
  for (const child of node.children) {
    if (typeof child === "string") continue;
    if (!tag || child.tag === tag) out.push(child);
  }
  return out;
}

/** @param {XmlElement} node @param {string} tag @returns {XmlElement | null} */
function xmlChild(node, tag) {
  return xmlElements(node, tag)[0] ?? null;
}

/** @param {XmlNode} node @returns {string} */
function xmlText(node) {
  if (typeof node === "string") return node;
  return node.children.map(xmlText).join("");
}

/** Text of the first `<tag>` child ("" when absent).
 * @param {XmlElement} node @param {string} tag @returns {string} */
function xmlTextOf(node, tag) {
  const child = xmlChild(node, tag);
  return child ? xmlText(child) : "";
}

/** Flatten Markdown for a table cell (pipes escaped, one line).
 * @param {string} s @returns {string} */
function mdCell(s) {
  return s
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

/** Render Doxygen inline markup to Markdown.
 * @param {XmlNode[]} nodes @returns {string} */
function doxyInline(nodes) {
  let out = "";
  for (const node of nodes) {
    if (typeof node === "string") {
      out += node;
      continue;
    }
    switch (node.tag) {
      case "computeroutput":
        out += `\`${xmlText(node).trim()}\``;
        break;
      case "bold":
        out += `**${doxyInline(node.children)}**`;
        break;
      case "emphasis":
        out += `*${doxyInline(node.children)}*`;
        break;
      case "ulink":
        out += `[${doxyInline(node.children)}](${node.attrs.url})`;
        break;
      case "linebreak":
        out += "\n";
        break;
      case "sp":
        out += " ";
        break;
      default:
        out += doxyInline(node.children);
    }
  }
  return out;
}

/** @type {Record<string, string>} */
const DOXY_SECTION_LABEL = {
  return: "Returns",
  note: "Note",
  warning: "Warning",
  attention: "Attention",
  remark: "Remark",
  see: "See also",
  since: "Since",
  pre: "Precondition",
  post: "Postcondition",
};

/** @type {Record<string, string>} */
const DOXY_PARAMLIST_LABEL = {
  param: "Parameters",
  retval: "Return values",
  exception: "Exceptions",
  templateparam: "Template parameters",
};

/** Render the children of a Doxygen description container (`<briefdescription>`,
 * `<detaileddescription>`, `<para>`, `<listitem>`) as Markdown blocks separated
 * by blank lines.
 * @param {XmlNode[]} nodes @returns {string} */
function doxyBlocks(nodes) {
  /** @type {string[]} */
  const blocks = [];
  /** @type {XmlNode[]} */
  let inline = [];
  const flush = () => {
    const text = doxyInline(inline)
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();
    inline = [];
    if (text) blocks.push(text);
  };
  for (const node of nodes) {
    if (typeof node === "string") {
      inline.push(node);
      continue;
    }
    switch (node.tag) {
      case "para": {
        flush();
        const body = doxyBlocks(node.children);
        if (body) blocks.push(body);
        break;
      }
      case "itemizedlist":
      case "orderedlist": {
        flush();
        const ordered = node.tag === "orderedlist";
        const items = xmlElements(node, "listitem").map((item, i) => {
          const marker = ordered ? `${i + 1}. ` : "- ";
          const pad = " ".repeat(marker.length);
          return doxyBlocks(item.children)
            .split("\n")
            .map((line, j) => (j === 0 ? marker + line : pad + line))
            .join("\n");
        });
        if (items.length) blocks.push(items.join("\n"));
        break;
      }
      case "programlisting": {
        flush();
        const code = xmlElements(node, "codeline").map(xmlText).join("\n");
        blocks.push(`\`\`\`c\n${code || xmlText(node).trim()}\n\`\`\``);
        break;
      }
      case "verbatim": {
        flush();
        blocks.push(`\`\`\`text\n${xmlText(node).trim()}\n\`\`\``);
        break;
      }
      case "simplesect": {
        flush();
        const label = DOXY_SECTION_LABEL[node.attrs.kind];
        const body = doxyBlocks(node.children);
        if (body) blocks.push(label ? `**${label}:** ${mdCell(body)}` : body);
        break;
      }
      case "parameterlist": {
        flush();
        const rows = xmlElements(node, "parameteritem").map((item) => {
          const names = xmlElements(item, "parameternamelist")
            .flatMap((list) => xmlElements(list, "parametername"))
            .map((n) => xmlText(n).trim())
            .filter(Boolean);
          const desc = xmlChild(item, "parameterdescription");
          return `| \`${names.join(", ")}\` | ${mdCell(desc ? doxyBlocks(desc.children) : "")} |`;
        });
        if (!rows.length) break;
        const label = DOXY_PARAMLIST_LABEL[node.attrs.kind] ?? "Parameters";
        blocks.push(
          [
            `**${label}**`,
            "",
            "| Name | Description |",
            "| --- | --- |",
            ...rows,
          ].join("\n"),
        );
        break;
      }
      default:
        inline.push(node);
    }
  }
  flush();
  return blocks.join("\n\n");
}

/** Brief + detailed description of a Doxygen member/compound.
 * @param {XmlElement} node @returns {string} */
function doxyDescription(node) {
  const brief = xmlChild(node, "briefdescription");
  const detail = xmlChild(node, "detaileddescription");
  return [
    brief ? doxyBlocks(brief.children) : "",
    detail ? doxyBlocks(detail.children) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Break a long C declaration onto one line per parameter (splitting only at
 * top-level commas, so function-pointer parameters stay intact).
 * @param {string} sig @returns {string} */
function formatCSignature(sig) {
  const open = sig.indexOf("(");
  const close = sig.lastIndexOf(")");
  if (sig.length <= 76 || open === -1 || close <= open) return sig;
  const args = sig.slice(open + 1, close);
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "(" || c === "[") depth += 1;
    else if (c === ")" || c === "]") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(args.slice(start).trim());
  if (parts.length < 2) return sig;
  return `${sig.slice(0, open)}(\n    ${parts.join(",\n    ")}\n)${sig.slice(close + 1)}`;
}

/** @param {XmlElement} member @returns {string} */
function doxyMemberName(member) {
  return xmlTextOf(member, "name").trim();
}

/** A function member: `### name` + its C declaration + description.
 * @param {XmlElement} member @returns {string} */
function renderDoxyFunction(member) {
  const name = doxyMemberName(member);
  const signature = formatCSignature(
    `${xmlTextOf(member, "definition")}${xmlTextOf(member, "argsstring")}`.trim(),
  );
  return [
    `### ${name} [#${name}]`,
    "",
    "```c",
    signature,
    "```",
    "",
    doxyDescription(member),
  ]
    .join("\n")
    .trim();
}

/** Compact table for declaration-only members (typedefs, macros, variables).
 * @param {string} title @param {XmlElement[]} members @returns {string} */
function renderDoxyMemberTable(title, members) {
  const documented = members.some((m) => doxyDescription(m));
  const header = documented
    ? ["| Name | Definition | Description |", "| --- | --- | --- |"]
    : ["| Name | Definition |", "| --- | --- |"];
  const rows = members.map((m) => {
    const definition =
      `${xmlTextOf(m, "definition")}${xmlTextOf(m, "argsstring")}`.trim();
    const cells = [
      `\`${doxyMemberName(m)}\``,
      definition ? `\`${definition}\`` : "",
    ];
    if (documented) cells.push(mdCell(doxyDescription(m)));
    return `| ${cells.join(" | ")} |`;
  });
  return [`## ${title}`, "", ...header, ...rows].join("\n");
}

/** @param {XmlElement} member @returns {string} */
function renderDoxyEnum(member) {
  const name = doxyMemberName(member) || "anonymous";
  const rows = xmlElements(member, "enumvalue").map((value) => {
    const initializer = xmlTextOf(value, "initializer")
      .replace(/^\s*=\s*/, "")
      .trim();
    return `| \`${doxyMemberName(value)}\` | ${initializer ? `\`${initializer}\`` : ""} | ${mdCell(doxyDescription(value))} |`;
  });
  return [
    `### ${name} [#${name}]`,
    "",
    doxyDescription(member),
    "",
    "| Value | Initializer | Description |",
    "| --- | --- | --- |",
    ...rows,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** A struct compound: `### Name` + description + a table of its fields (function
 * pointer fields keep their full type, e.g. `void(*)(Instance, uint64_t)`).
 * @param {XmlElement} compound @returns {string} */
function renderDoxyStruct(compound) {
  const name = xmlTextOf(compound, "compoundname").trim();
  const fields = xmlElements(compound, "sectiondef")
    .flatMap((section) => xmlElements(section, "memberdef"))
    .filter((m) => m.attrs.kind === "variable");
  const rows = fields.map((field) => {
    const type =
      `${xmlTextOf(field, "type")}${xmlTextOf(field, "argsstring")}`.trim();
    return `| \`${doxyMemberName(field)}\` | ${type ? `\`${type}\`` : ""} | ${mdCell(doxyDescription(field))} |`;
  });
  return [
    `### ${name} [#${name}]`,
    "",
    doxyDescription(compound),
    "",
    ...(rows.length
      ? ["| Field | Type | Description |", "| --- | --- | --- |", ...rows]
      : []),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Render a Breathe `.. doxygenfile:: <header>` directive as MDX: the header's
 * own description followed by its macros, typedefs, structs, enums and
 * functions. Returns null when the header has no Doxygen XML (caller falls back
 * to a placeholder).
 * @param {string} header @returns {string | null} */
function renderDoxygenFile(header) {
  const compound = doxygenFiles.get(header);
  if (!compound) return null;
  const members = xmlElements(compound.file, "sectiondef").flatMap((section) =>
    xmlElements(section, "memberdef"),
  );
  /** @param {string} kind @returns {XmlElement[]} */
  const byKind = (kind) => members.filter((m) => m.attrs.kind === kind);
  /** @type {string[]} */
  const parts = [];
  const fileDoc = doxyDescription(compound.file);
  if (fileDoc) parts.push(fileDoc);
  const defines = byKind("define");
  const typedefs = byKind("typedef");
  const variables = byKind("variable");
  const enums = byKind("enum");
  const functions = byKind("function");
  if (defines.length) parts.push(renderDoxyMemberTable("Macros", defines));
  if (typedefs.length) parts.push(renderDoxyMemberTable("Typedefs", typedefs));
  if (compound.structs.length) {
    parts.push("## Structs", ...compound.structs.map(renderDoxyStruct));
  }
  if (enums.length) parts.push("## Enums", ...enums.map(renderDoxyEnum));
  if (variables.length)
    parts.push(renderDoxyMemberTable("Variables", variables));
  if (functions.length)
    parts.push("## Functions", ...functions.map(renderDoxyFunction));
  return parts.length ? parts.join("\n\n") : null;
}

/**
 * Bring the module's executed-notebook cache up to date (see NotebookExecution)
 * and return its directory, or null when the module doesn't execute notebooks.
 * Without `uv` (e.g. the site image's builder stage) the cache must already have
 * been produced elsewhere with the same settings.
 * @param {DocsModule} mod @returns {string | null}
 */
function executeNotebooks(mod) {
  if (!mod.execute) return null;
  const outDir = path.join(cacheRoot, ".nb-exec", mod.name);
  const settings = {
    exclude: [...(mod.execute.exclude ?? [])].sort(),
    skipDirs: [...(mod.skipDirs ?? [])].sort(),
    timeout: mod.execute.timeout ?? 120,
  };
  const args = [
    "run",
    "--project",
    mod.execute.project,
    "--frozen",
    "--with-requirements",
    path.join(scriptDir, "execute-requirements.txt"),
    "python",
    path.join(scriptDir, "execute_notebooks.py"),
    "--root",
    mod.sphinxRoot,
    "--out",
    outDir,
    "--timeout",
    String(settings.timeout),
    ...settings.exclude.flatMap((p) => ["--exclude", p]),
    ...settings.skipDirs.flatMap((d) => ["--skip-dir", d]),
  ];
  console.log(`[generate-docs] ${mod.name}: executing notebooks`);
  const run = spawnSync("uv", args, { stdio: "inherit" });
  if (run.error && /** @type {any} */ (run.error).code === "ENOENT") {
    console.log(
      `[generate-docs] ${mod.name}: uv not found, using the pre-executed notebooks in ${outDir}`,
    );
  } else if (run.error || run.status !== 0) {
    throw new Error(`[generate-docs] ${mod.name}: notebook execution failed`, {
      cause: run.error,
    });
  }
  const manifest = path.join(outDir, ".execution.json");
  if (!fs.existsSync(manifest)) {
    throw new Error(
      `[generate-docs] ${mod.name}: no executed notebooks at ${outDir}`,
    );
  }
  const used = fs.readFileSync(manifest, "utf8");
  if (JSON.stringify(JSON.parse(used)) !== JSON.stringify(settings)) {
    throw new Error(
      `[generate-docs] ${mod.name}: notebooks in ${outDir} were executed with ${used.trim()}, but the module config asks for ${JSON.stringify(settings)}`,
    );
  }
  return outDir;
}

/**
 * The executed copy of `source` from the cache, or null if it isn't executed
 * (excluded, or not a notebook). A copy of an older revision is an error: it
 * would publish outputs that no longer match the code shown.
 * @param {string} executedDir @param {string} source @returns {any}
 */
function readExecuted(executedDir, source) {
  const rel = path.relative(M.sphinxRoot, source);
  const file = path.join(
    executedDir,
    rel.endsWith(".ipynb") ? rel : `${rel}.ipynb`,
  );
  if (!fs.existsSync(file)) return null;
  const nb = JSON.parse(fs.readFileSync(file, "utf8"));
  const digest = createHash("sha256").update(fs.readFileSync(source)).digest("hex");
  if (nb.metadata?.docs_build?.source_sha256 !== digest) {
    throw new Error(`executed copy is out of date: ${file}`);
  }
  return nb;
}

/**
 * Run Doxygen over a module's C headers and index the resulting XML by header
 * file name, so `.. doxygenfile::` directives can be rendered inline. Returns an
 * empty map when the headers are missing or Doxygen isn't installed, so the docs
 * still build (with placeholders) without the C toolchain.
 * @param {{ name: string, doxygen?: { input: string, filePatterns?: string } }} mod
 * @returns {Map<string, DoxyCompound>}
 */
function prepareDoxygen(mod) {
  /** @type {Map<string, DoxyCompound>} */
  const files = new Map();
  const cfg = mod.doxygen;
  if (!cfg) return files;
  if (!fs.existsSync(cfg.input)) {
    console.warn(
      `[generate-docs] ${mod.name} C headers not found: ${cfg.input}`,
    );
    return files;
  }
  const outDir = path.join(cacheRoot, ".doxygen", mod.name);
  const xmlDir = path.join(outDir, "xml");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const doxyfile = path.join(outDir, "Doxyfile");
  fs.writeFileSync(
    doxyfile,
    [
      `INPUT = "${cfg.input}"`,
      `FILE_PATTERNS = ${cfg.filePatterns ?? "*.h"}`,
      "RECURSIVE = YES",
      `OUTPUT_DIRECTORY = "${outDir}"`,
      "XML_OUTPUT = xml",
      "GENERATE_XML = YES",
      "GENERATE_HTML = NO",
      "GENERATE_LATEX = NO",
      // The rendered pages show declarations, not bodies, and undocumented
      // members are still listed (matching Breathe's `doxygenfile` output).
      "XML_PROGRAMLISTING = NO",
      "OPTIMIZE_OUTPUT_FOR_C = YES",
      "QUIET = YES",
      "WARNINGS = NO",
      "WARN_IF_UNDOCUMENTED = NO",
      "",
    ].join("\n"),
    "utf8",
  );
  try {
    execFileSync("doxygen", [doxyfile], { cwd: outDir, stdio: "pipe" });
  } catch (err) {
    console.warn(
      `[generate-docs] ${mod.name}: doxygen unavailable or failed (${
        err instanceof Error ? err.message.split("\n")[0] : err
      }) — C API pages fall back to a placeholder`,
    );
    return files;
  }
  if (!fs.existsSync(xmlDir)) return files;
  /** @type {Map<string, XmlElement>} */
  const structs = new Map();
  /** @type {XmlElement[]} */
  const fileCompounds = [];
  for (const entry of fs.readdirSync(xmlDir)) {
    if (
      !entry.endsWith(".xml") ||
      entry === "index.xml" ||
      entry === "Doxyfile.xml"
    ) {
      continue;
    }
    const root = parseXml(fs.readFileSync(path.join(xmlDir, entry), "utf8"));
    for (const doc of xmlElements(root, "doxygen")) {
      for (const compound of xmlElements(doc, "compounddef")) {
        if (compound.attrs.kind === "file") fileCompounds.push(compound);
        else if (
          compound.attrs.kind === "struct" ||
          compound.attrs.kind === "union"
        ) {
          structs.set(compound.attrs.id, compound);
        }
      }
    }
  }
  for (const compound of fileCompounds) {
    const name = xmlTextOf(compound, "compoundname").trim();
    if (!name) continue;
    // `<innerclass>` references the structs declared in this header; they are
    // separate compounds (own XML files) that we inline into the header's page.
    const declared = xmlElements(compound, "innerclass")
      .map((ref) => structs.get(ref.attrs.refid))
      .filter(/** @returns {c is XmlElement} */ (c) => Boolean(c));
    files.set(name, { file: compound, structs: declared });
  }
  return files;
}

/**
 * Single-pass converter for MyST directive fences (backtick ```` ```{name} ````
 * and colon `:::{name}`): `{eval-rst}` -> pandoc, `{image}`/`{figure}` -> `<img>`
 * / `<figure>`, `{code}`/`{code-block}` -> a plain code fence, admonitions ->
 * `<Callout>`, `{toctree}` -> dropped. Plain code fences and other content pass
 * through untouched. `opts.admonitions=false` leaves admonition fences intact
 * (used when preprocessing notebook cells, where a later pass maps them).
 * @param {string} md @param {string} srcDir
 * @param {{ admonitions?: boolean }} [opts] @returns {string}
 */
function convertMystDirectives(md, srcDir, opts = {}) {
  const doAdmonitions = opts.admonitions !== false;
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dir = line.match(/^(`{3,}|~{3,}|:{3,})\{([\w-]+)\}[ \t]*(.*)$/);
    if (dir) {
      const fenceChar = dir[1][0];
      const fenceLen = dir[1].length;
      const name = dir[2].toLowerCase();
      const arg = dir[3].trim();
      /** @type {string[]} */
      const body = [];
      const closeRe = new RegExp(`^\\${fenceChar}{${fenceLen},}[ \\t]*$`);
      i += 1;
      for (; i < lines.length; i++) {
        if (closeRe.test(lines[i])) break;
        body.push(lines[i]);
      }
      if (name === "toctree") continue; // nav comes from the index files
      if (name === "eval-rst") {
        const rst = body.join("\n");
        // Breathe C/C++ API directives (`.. doxygenfile::` etc.): rendered from
        // the module's Doxygen XML when available (see prepareDoxygen), else an
        // informative placeholder instead of pandoc's bare-filename output.
        const doxy = rst.match(/^\s*\.\.\s+doxygen(\w+)::\s*(.+?)\s*$/m);
        if (doxy) {
          const target = doxy[2].trim();
          const rendered =
            doxy[1] === "file" ? renderDoxygenFile(target) : null;
          if (rendered) {
            out.push(rendered);
            continue;
          }
          out.push(
            `<Callout type="info">`,
            "",
            `The C API reference for \`${target}\` is generated from the Selene C headers with Doxygen and is not yet rendered here. See the [Selene C headers and example plugins](https://github.com/Quantinuum/selene/tree/main/selene-core).`,
            "",
            `</Callout>`,
          );
          continue;
        }
        out.push(pandocRstFragment(rst, srcDir));
        continue;
      }
      if (name === "code" || name === "code-block") {
        const lang = arg.split(/\s+/)[0] || "text";
        out.push(`\`\`\`${lang}`, ...body, "```");
        continue;
      }
      // MyST-NB executable cells (`{code-cell} ipython3`). We don't execute `.md`
      // pages (no stored outputs), so render the source as a highlighted fence;
      // the arg is the kernel name, so map ipython* -> python.
      if (name === "code-cell") {
        const { rest } = parseDirectiveOptions(body);
        const kernel = arg.split(/\s+/)[0] || "";
        const lang = /ipython|python/i.test(kernel)
          ? "python"
          : kernel || "python";
        out.push(`\`\`\`${lang}`, ...rest, "```");
        continue;
      }
      if (name === "rubric") {
        // A small bold heading; passing it through as a fence makes Quarto mangle
        // it (and the following content) in the notebook path.
        if (arg) out.push(`**${arg.replace(/:\s*$/, "")}**`, "");
        out.push(...body);
        continue;
      }
      if (name === "image") {
        const { opts: o } = parseDirectiveOptions(body);
        out.push(mystImgTag(arg, o));
        continue;
      }
      if (name === "figure") {
        const { opts: o, rest } = parseDirectiveOptions(body);
        const caption = rest.join("\n").trim();
        out.push(
          `<figure>${mystImgTag(arg, o)}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`,
        );
        continue;
      }
      // sphinx_design grid/card -> Fumadocs <Cards>/<Card>. A `{grid} N` becomes
      // an N-column card grid; each `{grid-item-card} Title` with an optional
      // `:link:` becomes a card (clickable when linked). Bodies are converted
      // recursively so nested `{figure}`/images/code render inside the card.
      if (name === "grid") {
        const cols = (arg.match(/\d+/g) || []).pop();
        const style = cols
          ? ` style={{ gridTemplateColumns: "repeat(${cols}, minmax(0, 1fr))" }}`
          : "";
        out.push(
          `<Cards${style}>`,
          "",
          convertMystDirectives(body.join("\n"), srcDir, opts),
          "",
          "</Cards>",
        );
        continue;
      }
      if (name === "grid-item-card" || name === "card") {
        const { opts: o, rest } = parseDirectiveOptions(body);
        const link = resolveCardLink(o.link, srcDir);
        const attrs = [`title="${htmlAttr(arg)}"`];
        if (link) {
          attrs.push(`href="${htmlAttr(link.href)}"`);
          if (link.external) attrs.push("external");
        }
        out.push(
          `<Card ${attrs.join(" ")}>`,
          "",
          convertMystDirectives(rest.join("\n"), srcDir, opts),
          "",
          "</Card>",
        );
        continue;
      }
      const type = ADMONITION_TYPE[name];
      if (type && doAdmonitions) {
        const title = arg ? ` title=${JSON.stringify(arg)}` : "";
        out.push(
          `<Callout type="${type}"${title}>`,
          "",
          ...body,
          "",
          "</Callout>",
        );
        continue;
      }
      // Unknown directive (or a passed-through admonition): keep it verbatim so
      // nothing is silently lost.
      out.push(
        line,
        ...(name === "tab-set" || name === "tab-item"
          ? convertMystDirectives(body.join("\n"), srcDir, opts).split("\n")
          : body),
        fenceChar.repeat(fenceLen),
      );
      continue;
    }
    // Pass a plain code fence (```lang) through untouched.
    const code = line.match(/^(`{3,}|~{3,})/);
    if (code) {
      const closeRe = new RegExp(
        `^\\${code[1][0]}{${code[1].length},}[ \\t]*$`,
      );
      out.push(line);
      i += 1;
      for (; i < lines.length; i++) {
        out.push(lines[i]);
        if (closeRe.test(lines[i])) break;
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Drop MyST line comments — a line whose first character is `%`. Fence- and
 * math-aware so a `%` inside a code fence or a `$$…$$` display-math block (a LaTeX
 * comment) is preserved.
 * @param {string} md @returns {string} */
function stripMystComments(md) {
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  /** @type {string | null} */
  let fenceChar = null;
  let inMath = false;
  for (const line of lines) {
    if (fenceChar) {
      out.push(line);
      if (new RegExp(`^\\s*\\${fenceChar}{3,}\\s*$`).test(line))
        fenceChar = null;
      continue;
    }
    const open = line.match(/^\s*(`|~){3,}/);
    if (open) {
      fenceChar = open[1];
      out.push(line);
      continue;
    }
    if (!inMath && /^%/.test(line)) continue;
    if ((line.match(/\$\$/g) || []).length % 2 === 1) inMath = !inMath;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Convert a MyST-markdown prose page (`.md`) to MDX. The file is already
 * Markdown, so it is transformed in place: MyST directives -> MDX components
 * (convertMystDirectives), embedded RST roles from `{eval-rst}` -> links
 * (resolveRoles), MyST roles -> links (resolveMystRoles), `(label)=` anchors
 * dropped, images staged, then MDX-sanitised.
 * @param {string} src @param {DocIndex} index @param {string} relNoExt
 * @returns {string} */
function convertMyst(src, index, relNoExt) {
  const srcDir = path.dirname(src);
  const { body } = stripYamlFrontmatter(fs.readFileSync(src, "utf8"));
  // Drop HTML comments (<!-- … -->) and MyST line comments (`%` at line start):
  // neither is valid MDX, so they'd otherwise leak as visible text (e.g. the
  // commitizen note atop the qnexus CHANGELOG).
  let md = convertMystDirectives(
    stripMystComments(body.replace(/<!--[\s\S]*?-->/g, "")),
    srcDir,
  );
  // Drop standalone MyST `(label)=` target lines (indexed for cross-refs; the
  // following heading carries the rehype-slug id the ref links to).
  md = md.replace(/^\([^)\n]+\)=[ \t]*$/gm, "");
  md = resolveRoles(md, index, relNoExt, src); // RST spans emitted by eval-rst pandoc
  md = resolveMystRoles(md, index, relNoExt, src); // MyST roles in the prose
  md = rewriteDocLinks(md, relNoExt, index); // plain relative doc links -> URLs
  md = imageTransform(md, srcDir);
  md = tabsTransform(calloutTransform(md));
  return mdxSafe(displayMath(md));
}

/** Convert a Jupyter notebook to MDX via QUARTO (renders to gfm from the
 * notebook's stored outputs, or those of its executed copy — Quarto itself never
 * executes). Quarto output images (`<nb>_files/…`) are staged, then the shared
 * transforms clean MyST roles/admonitions/`<center>`, stage `_static` images,
 * and MDX-sanitise. Pandoc still handles whole-file RST prose (Quarto can't read
 * .rst); this path is notebooks only.
 * @param {string} src @param {DocIndex} index @param {string} relNoExt
 * @param {any} [nbJson] The notebook to render in place of `src`'s contents (an
 *   executed copy, possibly of a MyST-NB `.md` page).
 * @returns {string} */
function convertNotebookViaQuarto(
  src,
  index,
  relNoExt,
  nbJson = JSON.parse(fs.readFileSync(src, "utf8")),
) {
  const nbDir = path.dirname(src);
  const nbBase = path.basename(src).replace(/\.(ipynb|md)$/, "");
  const relNb = path
    .relative(M.sphinxRoot, src)
    .replace(/\.(ipynb|md)$/, "")
    .split(path.sep)
    .join("/");
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "qdoc-"));
  try {
    // Preprocess MyST directives embedded in markdown cells (`{eval-rst}` csv/
    // list tables, `{image}`, `{code}`) BEFORE Quarto — Quarto mangles them into
    // garbled escaped-backtick blocks. Admonitions are left for the post-Quarto
    // mystAdmonitionTransform. The cleaned notebook is rendered from staging.
    for (const cell of nbJson.cells ?? []) {
      if (cell.cell_type === "markdown") {
        let s = convertMystDirectives(
          stripMystComments(nbText(cell.source).replace(/<!--[\s\S]*?-->/g, "")),
          nbDir,
          {
            admonitions: false,
          },
        );
        // eval-rst expansion emits pandoc role/attr spans; resolve + strip them
        // NOW (before Quarto) — Quarto mangles leftover `{…}` attribute spans.
        if (s.includes("{.interpreted-text") || s.includes("]{")) {
          s = resolveRoles(s, index, relNoExt, src).replace(/\{\.[^}]*\}/g, "");
        }
        // Store back as an nbformat LINE LIST (not a single string): Quarto's
        // .ipynb reader mis-parses a joined-string source and merges a heading
        // into the paragraph that follows it.
        const lines = s.split("\n");
        cell.source = lines.map((l, i) =>
          i < lines.length - 1 ? `${l}\n` : l,
        );
      } else if (cell.cell_type === "code") {
        for (const output of cell.outputs ?? []) {
          // Tracebacks and some streams carry terminal colour codes.
          if (output.traceback) output.traceback = output.traceback.map(stripAnsi);
          if (output.text) output.text = stripAnsi(nbText(output.text));
          const html = output.data?.["text/html"];
          const iframe = html && stageSrcdocIframe(nbText(html), relNb);
          if (iframe) output.data["text/html"] = iframe;
        }
      }
    }
    const nbInput = path.join(staging, `${nbBase}.ipynb`);
    fs.writeFileSync(nbInput, JSON.stringify(nbJson));
    execFileSync(
      "quarto",
      [
        "render",
        nbInput,
        "--to",
        "gfm",
        "--no-execute",
        "--output-dir",
        staging,
      ],
      { stdio: "pipe" },
    );
    let md = fs.readFileSync(path.join(staging, `${nbBase}.md`), "utf8");
    // Stage Quarto's extracted output images (<nb>_files/…) under the notebook's
    // asset path and rewrite refs to the served URL (before imageTransform).
    md = md.replace(
      new RegExp(`\\]\\((${escapeRegExp(nbBase)}_files/[^)\\s]+)\\)`, "g"),
      (full, rel) => {
        const abs = path.join(staging, rel);
        if (!fs.existsSync(abs)) return full;
        const outRel = `${relNb}/${rel}`;
        const dest = path.join(M.assetRoot, outRel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(abs, dest);
        const url = `/${M.assetSubdir}/${outRel}`;
        stagedImages.add(url);
        return `](${url})`;
      },
    );
    md = fixNbTitleLabels(md);
    md = centerTransform(resolveMystRoles(md, index, relNoExt, src));
    // Embedded `{eval-rst}` cells (preprocessed to pandoc output) leave RST role
    // spans (`…{.interpreted-text role=…}`) that resolveMystRoles doesn't touch.
    md = resolveRoles(md, index, relNoExt, src);
    md = rewriteDocLinks(md, relNoExt, index); // plain relative doc links -> URLs
    md = mystAdmonitionTransform(md);
    md = imageTransform(md, nbDir);
    md = fenceIndentedCode(md);
    md = tabsTransform(calloutTransform(md));
    return mdxSafe(displayMath(md));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** @param {string} s @returns {string} */
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

/** A notebook HTML output embedding a whole document in `<iframe srcdoc>` (e.g.
 * pytket's interactive circuit renderer) can't be expressed as MDX. Stage that
 * document as a static page and return a one-line iframe pointing at it; null
 * when the output has no srcdoc. The sandbox gives the page's scripts an opaque
 * origin, so they can't reach the docs site.
 * @param {string} html @param {string} relNb @returns {string | null} */
function stageSrcdocIframe(html, relNb) {
  const srcdoc = html.match(/<iframe\b[^>]*?\ssrcdoc="([^"]*)"/i)?.[1];
  if (srcdoc === undefined) return null;
  const doc = decodeXml(srcdoc);
  const hash = createHash("sha256").update(doc).digest("hex").slice(0, 16);
  const outRel = `${relNb}/_html/${hash}.html`;
  const dest = path.join(M.assetRoot, outRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, doc);
  const height = html.match(/\bheight:\s*(\d+px)/i)?.[1] ?? "400px";
  const src = htmlAttr(encodeURI(`/${M.assetSubdir}/${outRel}`));
  return `<div style="resize: vertical; overflow: auto; height: ${height}"><iframe src="${src}" title="Notebook output" loading="lazy" sandbox="allow-scripts" width="100%" height="100%" style="border: none"></iframe></div>`;
}

/** `/<module>/...` URL for a sphinx-relative doc path (no extension).
 * @param {string} rel
 * @returns {string} */
function urlForRel(rel) {
  const parts = (outputMap.get(rel) ?? rel).split("/").filter(Boolean);
  if (parts[parts.length - 1] === "index") parts.pop();
  return `/${M.routeBase}/${parts.join("/")}/`.replace(/\/{2,}/g, "/");
}

/** Page URL without a trailing slash, to match fumadocs page-tree node URLs.
 * @param {string} rel @returns {string} */
function navUrl(rel) {
  return urlForRel(rel).replace(/\/$/, "");
}

/** Rewrite plain relative Markdown links to other doc pages (`[t](x/y.ipynb#a)`)
 * to their served URL via urlForRel, accounting for clean folder URLs. Skips external
 * links, in-page anchors, and asset files; leaves unknown targets untouched.
 * @param {string} md @param {string} currentRelNoExt @param {DocIndex} index
 * @returns {string} */
function rewriteDocLinks(md, currentRelNoExt, index) {
  return md.replace(/(?<!!)\[([^\]]*)\]\(([^)\s]+)\)/g, (full, text, href) => {
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return full;
    const [p, anchor] = href.split("#");
    if (!p || /\.(png|jpe?g|gif|svg|webp|pdf|csv|json|zip)$/i.test(p)) {
      return full;
    }
    const noExt = p.replace(/\.(ipynb|md|rst|html)$/i, "");
    const rel = path.posix.normalize(
      path.posix.join(path.posix.dirname(currentRelNoExt), noExt),
    );
    if (!index.titles.has(rel)) return full;
    return `[${text}](${urlForRel(rel)}${anchor ? `#${anchor}` : ""})`;
  });
}

const RST_UNDERLINE = /^[=\-~^"*#+`'.:_]{3,}\s*$/;

/**
 * Reduce RST inline markup in a heading title to the plain text a reader sees, so
 * it can be reused as `:ref:`/`:doc:` link text and slugged like rehype-slug does
 * the rendered heading. Crucially, an RST hyperlink title (`` `0.2.0 <url>`_ ``)
 * collapses to `0.2.0` — otherwise it becomes a link nested inside the ref link.
 * @param {string} text @returns {string}
 */
function cleanRstInline(text) {
  return text
    .replace(/`([^`<]+?)\s*<[^`<>]+>`__?/g, (_m, t) => t.trim()) // `text <url>`_
    .replace(/:[\w:+-]+:`([^`]+)`/g, (_m, body) => {
      const mm = body.match(/^(.*?)\s*<[^<>]+>$/); // :role:`text <target>`
      return (mm ? mm[1] : body).trim();
    })
    .replace(/``([^`]+)``/g, "$1") // ``literal``
    .replace(/`([^`]+)`/g, "$1") // `title-ref`
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **strong**
    .replace(/\*([^*]+)\*/g, "$1") // *emphasis*
    .trim();
}

/**
 * Collect RST section headings (title line + punctuation underline). Anchors are
 * filled in later by buildIndex (per-page, via github-slugger).
 * @param {string[]} lines
 * @returns {{ line: number, text: string, slug: string }[]}
 */
function collectHeadings(lines) {
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const t = lines[i].trim();
    const u = lines[i + 1];
    if (t && RST_UNDERLINE.test(u) && u.trim().length >= t.length) {
      out.push({ line: i, text: cleanRstInline(t), slug: "" });
    }
  }
  return out;
}

/**
 * Markdown lines from a notebook's markdown cells, concatenated in document
 * order (a blank line marks each cell boundary) so headings/labels can be
 * indexed the same way as an RST file.
 * @param {string} src @returns {string[]}
 */
function notebookMarkdownLines(src) {
  const nb = JSON.parse(fs.readFileSync(src, "utf8"));
  /** @type {string[]} */
  const out = [];
  for (const cell of nb.cells ?? []) {
    if (cell.cell_type !== "markdown") continue;
    out.push(...nbText(cell.source).split(/\r?\n/), "");
  }
  return out;
}

const ATX_HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;

/**
 * Collect Markdown ATX headings (`## Title`), skipping fenced code blocks so a
 * `#` comment inside a code sample isn't mistaken for a heading.
 * @param {string[]} lines
 * @returns {{ line: number, text: string, slug: string }[]}
 */
function collectMarkdownHeadings(lines) {
  /** @type {{ line: number, text: string, slug: string }[]} */
  const out = [];
  /** @type {string | null} */
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      const marker = f[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence) continue;
    const m = lines[i].match(ATX_HEADING);
    if (m) out.push({ line: i, text: m[2].trim(), slug: "" });
  }
  return out;
}

/**
 * Collect label definitions of a given style, each paired with the source line
 * so it can be attached to the following heading.
 * @param {string[]} lines @param {RegExp} re @returns {{line:number,label:string}[]}
 */
function collectLabels(lines, re) {
  /** @type {{line:number,label:string}[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) out.push({ line: i, label: m[1].trim() });
  }
  return out;
}

const RST_LABEL = /^\.\.\s+_([^:]+):\s*$/;
const MYST_LABEL = /^\(([^)]+)\)=\s*$/;

const RST_SUBST_REF = /\|([^|\s][^|]*)\|/g;

/** Collect the RST substitution definitions (`.. |Name| replace:: value`) a page
 * can see, including those in the partials it `.. include::`s.
 * @param {string} file @returns {Map<string,string>} */
function collectRstSubstitutions(file) {
  const text = inlineIncludes(fs.readFileSync(file, "utf8"), path.dirname(file));
  /** @type {Map<string,string>} */
  const subs = new Map();
  for (const m of text.matchAll(
    /^\s*\.\.\s+\|([^|]+)\|\s+replace::\s*(.+)$/gm,
  )) {
    subs.set(m[1].trim(), m[2].trim());
  }
  return subs;
}

/**
 * First pass: index every label (RST `.. _label:` and notebook MyST `(label)=`)
 * to its page URL + section anchor, each page's title, and the set of heading
 * slugs per page, so `:ref:`/`:doc:` can resolve across files (including
 * nbsphinx path refs into notebooks).
 * @param {string[]} files
 */
function buildIndex(files) {
  /** @type {Map<string, {url:string, anchor:string, title:string}>} */
  const labels = new Map();
  /** @type {Map<string,string>} */
  const titles = new Map();
  /** @type {Map<string, Set<string>>} */
  const headingSlugs = new Map();
  for (const file of files) {
    const isNb = file.endsWith(".ipynb");
    const isMyst = isNb || file.endsWith(".md");
    const relNoExt = path
      .relative(M.sphinxRoot, file)
      .replace(/\.(rst|ipynb|md)$/, "")
      .split(path.sep)
      .join("/");
    const lines = isNb
      ? notebookMarkdownLines(file)
      : fs.readFileSync(file, "utf8").split(/\r?\n/);
    const headings = isMyst
      ? collectMarkdownHeadings(lines)
      : collectHeadings(lines);
    const labelDefs = collectLabels(lines, isMyst ? MYST_LABEL : RST_LABEL);
    // Pandoc expands RST substitutions (`|Version|`, usually defined in an
    // included partial) when converting the page, so the index must too — a
    // cross-reference to such a page would otherwise show the raw `|Version|`
    // as its link text, and its heading slugs would not match the rendered ones.
    if (!isMyst && headings.some((h) => h.text.includes("|"))) {
      const subs = collectRstSubstitutions(file);
      for (const h of headings) {
        h.text = h.text.replace(
          RST_SUBST_REF,
          (m, /** @type {string} */ name) => subs.get(name.trim()) ?? m,
        );
      }
    }
    // Assign anchors with a per-page github-slugger so duplicate headings get the
    // same `-1/-2` suffixes rehype-slug emits at render. The first heading (the
    // H1 title) is lifted into frontmatter and rendered by <DocsTitle> without an
    // id, so it must not consume a slug counter.
    const slugger = new GithubSlugger();
    headings.forEach((h, idx) => {
      h.slug = idx === 0 ? "" : slugger.slug(h.text);
    });
    const pageTitle = headings[0]?.text ?? path.basename(relNoExt);
    titles.set(relNoExt, pageTitle);
    headingSlugs.set(
      relNoExt,
      new Set(headings.map((h) => h.slug).filter(Boolean)),
    );
    const url = urlForRel(relNoExt);
    for (const { line, label } of labelDefs) {
      const target = headings.find((h) => h.line > line);
      const isPageTitle =
        target && headings[0] && target.line === headings[0].line;
      labels.set(label.toLowerCase(), {
        url,
        anchor: target && !isPageTitle ? target.slug : "",
        title: target ? target.text : pageTitle,
      });
    }
  }
  return { labels, titles, headingSlugs };
}

/** @typedef {ReturnType<typeof buildIndex>} DocIndex */

/** @type {Set<string>} */
const unresolvedRefs = new Set();

/**
 * Approximate rehype-slug for an nbsphinx-style `#Heading-Anchor` (heading text
 * with spaces already hyphenated): lowercase and normalise punctuation. Validated
 * against the target page's real slug set, so exactness isn't required.
 * @param {string} s @returns {string}
 */
function slugifyAnchor(s) {
  return s
    .toLowerCase()
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve an nbsphinx path-style reference target (`/tutorials/x.ipynb#Anchor`
 * or a relative `y.rst`) to a Fumadocs link, or null if the page isn't indexed.
 * The `#Anchor` is kept only when it matches a real heading slug on that page
 * (a page-title heading has no id, so such refs link to the page top).
 * @param {string} target @param {string} currentRelNoExt @param {DocIndex} index
 * @param {string} linkText @returns {string | null}
 */
function resolveDocPathRef(target, currentRelNoExt, index, linkText) {
  const hashIdx = target.indexOf("#");
  const rawPath = (hashIdx === -1 ? target : target.slice(0, hashIdx)).trim();
  const rawAnchor = hashIdx === -1 ? "" : target.slice(hashIdx + 1).trim();
  if (!rawPath) return null; // bare `#anchor` (same-page) — not handled here
  const noExt = rawPath.replace(/\.(ipynb|rst|md|html)$/i, "");
  const docRel = noExt.startsWith("/")
    ? noExt.replace(/^\/+/, "")
    : path.posix.normalize(
        path.posix.join(path.posix.dirname(currentRelNoExt), noExt),
      );
  const title = index.titles.get(docRel);
  if (title === undefined) return null;
  let anchor = "";
  if (rawAnchor) {
    const cand = slugifyAnchor(rawAnchor);
    if (index.headingSlugs.get(docRel)?.has(cand)) anchor = cand;
  }
  const url = anchor ? `${urlForRel(docRel)}#${anchor}` : urlForRel(docRel);
  return `[${linkText || title}](${url})`;
}

/** Undo the entity escaping pandoc applies inside its raw-HTML output, so role
 * targets read the same as in the markdown attribute-span form.
 * @param {string} s @returns {string} */
function decodeHtmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Rewrite pandoc interpreted-text role spans into Fumadocs links using the
 * cross-ref/glossary/API/bibliography indexes: `ref`/`doc` (page links), `term`
 * (glossary anchor), `py:*`/`class`/… (API symbol anchor), and the placeholder
 * `bibref`/`bibreft` (author-year citations, rewritten from `:cite:` pre-pandoc).
 * @param {string} md
 * @param {DocIndex} index
 * @param {string} currentRelNoExt
 * @param {string} [srcPath] page source path (needed to stage `:download:` files)
 */
function resolveRoles(md, index, currentRelNoExt, srcPath) {
  /** @param {string} inner @param {string} role @returns {string} */
  const rewrite = (inner, role) => {
    const m = inner.match(/^(.*?)\s*<([^<>]+)>$/);
    const linkText = m ? m[1].trim() : "";
    const target = (m ? m[2] : inner).trim();
    if (role === "download") {
      return srcPath ? stageDownload(inner, srcPath) : linkText || target;
    }
    if (role === "term") {
      const e = glossaryIndex.get(target.toLowerCase());
      return e
        ? `[${linkText || target}](${e.url}#${e.anchor})`
        : linkText || target;
    }
    if (role === "bibref" || role === "bibreft") {
      return formatCitation(inner, role === "bibreft");
    }
    if (role === "numref") {
      const e = numfigIndex.get(target.toLowerCase());
      if (e) {
        const label =
          linkText || `${e.kind === "figure" ? "Fig." : "Table"} ${e.number}`;
        return `[${label}](${e.url}#${e.anchor})`;
      }
      unresolvedRefs.add(`numref:${target}`);
      return linkText || target;
    }
    if (
      /^py:/.test(role) ||
      /^(class|func|meth|mod|attr|obj|data|exc)$/.test(role)
    ) {
      const short = target.replace(/^~/, "").split(/[.#]/).pop() || target;
      const sym = resolvePySymbol(target);
      return sym ? `[\`${short}\`](${sym.url}#${sym.anchor})` : `\`${short}\``;
    }
    if (role === "ref") {
      // Sphinx label ref: look up the indexed `.. _label:` / MyST `(label)=`.
      const e = index.labels.get(target.toLowerCase());
      if (e) {
        const url = e.anchor ? `${e.url}#${e.anchor}` : e.url;
        return `[${linkText || e.title || target}](${url})`;
      }
      // nbsphinx path ref (`text </tutorials/x.ipynb#Anchor>`): resolve the
      // doc path + heading anchor instead of a label.
      const viaPath = resolveDocPathRef(
        target,
        currentRelNoExt,
        index,
        linkText,
      );
      if (viaPath) return viaPath;
      unresolvedRefs.add(`ref:${target}`);
      return linkText || target;
    }
    if (role !== "doc") return linkText || target;
    const docRel = target.startsWith("/")
      ? target.replace(/^\/+/, "")
      : path.posix.normalize(
          path.posix.join(path.posix.dirname(currentRelNoExt), target),
        );
    const title = index.titles.get(docRel);
    if (title === undefined) {
      unresolvedRefs.add(`doc:${target}`);
      return linkText || target;
    }
    return `[${linkText || title}](${urlForRel(docRel)})`;
  };
  return (
    md
      .replace(
        /`([^`]+)`\{\.interpreted-text role="([\w:+-]+)"\}/g,
        (_full, /** @type {string} */ inner, /** @type {string} */ role) =>
          rewrite(inner, role),
      )
      // A role that lands inside raw HTML (an RST `.. table::` with a caption
      // becomes an HTML table) survives pandoc as a `<code class=…>` span rather
      // than the markdown attribute-span form above, and its target is entity-
      // escaped. Markdown output is inert there, so it is emitted as HTML.
      .replace(
        /<code class="interpreted-text" role="([\w:+-]+)">([\s\S]*?)<\/code>/g,
        (_full, /** @type {string} */ role, /** @type {string} */ inner) =>
          rewrite(decodeHtmlEntities(inner), role)
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(
              /^\[([^\]]*)\]\(([^()\s]+)\)$/,
              (_m, /** @type {string} */ text, /** @type {string} */ url) =>
                `<a href="${url}">${text}</a>`,
            ),
      )
  );
}

/**
 * Parse `.. toctree::` entries (ordered page stems) from an index.rst.
 * @param {string} text @returns {string[]}
 */
function parseToctree(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const pages = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\.\.\s+toctree::/.test(lines[i].trim())) continue;
    for (i += 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      if (!/^\s/.test(line)) break; // dedent ends the directive block
      const entry = line.trim();
      if (entry.startsWith(":")) continue; // option like :maxdepth:
      const m = entry.match(/<([^<>]+)>\s*$/);
      const ref = (m ? m[1] : entry).replace(/\.rst$/, "").trim();
      if (ref) pages.push(ref);
    }
    i -= 1;
  }
  return pages;
}

/** @param {string[]} arr */
function uniq(arr) {
  return [...new Set(arr)];
}

/** True for an absolute external URL (`https://…`, `mailto:…`). @param {string} ref */
function isExternalRef(ref) {
  return /^[a-z][\w+.-]*:\/\//i.test(ref) || ref.startsWith("mailto:");
}

/**
 * Resolve a toctree entry `ref` (relative to the index at `indexRelDir`) to a
 * page path relative to the module root. Strips extensions and any leading `../`
 * (Sphinx notebook refs like `../tutorials/x.ipynb` whose files actually live
 * under the docs root).
 * @param {string} ref @param {string} indexRelDir @returns {string}
 */
function resolveTocTarget(ref, indexRelDir) {
  const noExt = ref.replace(/\.(ipynb|rst|md)$/i, "");
  const rel = noExt.startsWith("/")
    ? noExt.replace(/^\/+/, "")
    : path.posix.normalize(
        path.posix.join(indexRelDir === "." ? "" : indexRelDir, noExt),
      );
  return rel.replace(/^(?:\.\.\/)+/, "");
}

/** Longest shared leading path segments across posix paths (`""` if none).
 * @param {string[]} paths @returns {string} */
function commonDir(paths) {
  if (paths.length === 0) return "";
  const split = paths.map((p) => p.split("/"));
  const [first] = split;
  let n = 0;
  while (n < first.length && split.every((s) => s[n] === first[n])) n += 1;
  return first.slice(0, n).join("/");
}

/**
 * Parse toctree blocks from an index file, supporting both RST (`.. toctree::`)
 * and MyST (```` ```{toctree} ````) forms. Each block yields its `:caption:` (the
 * group/section title) and entries (`Label <target>` -> {label, ref}). Sphinx
 * uses the entry caption as a page title and the block caption as the folder
 * title, both otherwise lost by the conversion.
 * @param {string} text
 * @returns {{caption: string|null, entries: {label: string|null, ref: string}[]}[]}
 */
function parseToctreeBlocks(text) {
  const lines = text.split(/\r?\n/);
  /** @type {{caption: string|null, entries: {label: string|null, ref: string}[]}[]} */
  const blocks = [];
  /** @type {{caption: string|null, entries: {label: string|null, ref: string}[]}|null} */
  let cur = null;
  let fenced = false;
  const close = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!cur) {
      if (/^`{3,}\{toctree\}/.test(trimmed)) {
        cur = { caption: null, entries: [] };
        fenced = true;
      } else if (/^\.\.\s+toctree::/.test(trimmed)) {
        cur = { caption: null, entries: [] };
        fenced = false;
      }
      continue;
    }
    if (fenced) {
      if (/^`{3,}\s*$/.test(trimmed)) {
        close();
        continue;
      }
    } else if (trimmed !== "" && !/^\s/.test(line)) {
      close(); // dedent ends an RST directive block
      i -= 1;
      continue;
    }
    if (!cur || trimmed === "") continue;
    const capM = trimmed.match(/^:caption:\s*(.+)$/);
    if (capM) {
      cur.caption = capM[1].trim();
      continue;
    }
    if (trimmed.startsWith(":")) continue; // other options (:hidden:, :maxdepth:)
    const m = trimmed.match(/^(.+?)\s*<([^<>]+)>\s*$/);
    const ref = (m ? m[2] : trimmed).replace(/\.rst$/, "").trim();
    if (ref) cur.entries.push({ label: m ? m[1].trim() || null : null, ref });
  }
  close();
  return blocks;
}

/** Turn a folder slug (`linux-reseed`) into a sidebar label (`Linux Reseed`).
 * @param {string} name
 * @returns {string} */
function prettify(name) {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Directive -> component mapping -----------------------------------------
// pandoc renders RST admonitions as GitHub alert blockquotes (`> [!NOTE]`) and
// sphinx-tabs (`.. tabs::`/`.. tab::`/`.. code-tab::`) as nested fenced divs
// (`::: {.tabs}` ...). These two passes lift them into Fumadocs <Callout> and
// <Tabs>/<Tab> components. They run after resolveRoles (so `:ref:` links inside
// are already resolved) and before mdxSafe.

/**
 * GitHub-alert kind -> Fumadocs <Callout> `type`.
 * @type {Record<string, string>}
 */
const ALERT_TO_CALLOUT = {
  NOTE: "info",
  TIP: "idea",
  IMPORTANT: "info",
  WARNING: "warn",
  CAUTION: "warn",
};

/**
 * Rewrite `> [!NOTE]` … alert blockquotes into `<Callout type=…>` blocks, and
 * the fenced div pandoc emits for a generic `.. admonition:: Title` (which has
 * no GitHub-alert equivalent) into a titled `<Callout>`.
 * @param {string} md @returns {string}
 */
function calloutTransform(md) {
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const div = lines[i].match(/^:{3,}\s*\{([^}]*)\}\s*$/);
    if (div && parseClasses(div[1]).includes("admonition")) {
      /** @type {string[]} */
      const inner = [];
      let depth = 1;
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (/^:{3,}\s*\{/.test(lines[j])) depth += 1;
        else if (/^:{3,}\s*$/.test(lines[j]) && (depth -= 1) === 0) break;
        inner.push(lines[j]);
      }
      while (inner.length && inner[0].trim() === "") inner.shift();
      // The directive's argument becomes the div's first paragraph.
      /** @type {string[]} */
      const heading = [];
      while (inner.length && inner[0].trim() !== "") {
        heading.push(/** @type {string} */ (inner.shift()));
      }
      while (inner.length && inner[0].trim() === "") inner.shift();
      while (inner.length && inner[inner.length - 1].trim() === "") inner.pop();
      const title = heading.join(" ").trim();
      out.push(
        "",
        `<Callout${title ? ` title=${JSON.stringify(title)}` : ""}>`,
        "",
        ...inner,
        "",
        "</Callout>",
        "",
      );
      i = j;
      continue;
    }
    const m = lines[i].match(
      /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/,
    );
    if (!m) {
      out.push(lines[i]);
      continue;
    }
    const type = ALERT_TO_CALLOUT[m[1]];
    /** @type {string[]} */
    const body = [];
    let j = i + 1;
    for (; j < lines.length && /^>/.test(lines[j]); j++) {
      body.push(lines[j].replace(/^>\s?/, ""));
    }
    while (body.length && body[0].trim() === "") body.shift();
    while (body.length && body[body.length - 1].trim() === "") body.pop();
    // Blank lines around the children so MDX parses block content inside the JSX.
    out.push("", `<Callout type="${type}">`, "", ...body, "", "</Callout>", "");
    i = j - 1;
  }
  return out.join("\n");
}

/** Extract `.class` names from a pandoc fenced-div attribute string.
 * @param {string} attrs
 * @returns {string[]} */
function parseClasses(attrs) {
  return (attrs.match(/\.[\w-]+/g) || []).map((c) => c.slice(1));
}

/** Undo pandoc's backslash escaping of ASCII punctuation (for re-fenced code).
 * @param {string} s
 * @returns {string} */
function unescapePandoc(s) {
  return s.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

const TAB_CLASSES = new Set(["tab", "code-tab", "group-tab"]);

/**
 * A parsed pandoc block. Fields are all present (text nodes carry empty
 * classes/children) so renderers can read `line`/`classes`/`children` without
 * union narrowing.
 * @typedef {{ type: "text" | "div", line: string, classes: string[], children: Block[] }} Block
 */

/**
 * Parse pandoc fenced divs into a tree. Pandoc gives an outer div MORE colons
 * than its children and matches open/close colon counts, so a colon-count stack
 * parses the nesting reliably.
 * @param {string[]} lines
 * @param {number} start
 * @param {number} closeLen
 * @returns {{ nodes: Block[], next: number }}
 */
function parseDivs(lines, start, closeLen) {
  /** @type {Block[]} */
  const nodes = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const open = line.match(/^(:{3,})\s*\{([^}]*)\}\s*$/);
    const close = line.match(/^(:{3,})\s*$/);
    if (close && closeLen && close[1].length === closeLen) {
      return { nodes, next: i + 1 };
    }
    if (open) {
      const sub = parseDivs(lines, i + 1, open[1].length);
      nodes.push({
        type: "div",
        line: "",
        classes: parseClasses(open[2]),
        children: sub.nodes,
      });
      i = sub.next;
      continue;
    }
    nodes.push({ type: "text", line, classes: [], children: [] });
    i += 1;
  }
  return { nodes, next: i };
}

/** Render a `.code-tab` div (header `<lang> <label>` + prose-escaped code body).
 * @param {Block} node
 * @returns {{label:string, body:string}} */
function renderCodeTab(node) {
  const textLines = node.children
    .filter((c) => c.type === "text")
    .map((c) => c.line);
  const idx = textLines.findIndex((l) => l.trim() !== "");
  const header = idx >= 0 ? textLines[idx].trim() : "";
  const sp = header.indexOf(" ");
  const lang = (sp >= 0 ? header.slice(0, sp) : header).toLowerCase();
  const label = (sp >= 0 ? header.slice(sp + 1) : header).trim() || lang;
  const bodyLines = textLines.slice(idx + 1);
  while (bodyLines.length && bodyLines[0].trim() === "") bodyLines.shift();
  while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "")
    bodyLines.pop();
  const code = bodyLines.map(unescapePandoc).join("\n");
  return { label, body: `\`\`\`${lang}\n${code}\n\`\`\`` };
}

/** Render a `.tab`/`.group-tab` div (first non-blank line is the label).
 * @param {Block} node
 * @returns {{label:string, body:string}} */
function renderTab(node) {
  if (node.classes.includes("code-tab")) return renderCodeTab(node);
  const kids = node.children;
  const li = kids.findIndex((c) => c.type === "text" && c.line.trim() !== "");
  const label = li >= 0 ? kids[li].line.trim() : "Tab";
  const bodyNodes = li >= 0 ? kids.slice(li + 1) : kids;
  return { label, body: renderDivNodes(bodyNodes) };
}

/** Render a `.tabs` container as a Fumadocs <Tabs items=…> block.
 * @param {Block} node
 * @returns {string} */
function renderTabs(node) {
  const tabs = node.children.filter(
    (c) => c.type === "div" && c.classes.some((cl) => TAB_CLASSES.has(cl)),
  );
  if (tabs.length === 0) return renderDivNodes(node.children);
  const rendered = tabs.map(renderTab);
  const items = rendered.map((t) => t.label);
  /** @type {string[]} */
  const out = ["", `<Tabs items={${JSON.stringify(items)}}>`];
  for (const t of rendered) {
    out.push(
      "",
      `<Tab value=${JSON.stringify(t.label)}>`,
      "",
      t.body,
      "",
      "</Tab>",
    );
  }
  out.push("", "</Tabs>", "");
  return out.join("\n");
}

/** Render one `.faq` div as an <Accordion> (first non-blank line is the title).
 * @param {Block} node
 * @returns {string} */
function renderFaq(node) {
  const kids = node.children;
  const li = kids.findIndex((c) => c.type === "text" && c.line.trim() !== "");
  const title = li >= 0 ? kids[li].line.trim() : "FAQ";
  const body = renderDivNodes(li >= 0 ? kids.slice(li + 1) : kids);
  return `\n<Accordion title=${JSON.stringify(title)}>\n\n${body}\n\n</Accordion>`;
}

/** Render a parsed div tree back to MDX (tabs -> components, other divs unwrapped).
 * @param {Block[]} nodes
 * @returns {string} */
function renderDivNodes(nodes) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === "text") {
      out.push(n.line);
    } else if (n.classes.includes("tabs")) {
      out.push(renderTabs(n));
    } else if (n.classes.includes("faq")) {
      // Group consecutive `.faq` siblings into one <Accordions>.
      /** @type {string[]} */
      const items = [];
      let j = i;
      for (; j < nodes.length; j++) {
        const m = nodes[j];
        if (m.type === "div" && m.classes.includes("faq"))
          items.push(renderFaq(m));
        else if (m.type === "text" && m.line.trim() === "") continue;
        else break;
      }
      out.push(
        ["", "<Accordions>", ...items, "", "</Accordions>", ""].join("\n"),
      );
      i = j - 1;
    } else {
      out.push(renderDivNodes(n.children)); // anchor/only/etc: keep content
    }
  }
  return out.join("\n");
}

/**
 * Lift sphinx-tabs fenced divs into `<Tabs>`/`<Tab>` components.
 * @param {string} md @returns {string}
 */
function tabsTransform(md) {
  const { nodes } = parseDivs(md.split("\n"), 0, 0);
  return renderDivNodes(nodes);
}

/** @type {Set<string>} URLs already copied into public/origin-assets. */
const stagedImages = new Set();
/** @type {Set<string>} referenced image paths that don't exist on disk. */
const missingImages = new Set();

/** @typedef {{ url: string, anchor: string }} XRef */
/** @typedef {{ id: string, url: string, anchor: string, depth: number }} ApiSymbol */

/** Source-relative page path (no ext) -> output page path (no ext), for
 * MyST-markdown modules whose output layout is restructured to match the Sphinx
 * toctree nesting (e.g. a notebook `trainings/notebooks/basics/x` served under
 * `trainings/getting_started/x`). Empty (identity) for RST modules. Consulted by
 * urlForRel so every cross-ref/label URL points at the restructured location.
 * @type {Map<string, string>} */
let outputMap = new Map();

/** Glossary term (lowercased) -> its page URL + injected anchor slug. Rebuilt per
 * module in convertModule (empty for modules without a `glossary.rst`).
 * @type {Map<string, XRef>} */
let glossaryIndex = new Map();

/** API symbol lookup (Python-domain roles), rebuilt per module: `map` keys the
 * full dotted id (lowercased), `shortMap` keys the last name segment, `entries`
 * keeps every symbol in source order for the generated index page.
 * @type {{ map: Map<string, XRef>, shortMap: Map<string, XRef>, entries: ApiSymbol[] }} */
let apiSymbolIndex = { map: new Map(), shortMap: new Map(), entries: [] };

/** @typedef {{ key: string, type: string, fields: Record<string, string> }} BibEntry */

/** Citation key (lowercased) -> its bibliography anchor + author/year labels.
 * @type {Map<string, { url: string, anchor: string, paren: string, textual: string }>} */
let bibIndex = new Map();

/** Parsed `references.bib` entries in bibliography display order (by first-author
 * surname then year); rendered into the bibliography page. @type {BibEntry[]} */
let bibEntries = [];

/** Numbered figure/table label (lowercased) -> its `:numref:` label, per-page
 * number, page URL and anchor (for `numfig = True` cross-references).
 * @type {Map<string, { kind: "figure" | "table", number: number, url: string, anchor: string }>} */
let numfigIndex = new Map();

/**
 * Copy an image referenced from `srcDir` into public/origin-assets (mirroring its
 * path relative to the sphinx root) and return its root-absolute URL. Returns
 * null for external/data URIs or missing files (caller drops those).
 * @param {string} ref @param {string} srcDir @returns {string | null}
 */
function stageImage(ref, srcDir) {
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith("data:")) return null;
  // Already-staged asset URL (e.g. Quarto notebook outputs pre-copied below).
  if (ref.startsWith(`/${M.assetSubdir}/`)) return ref;
  const clean = ref.split(/[?#]/)[0];
  const absSrc = path.resolve(srcDir, clean);
  if (!fs.existsSync(absSrc)) {
    missingImages.add(path.relative(logRoot, absSrc));
    return null;
  }
  let rel = path.relative(M.sphinxRoot, absSrc).split(path.sep).join("/");
  if (rel.startsWith("..")) rel = `_ext/${path.basename(absSrc)}`; // outside tree
  const url = `/${M.assetSubdir}/${rel}`;
  if (!stagedImages.has(url)) {
    const dest = path.join(M.assetRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(absSrc, dest);
    // The docs kit swaps in a `<name>.dark<ext>` sibling in dark mode.
    const ext = path.extname(absSrc);
    const darkSrc = `${absSrc.slice(0, -ext.length)}.dark${ext}`;
    if (ext && fs.existsSync(darkSrc)) {
      fs.copyFileSync(darkSrc, `${dest.slice(0, -ext.length)}.dark${ext}`);
    }
    stagedImages.add(url);
  }
  return url;
}

/**
 * Convert an inline CSS string (`margin: 2px; color: red`) to a JSX style-object
 * literal (`{{ margin: "2px", color: "red" }}`). React rejects a string `style`
 * prop, so raw-HTML `style="…"` attributes must become JSX objects in MDX.
 * @param {string} css @returns {string}
 */
function cssStringToJsxObject(css) {
  const props = css
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((decl) => {
      const idx = decl.indexOf(":");
      if (idx === -1) return null;
      const key = decl
        .slice(0, idx)
        .trim()
        .replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
      const value = decl.slice(idx + 1).trim();
      return `${JSON.stringify(key)}: ${JSON.stringify(value)}`;
    })
    .filter(Boolean);
  return `{{ ${props.join(", ")} }}`;
}

/**
 * Stage image assets and rewrite their `src` to the served URL. Handles both
 * markdown images (`![alt](src){attrs}`) and pandoc's raw-HTML `<figure>`/`<img>`
 * (from `.. figure::`); `class=` is switched to `className=` for MDX/JSX.
 * @param {string} md @param {string} srcDir @returns {string}
 */
function imageTransform(md, srcDir) {
  return md
    .replace(/!\[([^\]]*)\]\(([^)]+)\)(\{[^}]*\})?/g, (_full, alt, src) => {
      const url = stageImage(src.trim(), srcDir);
      return url ? `![${alt}](${url})` : "";
    })
    .replace(/<img\b[^>]*>/g, (tag) => {
      const srcM = tag.match(/\bsrc=["']?([^"'\s>]+)["']?/);
      if (!srcM) return "";
      const url = stageImage(srcM[1].trim(), srcDir);
      if (!url) return "";
      // Quote bare attribute values (`width=350`), convert `style="…"` to a JSX
      // object, and self-close — all required for MDX/JSX. Style conversion runs
      // after the bare-attr quoting so its `{{…}}` isn't re-quoted.
      return tag
        .replace(/\bsrc=["']?[^"'\s>]+["']?/, `src="${url}"`)
        .replace(/(\s[\w-]+)=([^\s"'>]+)/g, '$1="$2"')
        .replace(
          /\sstyle=(["'])([\s\S]*?)\1/gi,
          (_m, _q, css) => ` style=${cssStringToJsxObject(css)}`,
        )
        .replace(/\s*\/?>$/, " />");
    })
    .replace(/<figure\b[^>]*>/g, (tag) =>
      inlineAlignCenter(tag).replace(/\sclass=/, " className="),
    );
}

/** Scan RST pages for `numfig = True` figures/tables, numbering each kind per page
 * in source order and recording the `.. _label:`'d ones so `:numref:` can link to
 * `Fig. N` / `Table N`. Figures come from `.. figure::`; tables from `.. csv-table::`,
 * `.. list-table::` and `.. table::`.
 * @param {string[]} files */
function buildNumfigIndex(files) {
  numfigIndex = new Map();
  const dir = /^\s*\.\.\s+(figure|csv-table|list-table|table)::/;
  for (const file of files) {
    if (!file.endsWith(".rst")) continue;
    const relNoExt = path
      .relative(M.sphinxRoot, file)
      .replace(/\.rst$/, "")
      .split(path.sep)
      .join("/");
    const url = urlForRel(relNoExt);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    let figN = 0;
    let tblN = 0;
    /** @type {string | null} */
    let pendingLabel = null;
    for (const line of lines) {
      const labelM = line.match(RST_LABEL);
      if (labelM) {
        pendingLabel = labelM[1].trim();
        continue;
      }
      const dirM = line.match(dir);
      if (dirM) {
        const kind = dirM[1] === "figure" ? "figure" : "table";
        const number = kind === "figure" ? (figN += 1) : (tblN += 1);
        if (pendingLabel) {
          numfigIndex.set(pendingLabel.toLowerCase(), {
            kind,
            number,
            url,
            anchor: pendingLabel,
          });
        }
        pendingLabel = null;
        continue;
      }
      if (line.trim() !== "") pendingLabel = null; // only blanks may separate them
    }
  }
}

/** Turn pandoc's labelled fenced-div wrappers (`::: {#id}` … `:::`, emitted for a
 * `.. _label:` before a figure/table) into an `<a id>` scroll anchor so `:numref:`
 * links land on the figure/table. The closing `:::` is left for mdxSafe to strip.
 * @param {string} md @returns {string} */
function figureDivAnchors(md) {
  return md.replace(
    /^::: \{#([\w-]+)\}[ \t]*$/gm,
    (_m, id) => `<a id="${id}" />`,
  );
}

/** Prefix each figure caption with its number (`numfig = True` shows `Fig. N` on
 * every figure). Figures are counted per page in document order, matching
 * buildNumfigIndex, so `:numref:` numbers line up.
 * @param {string} md @returns {string} */
function numberFigures(md) {
  let n = 0;
  return md.replace(/<figure>([\s\S]*?)<\/figure>/g, (_full, inner) => {
    n += 1;
    const numbered = /<figcaption>/.test(inner)
      ? inner.replace(
          /<figcaption>([\s\S]*?)<\/figcaption>/,
          (_m, cap) =>
            `<figcaption><strong>Fig. ${n}</strong> ${cap.trim()}</figcaption>`,
        )
      : `${inner}<figcaption><strong>Fig. ${n}</strong></figcaption>`;
    return `<figure>${numbered}</figure>`;
  });
}

/** JSX components we emit that carry `{…}` expressions (e.g. `<Tabs items={[…]}>`)
 * and must pass through mdxSafe verbatim (never brace-escaped). */
const COMPONENT_TAG =
  /^<\/?(Callout|Tabs|Tab|Accordions|Accordion|Cards|Card)\b/;

/** Raw HTML tags (from MyST `html_image`/`html_admonition`, figures, and authored
 * `<table>`/`<div>` blocks) that mdxSafe sanitises rather than escapes. */
const RAW_HTML_TAG =
  /^<\/?(figure|figcaption|img|a|div|span|table|thead|tbody|tfoot|tr|td|th|caption|colgroup|col|p|br|hr|b|strong|em|i|u|s|sup|sub|ul|ol|li|dl|dt|dd|section|article|aside|header|footer|nav|details|summary|blockquote|pre|style|h[1-6])\b/i;

/** Void HTML elements — must be self-closed to be valid MDX/JSX. */
const VOID_HTML_TAG =
  /<(br|hr|img|col|input|meta|link|area|base|embed|source|track|wbr)\b([^>]*)>/gi;

const VOID_NAMES = new Set([
  "br",
  "hr",
  "img",
  "col",
  "input",
  "meta",
  "link",
  "area",
  "base",
  "embed",
  "source",
  "track",
  "wbr",
]);

/** Block/container tags that, at the start of a line, open a multi-line raw-HTML
 * block collected and normalised as a unit (so HTML auto-closing of `<li>`/`<td>`
 * etc. is resolved into JSX-valid markup). */
const BLOCK_START_TAG =
  /^<(figure|figcaption|table|thead|tbody|tfoot|tr|div|ol|ul|dl|section|article|aside|header|footer|nav|details|blockquote)\b/i;

/** Convert HTML `style="a: b; c: d"` string attributes into a JSX style object
 * (`style={{ a: "b", c: "d" }}`) with camel-cased property names. React rejects a
 * string `style` prop at runtime, so passed-through raw HTML must use the object
 * form. Already-JSX `style={{…}}` attributes are left untouched.
 * @param {string} tag @returns {string} */
function convertStyleAttr(tag) {
  return tag.replace(/\bstyle=(["'])([\s\S]*?)\1/gi, (_m, _q, css) => {
    const props = css
      .split(";")
      .map((/** @type {string} */ d) => d.trim())
      .filter(Boolean)
      .map((/** @type {string} */ decl) => {
        const i = decl.indexOf(":");
        if (i === -1) return null;
        const name = decl
          .slice(0, i)
          .trim()
          .replace(/-([a-z])/g, (_x, /** @type {string} */ c) =>
            c.toUpperCase(),
          );
        return `"${name}": ${JSON.stringify(decl.slice(i + 1).trim())}`;
      })
      .filter(Boolean)
      .join(", ");
    return `style={{ ${props} }}`;
  });
}

/** Pandoc renders RST `:align: center` as `class="align-center"`, but no
 * stylesheet defines that class. Inline the centring instead, so a module's MDX
 * renders the same in any consumer rather than only where this app's CSS is
 * loaded. Flex, not `text-align`, because Tailwind's preflight makes images
 * block elements.
 * @param {string} tag @returns {string} */
function inlineAlignCenter(tag) {
  return tag.replace(
    /\sclass(?:Name)?=(["'])align-center\1/i,
    ` style=${cssStringToJsxObject(
      "display: flex; flex-direction: column; align-items: center; text-align: center",
    )}`,
  );
}

/** Apply JSX attribute fixes to a raw-HTML tag: convert a string `style` attribute
 * to a JSX object and rename `class` to `className` (React rejects the HTML name).
 * @param {string} tag @returns {string} */
function fixJsxTag(tag) {
  return convertStyleAttr(inlineAlignCenter(tag)).replace(
    /\sclass=/gi,
    " className=",
  );
}

/** fumadocs-ui's `Heading` wraps a heading's whole content in its own anchor, so
 * a link inside a heading renders as a nested `<a>` — invalid HTML that fails
 * React hydration. Keep the link text, drop the link.
 * @param {string} md @returns {string} */
function unlinkHeadings(md) {
  let fenced = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced || !/^#{1,6}\s/.test(line)) return line;
      return line
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
    })
    .join("\n");
}

/** Wrap a table's direct `<tr>` rows in a `<tbody>` when the table has no
 * thead/tbody/tfoot. The browser auto-inserts a tbody, which otherwise causes a
 * React hydration mismatch (server `<table><tr>` vs client `<table><tbody><tr>`).
 * @param {string} text @returns {string} */
function wrapTableRows(text) {
  return text.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tbl) => {
    if (/<(?:tbody|thead|tfoot)\b/i.test(tbl)) return tbl;
    return tbl
      .replace(/^(<table\b[^>]*>)/i, "$1<tbody>")
      .replace(/(<\/table>)$/i, "</tbody>$1");
  });
}

/** Make raw HTML valid MDX: self-close void elements and escape braces that occur
 * in text content (outside tags) so MDX doesn't read them as JS expressions.
 * Braces inside tags — JSX expression attributes like `style={{…}}` or quoted
 * values — are left intact so authored JSX keeps working.
 * @param {string} text @returns {string} */
function sanitizeRawHtml(text) {
  return text
    .replace(VOID_HTML_TAG, (_m, tag, attrs) =>
      attrs.trimEnd().endsWith("/") ? `<${tag}${attrs}>` : `<${tag}${attrs} />`,
    )
    .replace(/(<[^>]*>)|([^<]+)/g, (_m, tag, txt) =>
      tag !== undefined
        ? fixJsxTag(tag)
        : txt
            // LaTeX braces inside `$…$` must reach KaTeX intact.
            .split(/(\$\$[^$]*\$\$|\$[^$\n]+\$)/)
            .map((seg, i) =>
              i % 2 === 1
                ? seg
                : seg.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;"),
            )
            .join(""),
    );
}

/** True when every non-void element opened on the line is also closed on it (and
 * no tag is left dangling), i.e. the line is self-contained raw HTML safe to pass
 * through verbatim. Multi-line/inline tags (an open with no close) return false so
 * they are escaped to literal text instead of breaking MDX.
 * @param {string} line @returns {boolean} */
function lineBalanced(line) {
  const s = line.replace(/"[^"]*"|'[^']*'/g, "");
  let depth = 0;
  for (const m of s.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    if (m[2] === "/" || VOID_NAMES.has(m[1].toLowerCase())) continue;
    depth += 1;
  }
  depth -= (s.match(/<\/[a-zA-Z][\w-]*>/g) || []).length;
  return depth === 0 && !/<[a-zA-Z][^>]*$/.test(s);
}

/** Net open-count of the outermost tag `name` across `text` (quoted attribute
 * values stripped so a `</div>` inside an entity-encoded `srcdoc` isn't counted),
 * used to find where a collected raw-HTML block closes.
 * @param {string} text @param {string} name @returns {number} */
function tagDepth(text, name) {
  const s = text.replace(/"[^"]*"|'[^']*'/g, "");
  const opens = (s.match(new RegExp(`<${name}\\b`, "gi")) || []).length;
  const selfClosed = (s.match(new RegExp(`<${name}\\b[^>]*/>`, "gi")) || [])
    .length;
  const closes = (s.match(new RegExp(`</${name}>`, "gi")) || []).length;
  return opens - selfClosed - closes;
}

/** True when every non-void element in `text` is explicitly opened and closed in
 * correct nesting order. Markup that relies on HTML auto-closing (`<li>`/`<td>`
 * without an end tag) or is mis-nested returns false, so it can be rendered as
 * safe literal text instead of breaking the strict MDX/JSX parser.
 * @param {string} text @returns {boolean} */
function htmlBalanced(text) {
  const s = text.replace(/"[^"]*"|'[^']*'/g, "");
  /** @type {string[]} */
  const stack = [];
  for (const m of s.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    const name = m[2].toLowerCase();
    if (VOID_NAMES.has(name) || m[3] === "/") continue;
    if (m[1] === "/") {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0 && !/<[a-zA-Z][^>]*$/.test(s);
}

/** Normalise a collected raw-HTML block into MDX-safe output. Blocks that embed a
 * full document / interactive widget (`<script>`, an inline `srcdoc`, a nested
 * `<html>`/`<body>`) or that rely on HTML auto-closing can't be valid JSX, so
 * they render as escaped literal text; cleanly-nested markup (including an
 * `<iframe src>`) is passed through with braces escaped and void elements
 * self-closed.
 * @param {string} block @returns {string} */
function normalizeHtmlBlock(block) {
  if (
    /<(script|style)\b/i.test(block) ||
    /\ssrcdoc\s*=/i.test(block) ||
    /<!doctype|<html\b|<body\b/i.test(block) ||
    !htmlBalanced(block)
  ) {
    return block.split("\n").map(escapeInline).join("\n");
  }
  // Flatten the block onto a single line. MDX parses `<td>text<div>…</div></td>`
  // fine when it's one line, but treats a block child on a following line as a
  // new paragraph and demands an early closing tag ("Expected a closing tag …
  // before the end of paragraph"). Collapse newlines to spaces, then squeeze
  // inter-tag whitespace.
  return sanitizeRawHtml(
    wrapTableRows(block.replace(/\s*\n\s*/g, " ").replace(/>\s+</g, "><")),
  );
}

/**
 * Normalise every display-math block (`$$…$$`) into micromark's math-FLOW form:
 * delimiters alone on their own lines with the body collapsed onto one line
 * between them. Pandoc glues the content to the delimiters, which micromark
 * mis-splits (it swallows the closing fence and the following content) and whose
 * LaTeX braces can leak to the MDX expression parser; but flattening onto a
 * single line instead makes it math-TEXT, i.e. inline, so KaTeX renders it in
 * text style and cramps fractions. LaTeX treats newlines as whitespace, so
 * collapsing the body is safe. Fence-aware so `$$` inside a code block (e.g. a
 * shell `$$`) is left untouched.
 * @param {string} md @returns {string}
 */
function displayMath(md) {
  const flatten = (/** @type {string} */ block) => {
    const single = block.replace(
      /\$\$([\s\S]*?)\$\$/g,
      (_m, body) =>
        `$$${wrapAlignedMath(body.trim().replace(/\s*\n\s*/g, " "))}$$`,
    );
    // Only math that is the whole block can become flow; `text $$x$$ text` must
    // stay inline or it would split the paragraph.
    const indent = (block.match(/^[ \t]*/) ?? [""])[0];
    const whole = single.trim().match(/^\$\$([\s\S]*)\$\$$/);
    if (whole && !whole[1].includes("$$")) {
      return `${indent}$$\n${indent}${whole[1]}\n${indent}$$`;
    }
    return single;
  };
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  /** @type {string | null} */
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (f && line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      out.push(line);
      continue;
    }
    // An odd count of `$$` on a line opens a display block that closes on a later
    // line; collect through the closing fence before flattening.
    if ((line.match(/\$\$/g) || []).length % 2 === 1) {
      const buf = [line];
      let j = i + 1;
      for (; j < lines.length; j++) {
        buf.push(lines[j]);
        if ((lines[j].match(/\$\$/g) || []).length % 2 === 1) break;
      }
      i = j;
      out.push(flatten(buf.join("\n")));
      continue;
    }
    out.push(flatten(line));
  }
  return out.join("\n");
}

/** Wrap multi-row display math that uses `&` alignment but has no explicit LaTeX
 * environment in `\begin{aligned}…\end{aligned}`. A bare `&` outside an
 * environment is a KaTeX parse error, so such source (e.g. a hand-written
 * piecewise/aligned block) would otherwise fail to render.
 * @param {string} body @returns {string} */
function wrapAlignedMath(body) {
  if (/\\begin\{/.test(body)) return body; // already has an environment
  if (!/(^|[^\\])&/.test(body)) return body; // no alignment column
  return `\\begin{aligned}${body}\\end{aligned}`;
}

/**
 * Escape MDX-significant characters in a prose string, leaving inline-code
 * (`...`), math (`$…$` / `$$…$$`) and BALANCED inline anchors (`<a …>…</a>`, e.g.
 * a `{nb-download}` link inside a sentence) literal. MDX reads `<` as a JSX tag
 * and `{` as a JS expression, so stray occurrences in converted prose must
 * become HTML entities — but LaTeX braces inside math must be preserved for KaTeX.
 * An UNbalanced `<a …>` is left to be escaped (it would break the MDX parse).
 * @param {string} text @returns {string}
 */
function escapeInline(text) {
  return text
    .split(/(`+[^`]*`+|\$\$[^$]*\$\$|\$[^$\n]+\$|<a\s[^<>]*>[^<>]*<\/a>)/)
    .map((seg, i) =>
      i % 2 === 1
        ? seg
        : seg
            .replace(/\{/g, "&#123;")
            .replace(/\}/g, "&#125;")
            .replace(/\\?</g, "&lt;"),
    )
    .join("");
}

/**
 * Safety-net pass to make the transformed output compile as MDX. Components come
 * from the callout/tabs/faq/image transforms and a pandoc Lua filter drops raw
 * `.. raw::` HTML. This walks line by line, treating only column-0 ``` / ~~~
 * fences as (clean) code that is left literal; everywhere else it:
 *   - strips leftover attribute spans (`{.class}`/`{#id}`) and stray `:::`
 *   - unwraps `<email@host>` / `<https://…>` autolinks
 *   - escapes stray `<`, `{`, `}` (passing our own component tag lines through)
 * Malformed pandoc code blocks (definition-list-wrapped `:   ``` `) fall through
 * to escaping, so they render as safe literal text instead of breaking MDX.
 * @param {string} md @returns {string}
 */
function mdxSafe(md) {
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  /** @type {{ char: string, len: number } | null} */
  let fence = null;
  // `inStyle` drops a `<style>…</style>` CSS block (its braces are not
  // MDX-compatible); `inMath` passes `$$…$$` display-math lines through verbatim
  // so LaTeX braces reach KaTeX unescaped.
  let inStyle = false;
  let inMath = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!fence) {
      const mathToggles = (raw.match(/\$\$/g) || []).length;
      if (inMath) {
        out.push(raw);
        if (mathToggles % 2 === 1) inMath = false;
        continue;
      }
      if (mathToggles % 2 === 1) {
        out.push(raw);
        inMath = true;
        continue;
      }
    }
    const fm = raw.match(/^(`{3,}|~{3,})(.*)$/);
    if (fm) {
      const marker = fm[1];
      if (!fence) {
        fence = { char: marker[0], len: marker.length };
        out.push(raw.replace(/\s*\{[^}]*\}\s*$/, "")); // clean fence attributes
      } else if (marker[0] === fence.char && marker.length >= fence.len) {
        fence = null;
        out.push(raw);
      } else {
        out.push(raw);
      }
      continue;
    }
    if (fence) {
      out.push(raw);
      continue;
    }
    const trimmed = raw.trimStart();
    // Drop authored `<style>` CSS blocks (page-specific, invalid as MDX).
    if (inStyle) {
      if (/<\/style>/i.test(raw)) inStyle = false;
      continue;
    }
    if (/^<style\b/i.test(trimmed)) {
      if (!/<\/style>/i.test(raw)) inStyle = true;
      continue;
    }
    // Real JSX components may carry `{…}` expressions — pass through untouched.
    if (COMPONENT_TAG.test(trimmed)) {
      out.push(raw);
      continue;
    }
    // Pandoc turns an RST indented block holding raw HTML into a blockquote
    // (`> <table>…`); the `>` prefix hides the tag from the handling below, so
    // the markup would be escaped and shown literally. Unwrap it.
    const quotedOpen = trimmed.match(/^>\s?(<.*)$/)?.[1];
    const quotedTag = quotedOpen?.match(BLOCK_START_TAG);
    if (quotedTag) {
      const name = quotedTag[1].toLowerCase();
      const unquote = (/** @type {string} */ l) => l.replace(/^\s*>\s?/, "");
      let buf = unquote(raw);
      while (tagDepth(buf, name) > 0 && i + 1 < lines.length) {
        i += 1;
        buf += `\n${unquote(lines[i])}`;
      }
      out.push(normalizeHtmlBlock(buf));
      continue;
    }
    // Multi-line raw-HTML block: collect from this opening block tag to its
    // matching close, then normalise the whole unit (auto-close list/table items,
    // self-close voids, escape braces) so it compiles as MDX.
    const blockOpen = trimmed.match(BLOCK_START_TAG);
    if (blockOpen) {
      const name = blockOpen[1].toLowerCase();
      let buf = raw;
      while (tagDepth(buf, name) > 0 && i + 1 < lines.length) {
        i += 1;
        buf += `\n${lines[i]}`;
      }
      out.push(normalizeHtmlBlock(buf));
      continue;
    }
    // Self-contained raw HTML on one line (standalone `<img>`, `<a>…</a>`): keep
    // it, escaping braces and self-closing voids. Unbalanced/inline HTML falls
    // through to be escaped as safe literal text below.
    if (RAW_HTML_TAG.test(trimmed) && lineBalanced(raw)) {
      out.push(sanitizeRawHtml(raw));
      continue;
    }
    const line = raw
      // RST's default role is title-reference (italic `<cite>`, NOT code —
      // that's double backticks): pandoc writes `` `x` `` as `[x]{.title-ref}`,
      // and the generic attribute-span strip below would leave bare `[x]`.
      .replace(/\[([^\]]+)\]\{\.title-ref\}/g, "*$1*")
      .replace(/\{[.#][^}]*\}/g, "")
      .replace(/^:{3,}.*$/, "")
      .replace(/<([^<>@\s]+@[^<>\s]+)>/g, "$1")
      .replace(/<((?:https?):\/\/[^<>\s]+)>/g, "[$1]($1)");
    out.push(escapeInline(line));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Add YAML frontmatter with a `title` (Fumadocs' default schema requires it).
 * The title is taken from the first H1, which is then removed to avoid a
 * duplicate heading (the layout renders the frontmatter title separately).
 * @param {string} md @param {string} outPath @returns {string}
 */
function withFrontmatter(md, outPath) {
  const lines = md.split("\n");
  const idx = lines.findIndex((l) => /^#\s+/.test(l));
  let title;
  if (idx !== -1) {
    // Strip inline-code backticks (e.g. Sphinx `# ``qnexus```): frontmatter
    // titles render as plain text, so backticks would show literally.
    title = lines[idx].replace(/^#\s+/, "").replace(/`/g, "").trim();
    lines.splice(idx, 1);
  }
  if (!title) {
    title = path
      .basename(outPath)
      .replace(/\.(md|mdx)$/, "")
      .replace(/[-_]/g, " ");
  }
  const body = lines.join("\n").replace(/^\n+/, "");
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body}`;
}

/**
 * Reduce leaked RST inline markup in quartodoc/griffe output to plain MDX. lambeq
 * docstrings are RST-style, but griffe passes their bodies through verbatim, so
 * interpreted roles (`:py:class:`~pkg.Cls``) and external-link syntax
 * (`` `text <url>`_ ``) survive into the API markdown. This renders them as short
 * inline code / real links; full cross-reference resolution is a later step.
 * @param {string} md @returns {string}
 */
function stripRstRoles(md) {
  /** `~pkg.mod.Cls` / `text <target>` -> short symbol or display text. */
  const roleText = (/** @type {string} */ body) => {
    const m = body.match(/^(.*?)\s*<[^<>]+>$/);
    const text = (m ? m[1] : body).trim();
    const short = text.replace(/^~/, "").split(/[.#]/).pop();
    return `\`${short || text}\``;
  };
  return (
    md
      // `text <url>`_ / `__  ->  [text](url)   (RST external hyperlinks)
      .replace(
        /`([^`<]+?)\s*<((?:https?|mailto|ftp):[^`<>]+)>`__?/g,
        (_f, text, url) => `[${text.trim()}](${url})`,
      )
      // :role:`content`  ->  `short`   (drop the role, keep the short symbol or
      // the display text of a "text <target>" reference)
      .replace(/:[\w:+-]+:`([^`]+)`/g, (_f, body) => roleText(body))
      // Same, for roles that lost their leading colon in the source docstring
      // (e.g. lambeq's discopy converters: `class:`pkg.Cls``). `\b` keeps it from
      // matching inside words like "subclass".
      .replace(
        /\b(?:py:)?(?:class|func|meth|mod|attr|obj|data|exc):`([^`]+)`/g,
        (_f, body) => roleText(body),
      )
      // Any remaining `text <target>`_ (internal refs) -> plain text.
      .replace(/`([^`<]+?)\s*<[^`<>]+>`__?/g, (_f, text) => text.trim())
  );
}

/**
 * Rewrite quartodoc heading attributes on `.qmd` heading lines:
 *   `### Name { #pkg.mod.Name }`      -> `### Name [#pkg.mod.Name]` (Fumadocs id)
 *   `#### Parameters {.doc-section …}` -> `#### Parameters` (drop section classes)
 * The Fumadocs `[#id]` form (unlike `{#id}`) survives `mdxSafe`, so the summary
 * tables' in-page anchor links (`[X](#pkg.mod.X)`) keep resolving.
 * @param {string} md @returns {string}
 */
function apiHeadings(md) {
  return md
    .split("\n")
    .map((line) => {
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (!h) return line;
      const idm = h[2].match(/^(.*?)\s*\{\s*#([\w.]+)\s*\}\s*$/);
      if (idm) return `${h[1]} ${idm[1].trim()} [#${idm[2]}]`;
      const cm = h[2].match(/^(.*?)\s*\{[.#][^}]*\}\s*$/);
      if (cm) return `${h[1]} ${cm[1].trim()}`;
      // Index-page module sections (`## lambeq.backend`) carry no attr; give them
      // a stable dotted id so `:ref:` labels can target `…/api#lambeq.backend`.
      const dotted = h[2].trim();
      if (/^[A-Za-z_]\w*(?:\.\w+)+$/.test(dotted)) {
        return `${h[1]} ${dotted} [#${dotted}]`;
      }
      return line;
    })
    .join("\n");
}

/**
 * Convert RST inline-math roles (`:math:`…``) that leak from Sphinx-style
 * docstrings into KaTeX `$…$`. Sphinx packages (inquanto) write math in their
 * docstrings as `:math:` roles which griffe/quartodoc pass through verbatim.
 * The match is line-bounded (`[^`\n]`) so a docstring that forgets the closing
 * backtick (a real InQuanto source bug) can't swallow following lines; any
 * leftover `:math:` marker from such malformed source is then dropped along with
 * its stray backtick so it can't unbalance mdxSafe's inline-code detection (which
 * would otherwise leave following `<…>` / `{…}` exposed as JSX and break MDX).
 * Rendering as real math also beats the inline-code fallback stripRstRoles would
 * otherwise produce.
 * @param {string} md @returns {string}
 */
function rstInlineMath(md) {
  return md
    .replace(/:math:`([^`\n]+)`/g, (_m, tex) => `$${tex}$`)
    .replace(/:math:`?/g, "");
}

/**
 * Convert a single quartodoc `.qmd` API page to committable MDX: reduce RST
 * roles, rewrite heading ids, point cross-file `foo.qmd#id` links at the routed
 * page (via `urlMap`, which knows the flat-vs-foldered layout), drop the module
 * H1 (its title comes from frontmatter), and MDX-sanitise.
 * @param {string} src @param {string} title @param {DocsModule} mod
 * @param {Map<string,string>} [urlMap] base (`.qmd` stem) -> routed page URL
 * @returns {string}
 */
function convertApiQmd(src, title, mod, urlMap) {
  const roled = stripRstRoles(rstInlineMath(fs.readFileSync(src, "utf8")));
  const linked = apiHeadings(roled).replace(
    /\]\(([\w.]+)\.qmd(?:#[\w.-]+)?\)/g,
    (_f, base) =>
      `](${urlMap?.get(base) ?? `/${mod.name}/api/${mod.name}.${base}`})`,
  );
  const lines = linked.split("\n");
  const h1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (h1 !== -1) lines.splice(h1, 1);
  const body = displayMath(
    mdxSafe(convertDoctestExamples(lines.join("\n"))),
  ).replace(/^\n+/, "");
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body}`;
}

/**
 * Parse the quartodoc `index.qmd` (the "Function reference" manifest) into an
 * ordered list of `{ title, bases }` module groups, where each `base` is a
 * submodule `.qmd` stem (e.g. `backend.grammar`). Empty groups (e.g. the skipped
 * `experimental` namespace) are dropped.
 * @param {string} indexPath @returns {{ title: string, bases: string[] }[]}
 */
function parseApiIndex(indexPath) {
  /** @type {{ title: string, bases: string[] }[]} */
  const sections = [];
  /** @type {{ title: string, bases: string[] } | null} */
  let cur = null;
  for (const line of fs.readFileSync(indexPath, "utf8").split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      cur = { title: h[1].trim(), bases: [] };
      sections.push(cur);
      continue;
    }
    const link = line.match(/\]\(([\w.]+)\.qmd(?:#[\w.-]+)?\)/);
    if (link && cur) cur.bases.push(link[1]);
  }
  return sections.filter((s) => s.bases.length > 0);
}

/**
 * Ingest a module's quartodoc-generated API markdown into `generated/<mod>/api/`.
 * Single-submodule modules become a flat page (`api/<mod>.ansatz.mdx`); modules
 * with multiple submodules become a collapsible folder (`api/<mod>.backend/` with
 * `grammar.mdx`, … + a meta.json) so they don't flood the sidebar. Source pages
 * come straight from the `.qmd` (pipe tables + `{#id}` anchors intact); the earlier
 * `quarto render` gfm step is bypassed because it strips those ids.
 * Returns the ordered root-nav refs plus leaf sidebar labels for foldered pages.
 * @param {DocsModule} mod
 * @returns {{ navPages: string[], navTitles: [string, string][] }}
 */
function convertApi(mod) {
  const refDir = mod.apiSource;
  if (!refDir) return { navPages: [], navTitles: [] };
  const indexPath = path.join(refDir, "index.qmd");
  if (!fs.existsSync(indexPath)) {
    console.warn(
      `[generate-docs] ${mod.name}: api source not found: ${refDir}`,
    );
    return { navPages: [], navTitles: [] };
  }
  const apiOut = path.join(outputRoot, mod.name, "api");
  fs.mkdirSync(apiOut, { recursive: true });
  const sections = parseApiIndex(indexPath);

  // Plan the layout first so the index page's cross-file links resolve to the
  // right (flat or foldered) URLs.
  /** @type {Map<string,string>} base -> routed page URL */
  const urlMap = new Map();
  /** @type {{ base: string, outRel: string, title: string }[]} */
  const pageWrites = [];
  /** @type {{ dir: string, title: string, pages: string[] }[]} */
  const folderMetas = [];
  /** @type {string[]} */
  const navPages = ["api/index"];
  /** @type {[string, string][]} */
  const navTitles = [];
  let count = 0;
  for (const sec of sections) {
    const short = sec.title.replace(new RegExp(`^${mod.name}\\.`), "");
    if (sec.bases.length === 1) {
      const base = sec.bases[0];
      const name = `${mod.name}.${base}`;
      pageWrites.push({ base, outRel: `${name}.mdx`, title: name });
      navPages.push(`api/${name}`);
      urlMap.set(base, `/${mod.name}/api/${name}`);
      count += 1;
    } else {
      const folder = `${mod.name}.${short}`; // e.g. lambeq.backend
      /** @type {string[]} */
      const leaves = [];
      for (const base of sec.bases) {
        const leaf = base.slice(short.length + 1); // grammar, converters.discopy
        const title = `${mod.name}.${base}`; // lambeq.backend.grammar
        pageWrites.push({ base, outRel: `${folder}/${leaf}.mdx`, title });
        leaves.push(leaf);
        urlMap.set(base, `/${mod.name}/api/${folder}/${leaf}`);
        navTitles.push([`/${mod.name}/api/${folder}/${leaf}`, leaf]);
        count += 1;
      }
      folderMetas.push({ dir: folder, title: folder, pages: leaves });
      navPages.push(`api/${folder}`);
    }
  }

  fs.writeFileSync(
    path.join(apiOut, "index.mdx"),
    convertApiQmd(indexPath, "Function reference", mod, urlMap),
    "utf8",
  );
  for (const { base, outRel, title } of pageWrites) {
    const src = path.join(refDir, `${base}.qmd`);
    if (!fs.existsSync(src)) {
      console.warn(
        `[generate-docs] ${mod.name}: api page missing: ${base}.qmd`,
      );
      continue;
    }
    const dest = path.join(apiOut, outRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, convertApiQmd(src, title, mod, urlMap), "utf8");
  }
  for (const { dir, title, pages } of folderMetas) {
    fs.writeFileSync(
      path.join(apiOut, dir, "meta.json"),
      `${JSON.stringify({ title, pages }, null, 2)}\n`,
      "utf8",
    );
  }
  console.log(
    `[generate-docs] ${mod.name}: api ${count} page(s) in ${sections.length} module group(s)` +
      `, ${folderMetas.length} collapsible.`,
  );
  return { navPages, navTitles };
}

/**
 * Register the `.. _label:` anchors defined atop the Sphinx `api/lambeq.<mod>.rst`
 * pages (e.g. `backend-api`) into the cross-ref index, pointing at the generated
 * API index page's per-module section (`/<mod>/api#<mod>.<name>`). The `api/` tree
 * itself is skipped by collectRst (it's regenerated from quartodoc), so these
 * labels are otherwise unknown to `resolveRoles`.
 * @param {DocsModule} mod @param {DocIndex} index
 */
function registerApiLabels(mod, index) {
  if (!mod.apiSource) return;
  const apiRstDir = path.join(M.sphinxRoot, "api");
  if (!fs.existsSync(apiRstDir)) return;
  for (const entry of fs.readdirSync(apiRstDir)) {
    const fileMod = entry.match(/^(\w+(?:\.\w+)+)\.rst$/)?.[1];
    if (!fileMod) continue;
    const text = fs.readFileSync(path.join(apiRstDir, entry), "utf8");
    for (const { label } of collectLabels(text.split(/\r?\n/), RST_LABEL)) {
      index.labels.set(label.toLowerCase(), {
        url: `/${mod.name}/api`,
        anchor: fileMod,
        title: fileMod,
      });
    }
  }
}

/** Demote every Markdown heading by `by` levels (fence-aware), capped at H6. Used
 * when concatenating several quartodoc item pages into one file so each item's H1
 * becomes a subsection.
 * @param {string} md @param {number} by @returns {string} */
function demoteHeadings(md, by) {
  /** @type {string | null} */
  let fence = null;
  return md
    .split("\n")
    .map((raw) => {
      const fm = raw.match(/^(`{3,}|~{3,})/);
      if (fm) {
        if (!fence) fence = fm[1][0];
        else if (fm[1][0] === fence) fence = null;
        return raw;
      }
      if (fence) return raw;
      const h = raw.match(/^(#{1,6})(\s+.*)$/);
      if (!h) return raw;
      return "#".repeat(Math.min(6, h[1].length + by)) + h[2];
    })
    .join("\n");
}

/**
 * Convert docstring doctest examples into fenced python code blocks. griffe emits
 * Google-style `Examples:` sections as a label followed by 4-space-indented `>>>`
 * (and `...` continuation) lines; markdown then misreads the leading `>>>` as
 * nested blockquotes and the indent inconsistently. Prompts are kept visible (as
 * Sphinx does). Consecutive REPL paragraphs merge into one block.
 * @param {string} md @returns {string}
 */
function convertDoctestExamples(md) {
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  /** Collect blank + more-indented-than-`minIndent` lines from `start`. */
  const collectIndented = (
    /** @type {number} */ start,
    /** @type {number} */ minIndent,
  ) => {
    /** @type {string[]} */
    const body = [];
    let j = start;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === "") {
        body.push("");
        continue;
      }
      if (l.match(/^(\s*)/)[1].length > minIndent) {
        body.push(l);
        continue;
      }
      break;
    }
    while (body.length && body[body.length - 1] === "") {
      body.pop();
      j -= 1;
    }
    return { body, end: j };
  };
  /** Dedent an example body and emit REPL paragraphs as python fences. */
  const emitDoctest = (/** @type {string[]} */ body) => {
    const indents = body
      .filter((l) => l !== "")
      .map((l) => l.match(/^(\s*)/)[1].length);
    const min = Math.min(...indents);
    const ded = body.map((l) => (l === "" ? "" : l.slice(min)));
    while (ded.length && ded[0] === "") ded.shift();
    while (ded.length && ded[ded.length - 1] === "") ded.pop();
    /** @type {string[][]} */
    const paras = [];
    /** @type {string[]} */
    let cur = [];
    for (const l of ded) {
      if (l === "") {
        if (cur.length) {
          paras.push(cur);
          cur = [];
        }
      } else cur.push(l);
    }
    if (cur.length) paras.push(cur);
    /** @type {string[]} */
    let fence = [];
    const flush = () => {
      if (fence.length) {
        out.push("```python", ...fence, "```", "");
        fence = [];
      }
    };
    for (const p of paras) {
      if (/^>>>/.test(p[0])) {
        if (fence.length) fence.push("");
        fence.push(...p);
      } else {
        flush();
        out.push(...p, "");
      }
    }
    flush();
  };
  for (let i = 0; i < lines.length; i++) {
    const label = lines[i].match(/^(\s*)Examples?\s*:\s*$/);
    if (label) {
      const { body, end } = collectIndented(i + 1, label[1].length);
      if (body.some((l) => /^\s*>>> /.test(l))) {
        out.push("**Examples:**", "");
        emitDoctest(body);
        i = end - 1;
        continue;
      }
    }
    if (/^\s{2,}>>> /.test(lines[i])) {
      const ind = lines[i].match(/^(\s*)/)[1].length;
      const { body, end } = collectIndented(i, ind - 1);
      emitDoctest(body);
      i = end - 1;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}

/**
 * Convert an API-only module (no Sphinx prose): clean the route output, ingest
 * the quartodoc pages via convertNexusApi, then emit a grouped root meta.json.
 * Sections are split into a "pytket" group (titles like `pytket.circuit`) and an
 * "Extensions" group (titles like `pytket-quantinuum`) so the sidebar mirrors the
 * published /tket/api-docs/ layout.
 * @param {DocsModule} mod
 */
function convertApiOnlyModule(mod) {
  const outDir = path.join(outputRoot, M.routeBase);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  if (!mod.apiSource || !fs.existsSync(mod.apiSource)) {
    console.warn(
      `[generate-docs] ${mod.name}: api source missing, skipping: ${mod.apiSource}`,
    );
    return;
  }

  // Supplementary MyST prose pages (getting_started, install, faqs, changelog,
  // extensions) that ship alongside the API reference in the Sphinx docs folder.
  // They keep their bare-name URLs (e.g. /tket/api-docs/install); an index over
  // them plus the landing lets their cross-links resolve to the served URLs.
  outputMap = new Map();
  const proseFiles = (mod.apiProsePages ?? [])
    .map((stem) => path.join(M.sphinxRoot, `${stem}.md`))
    .filter((f) => fs.existsSync(f));
  const indexSrc = mod.apiIndexFile
    ? path.join(M.sphinxRoot, mod.apiIndexFile)
    : "";
  const proseIndex = buildIndex(
    indexSrc && fs.existsSync(indexSrc)
      ? [...proseFiles, indexSrc]
      : proseFiles,
  );
  /** @type {string[]} */
  const prose = [];
  for (const src of proseFiles) {
    const stem = path.basename(src, ".md");
    const out = path.join(M.routeBase, `${stem}.mdx`);
    fs.writeFileSync(
      path.join(outDir, `${stem}.mdx`),
      withFrontmatter(convertMyst(src, proseIndex, stem), out),
      "utf8",
    );
    prose.push(stem);
  }

  const { navPages } = convertNexusApi(mod, proseIndex);
  const titles = navPages.filter((p) => p !== "index");
  const core = titles.filter((t) => t.startsWith("pytket."));
  const exts = titles.filter((t) => t.startsWith("pytket-"));
  // The `extensions` prose page (if present) introduces the extension section.
  const overview = prose.filter((p) => p !== "extensions");
  const extIntro = prose.includes("extensions") ? ["extensions"] : [];
  /** @type {string[]} */
  const pages = [];
  if (overview.length) pages.push("---Overview---", ...overview);
  if (core.length) pages.push("---pytket---", ...core);
  if (exts.length || extIntro.length) {
    pages.push("---Extensions---", ...extIntro, ...exts);
  }
  fs.writeFileSync(
    path.join(outDir, "meta.json"),
    `${JSON.stringify({ title: mod.apiTitle ?? prettify(mod.name), pages }, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `[generate-docs] ${mod.name}: api-only, ${titles.length} api page(s) ` +
      `(${core.length} pytket, ${exts.length} extensions) + ${prose.length} prose page(s).`,
  );
}

/**
 * Ingest the qnexus quartodoc `.qmd` pages into `generated/nexus/api/`, ONE MDX
 * page per nexus_api file (= per index.qmd section), concatenating that file's
 * member `.qmd`s. Single-member pages drop the item H1 (title from frontmatter);
 * multi-member pages demote each item so its symbol becomes a subsection. Heading
 * `{#id}` anchors are preserved and cross-file links point at the routed page.
 * @param {DocsModule} mod @param {DocIndex} index
 * @returns {{ navPages: string[], navTitles: [string, string][] }}
 */
function convertNexusApi(mod, index) {
  const refDir = mod.apiSource;
  if (!refDir) return { navPages: [], navTitles: [] };
  const indexPath = path.join(refDir, "index.qmd");
  if (!fs.existsSync(indexPath)) {
    console.warn(
      `[generate-docs] ${mod.name}: api source not found: ${refDir}`,
    );
    return { navPages: [], navTitles: [] };
  }
  const apiOut = M.apiSubdir
    ? path.join(outputRoot, M.routeBase, M.apiSubdir)
    : path.join(outputRoot, M.routeBase);
  // Path segment prepended to member/link/nav refs ("api/" normally; empty for an
  // API-only module whose pages sit at the route root).
  const apiSeg = M.apiSubdir ? `${M.apiSubdir}/` : "";
  fs.mkdirSync(apiOut, { recursive: true });
  const sections = parseApiIndex(indexPath);
  // `.qmd` stem -> the section file it lands on (for cross-file link rewriting).
  /** @type {Map<string,string>} */
  const baseToFile = new Map();
  for (const sec of sections)
    for (const b of sec.bases) baseToFile.set(b, sec.title);
  /** @param {string} md */
  const rewriteLinks = (md) =>
    md.replace(
      /\]\(([\w.]+)\.qmd(#[\w.:-]+)?\)/g,
      (_f, base, anchor) =>
        `](/${M.routeBase}/${apiSeg}${baseToFile.get(base) ?? base}${anchor ?? ""})`,
    );

  /** @type {string[]} */
  const navPages = [`${apiSeg}index`];
  let count = 0;
  for (const sec of sections) {
    const single = sec.bases.length === 1;
    /** @type {string[]} */
    const parts = [];
    for (const base of sec.bases) {
      const qmdPath = path.join(refDir, `${base}.qmd`);
      if (!fs.existsSync(qmdPath)) {
        console.warn(
          `[generate-docs] ${mod.name}: api page missing: ${base}.qmd`,
        );
        continue;
      }
      let q = stripRstRoles(fs.readFileSync(qmdPath, "utf8"));
      q = single
        ? q.replace(/^#\s+.*$/m, "").replace(/^\n+/, "") // drop the lone module H1
        : demoteHeadings(q, 1); // keep the symbol H1 as a subsection
      parts.push(apiHeadings(q));
      count += 1;
    }
    const body = displayMath(
      mdxSafe(convertDoctestExamples(rewriteLinks(parts.join("\n\n")))),
    ).replace(/^\n+/, "");
    fs.writeFileSync(
      path.join(apiOut, `${sec.title}.mdx`),
      `---\ntitle: ${JSON.stringify(sec.title)}\n---\n\n${body}`,
      "utf8",
    );
    navPages.push(`${apiSeg}${sec.title}`);
  }

  // API landing page from the module's API-index overview prose (toctree +
  // Sphinx genindex/modindex "Indices and tables" eval-rst block dropped).
  const overviewRel = mod.apiIndexFile ?? "";
  const overviewSrc = overviewRel ? path.join(M.sphinxRoot, overviewRel) : "";
  let overview = `# ${mod.apiTitle ?? mod.name}`;
  if (overviewSrc && fs.existsSync(overviewSrc)) {
    const { body } = stripYamlFrontmatter(fs.readFileSync(overviewSrc, "utf8"));
    const cleaned = body.replace(
      /```\{eval-rst\}[\s\S]*?(?:genindex|modindex)[\s\S]*?```/g,
      "",
    );
    let m = convertMystDirectives(cleaned, path.dirname(overviewSrc)).replace(
      /^\([^)\n]+\)=[ \t]*$/gm,
      "",
    );
    m = resolveMystRoles(
      m,
      index,
      overviewRel.replace(/\.md$/, ""),
      overviewSrc,
    );
    // Rewrite plain relative links to sibling prose pages (install.md, ...) to
    // their served URLs; unknown targets (not in `index`) are left untouched.
    m = rewriteDocLinks(m, overviewRel.replace(/\.md$/, ""), index);
    overview = mdxSafe(m);
  }
  // Guarantee body text: an index-only overview (just a toctree) collapses to its
  // lone H1, which Fumadocs won't register as a routable folder-index page.
  if (!overview.replace(/^#.*$/gm, "").trim()) {
    overview = `# ${mod.apiTitle ?? mod.name}\n\nPython API reference for the \`${mod.name}\` package.`;
  }
  fs.writeFileSync(
    path.join(apiOut, "index.mdx"),
    withFrontmatter(overview, "index.mdx"),
    "utf8",
  );

  console.log(
    `[generate-docs] ${mod.name}: api ${count} member page(s) in ${sections.length} file group(s).`,
  );
  return { navPages, navTitles: [] };
}

/** Register the `(qnexus-api)=` MyST label atop the qnexus_api.md overview so
 * `{ref}`…<qnexus-api>`` resolves to the generated API landing (nexus_api/ is
 * skipped by collectRst, so buildIndex never sees it).
 * @param {DocsModule} mod @param {DocIndex} index */
function registerNexusApiLabels(mod, index) {
  const src = path.join(M.sphinxRoot, "nexus_api", "qnexus_api.md");
  if (!fs.existsSync(src)) return;
  for (const { label } of collectLabels(
    fs.readFileSync(src, "utf8").split(/\r?\n/),
    MYST_LABEL,
  )) {
    index.labels.set(label.toLowerCase(), {
      url: `/${mod.name}/api`,
      anchor: "",
      title: "qnexus",
    });
  }
}

/**
 * @typedef {{
 *   srcRel: string|null,
 *   base: string|null,
 *   isFolder: boolean,
 *   external: null,
 *   label: string|null,
 *   children: MystNavNode[],
 * } | {
 *   srcRel: null, base: null, isFolder: false, external: string, label: string|null, children: [],
 * }} MystNavNode
 */

/**
 * Plan sidebar nesting independently of source-based page paths. `base` retains
 * the former relocated path solely for generating compatibility redirects.
 * @param {string[]} files
 * @returns {{ caption: string|null, nodes: MystNavNode[], hasUnresolved: boolean }[]}
 */
function planMystNav(files) {
  outputMap = new Map();
  // Source-rel (no ext) of the module's API index page, if any; its toctree entry
  // is a placeholder for the quartodoc-generated `api` folder.
  const apiIndexRel = M.apiIndexFile
    ? M.apiIndexFile.replace(/\.md$/, "")
    : null;
  /** @type {Map<string,string>} source rel (no ext) -> abs path */
  const byRel = new Map();
  for (const f of files) {
    const rel = path
      .relative(M.sphinxRoot, f)
      .replace(/\.(rst|ipynb|md)$/, "")
      .split(path.sep)
      .join("/");
    if (!byRel.has(rel)) byRel.set(rel, f);
  }
  /** @param {string|undefined} abs */
  const blocksOf = (abs) => {
    if (!abs || !fs.existsSync(abs)) return [];
    const text = abs.endsWith(".ipynb")
      ? notebookMarkdownLines(abs).join("\n")
      : fs.readFileSync(abs, "utf8");
    return parseToctreeBlocks(text);
  };
  /** @param {string} rel — folder name = basename, or its parent when `index` */
  const nodeName = (rel) => {
    const base = path.posix.basename(rel);
    return base === "index"
      ? path.posix.basename(path.posix.dirname(rel))
      : base;
  };
  /** @param {string} rel */
  const isFolderLanding = (rel) =>
    path.posix.basename(rel) === path.posix.basename(path.posix.dirname(rel)) &&
    path.posix.dirname(rel) !== ".";
  /**
   * @param {string} srcRel @param {string} parentBase @param {boolean} topLevel
   * @param {Set<string>} ancestors
   * @returns {MystNavNode}
   */
  const buildNode = (srcRel, parentBase, topLevel, ancestors = new Set()) => {
    if (ancestors.has(srcRel)) {
      throw new Error(`[generate-docs] circular toctree: ${M.name}/${srcRel}`);
    }
    // Top-level nodes keep their source path (stable URLs), except a folder
    // landing (`foo/foo.md`) or an `index`-named landing (`foo/index.md`)
    // collapses to its folder (`foo`); deeper nodes nest by name beneath their
    // parent folder.
    const base = topLevel
      ? isFolderLanding(srcRel) || path.posix.basename(srcRel) === "index"
        ? path.posix.dirname(srcRel)
        : srcRel
      : `${parentBase}/${nodeName(srcRel)}`;
    const entries = blocksOf(byRel.get(srcRel)).flatMap((b) => b.entries);
    const childRels = entries
      .filter((e) => !isExternalRef(e.ref))
      .map((e) => resolveTocTarget(e.ref, path.posix.dirname(srcRel)))
      .filter((r) => byRel.has(r));
    const isFolder = childRels.length > 0 || entries.some((entry) => isExternalRef(entry.ref));
    outputMap.set(srcRel, srcRel);
    /** @type {MystNavNode} */
    const node = {
      srcRel,
      base,
      isFolder,
      external: null,
      label: null,
      children: [],
    };
    const nextAncestors = new Set([...ancestors, srcRel]);
    for (const e of entries) {
      if (isExternalRef(e.ref)) {
        node.children.push({
          srcRel: null,
          base: null,
          isFolder: false,
          external: e.ref,
          label: e.label,
          children: [],
        });
        continue;
      }
      const crel = resolveTocTarget(e.ref, path.posix.dirname(srcRel));
      if (byRel.has(crel)) {
        const child = buildNode(crel, base, false, nextAncestors);
        child.label = e.label;
        node.children.push(child);
      }
    }
    return node;
  };

  const sections = [];
  for (const block of blocksOf(path.join(M.sphinxRoot, M.indexFile))) {
    /** @type {MystNavNode[]} */
    const nodes = [];
    let hasUnresolved = false;
    for (const e of block.entries) {
      if (isExternalRef(e.ref)) {
        nodes.push({
          srcRel: null,
          base: null,
          isFolder: false,
          external: e.ref,
          label: e.label,
          children: [],
        });
        continue;
      }
      // `:glob:` toctree entry (`examples/backends/*`): synthesise a collapsible
      // folder for the glob's directory, with its matching docs (direct children,
      // sorted) as leaves. The folder has no index page, so it renders as a plain
      // expander titled from the directory name.
      if (e.ref.includes("*")) {
        const dir = resolveTocTarget(e.ref.replace(/\/\*+$/, ""), ".");
        const childRels = [...byRel.keys()]
          .filter(
            (k) =>
              k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes("/"),
          )
          .sort();
        if (childRels.length === 0) {
          hasUnresolved = true;
          continue;
        }
        nodes.push({
          srcRel: null,
          base: dir,
          isFolder: true,
          external: null,
          label: e.label,
          children: childRels.map((crel) => buildNode(crel, dir, false)),
        });
        continue;
      }
      const crel = resolveTocTarget(e.ref, ".");
      if (byRel.has(crel)) {
        const node = buildNode(crel, "", true);
        node.label = e.label;
        nodes.push(node);
      }
      else if (apiIndexRel && crel === apiIndexRel) {
        // The API index page is skipped (quartodoc generates the API instead);
        // leave a placeholder so emitMystNavMetas drops the generated `api` folder
        // in at this position.
        nodes.push({
          srcRel: null,
          base: "api",
          isFolder: true,
          external: null,
          label: null,
          children: [],
        });
        hasUnresolved = true;
      } else hasUnresolved = true; // e.g. a skipped page with no generated output
    }
    sections.push({ caption: block.caption, nodes, hasUnresolved });
  }
  return sections;
}

/**
 * Write a MyST sidebar tree and legacy redirects, independently of page files.
 * Keep filesystem metadata only for page discovery and generated API groups.
 * @param {ReturnType<typeof planMystNav>} sections @param {DocIndex} index
 * @param {string[]} apiNavPages @returns {number}
 */
function emitMystNavMetas(sections, index, apiNavPages) {
  let metas = 0;
  /** @param {MystNavNode} node */
  const titleFor = (node) =>
    (node.label ||
    (node.srcRel && index.titles.get(node.srcRel)) ||
    prettify(path.posix.basename(node.base ?? ""))).replace(/`/g, "");

  /** @type {Record<string, string>} */
  const redirects = {};
  const canonicalUrls = new Set([...index.titles.keys()].map(navUrl));
  /** @param {MystNavNode} node @returns {object|null} */
  const navNode = (node) => {
    if (node.external) {
      return { type: "page", name: node.label || node.external, url: node.external, external: true };
    }
    if (node.srcRel === null && node.base === "api") {
      return apiNavPages.length ? { type: "reference", url: `/${M.routeBase}/api` } : null;
    }
    const name = titleFor(node);
    const children = node.children.map(navNode).filter(Boolean);
    if (node.srcRel === null) return { type: "folder", name, children };
    const url = navUrl(node.srcRel);
    const legacyUrl = `/${M.routeBase}/${node.base}`.replace(/\/index$/, "");
    if (legacyUrl !== url && !canonicalUrls.has(legacyUrl)) redirects[legacyUrl] = url;
    const page = { type: "page", name, url };
    return node.isFolder ? { type: "folder", name, index: page, children } : page;
  };

  const sectioned = sections.filter((s) => s.caption).length >= 2;
  // Nest the generated API member pages inside the `api` folder (whose index is
  // the API landing) rather than listing them as siblings of it.
  const writeApiMeta = () => {
    const childPages = apiNavPages
      .filter((p) => p !== "api/index")
      .map((p) => p.slice("api/".length));
    const apiMeta = path.join(outputRoot, M.routeBase, "api", "meta.json");
    fs.mkdirSync(path.dirname(apiMeta), { recursive: true });
    fs.writeFileSync(
      apiMeta,
      `${JSON.stringify({ title: M.apiTitle ?? "API", pages: uniq(childPages) }, null, 2)}\n`,
      "utf8",
    );
    metas += 1;
  };
  const tree = [];
  for (const section of sections) {
    const items = section.nodes.map(navNode).filter(Boolean);
    if (items.length === 0) continue;
    if (sectioned && section.caption)
      tree.push({ type: "separator", name: section.caption });
    tree.push(...items);
  }
  if (apiNavPages.length) writeApiMeta();
  fs.writeFileSync(
    path.join(outputRoot, `${M.name}-nav-tree.json`),
    `${JSON.stringify(tree, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputRoot, `${M.name}-route-redirects.json`),
    `${JSON.stringify(redirects, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(outputRoot, M.routeBase, "meta.json"),
    `${JSON.stringify({ title: prettify(M.name), pages: ["..."] }, null, 2)}\n`,
    "utf8",
  );
  return metas + 1;
}

/** Copy a `merged` backport's committed prose (MDX plus the hand-maintained
 * meta.json and nav titles that travel with it, and its images) into the
 * generated tree the notebook/API passes are about to fill in.
 * `xref-manifest.json` is read separately rather than published as content.
 * @param {string} src repo docs dir @param {string} outDir @param {string} assetRoot
 * @returns {string[]} the directories whose meta.json came from the repo */
function stageFrozenProse(src, outDir, assetRoot) {
  /** @type {string[]} */
  const metaDirs = [];
  if (!fs.existsSync(src)) return metaDirs;
  fs.mkdirSync(outDir, { recursive: true });
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "public") walk(full);
        continue;
      }
      if (!/\.mdx$/.test(entry.name) && entry.name !== "meta.json") continue;
      const rel = path.relative(src, full);
      const dest = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(full, dest);
      if (entry.name === "meta.json") {
        metaDirs.push(path.dirname(rel).split(path.sep).join("/"));
      }
    }
  };
  walk(src);
  const navTitles = path.join(src, "nav-titles.json");
  if (fs.existsSync(navTitles)) {
    fs.copyFileSync(navTitles, `${outDir}-nav-titles.json`);
  }
  // The nesting map is derived from toctrees, so it cannot be rebuilt once the
  // module's RST is gone; a merged backport must carry its own.
  const navNesting = path.join(src, "nav-nesting.json");
  if (fs.existsSync(navNesting)) {
    fs.copyFileSync(navNesting, `${outDir}-nav-nesting.json`);
  }
  const assets = path.join(src, "public", path.basename(assetRoot));
  if (fs.existsSync(assets)) fs.cpSync(assets, assetRoot, { recursive: true });
  return metaDirs;
}

/** @param {DocsModule} mod */
function convertModule(mod) {
  M = {
    ...mod,
    // Output/URL base: an explicit `routeBase` (e.g. the tket API at
    // `tket/api-docs`) wins; otherwise nest under an `outPrefix` subpath when set
    // (e.g. tket's `user-guide`), otherwise just the module name.
    routeBase:
      mod.routeBase ??
      (mod.outPrefix ? `${mod.name}/${mod.outPrefix}` : mod.name),
    // Where API pages land under routeBase ("api" by default; "" places them at
    // the route root for an API-only module).
    apiSubdir: mod.apiSubdir ?? "api",
    assetSubdir: `${mod.name}-assets`,
    assetRoot: path.join(publicRoot, `${mod.name}-assets`),
  };
  stagedImages.clear();
  missingImages.clear();
  unresolvedRefs.clear();

  // API-only module (e.g. the tket API reference): no Sphinx prose to walk — the
  // whole sidebar comes from the quartodoc project. Clean the route output, ingest
  // the API pages, and emit a grouped meta.json (pytket core vs extensions).
  if (mod.apiOnly) {
    convertApiOnlyModule(mod);
    return;
  }

  const contentRoot = mod.contentSubdir
    ? path.join(M.sphinxRoot, mod.contentSubdir)
    : M.sphinxRoot;
  if (!fs.existsSync(contentRoot)) {
    console.warn(
      `[generate-docs] ${mod.name} content not found: ${contentRoot}`,
    );
    return;
  }
  // Start from a clean output + staged-asset tree so removed pages/images don't
  // linger (and stale `.md` don't shadow the `.mdx` we now emit). Scope the clean
  // to routeBase so co-located modules (e.g. tket user-guide vs api-docs, both
  // under generated/tket/) don't wipe each other.
  fs.rmSync(path.join(outputRoot, M.routeBase), {
    recursive: true,
    force: true,
  });
  fs.rmSync(M.assetRoot, { recursive: true, force: true });
  // A `merged` backport authors its prose in the module repo but still builds
  // notebook/API pages from code. Stage the committed prose into the freshly
  // cleaned tree so both halves end up in one collection, and take the frozen
  // cross-reference indexes from the manifest that travelled with it.
  const mergedRepoDir = mod.mergedProse;
  /** @type {{labels?: Record<string, {url:string,anchor:string,title:string}>, terms?: Record<string, {url:string,anchor:string}>, titles?: Record<string,string>}} */
  let frozen = {};
  /** @type {string[]} */
  let stagedMetaDirs = [];
  if (mergedRepoDir) {
    const src = mergedRepoDir;
    stagedMetaDirs = stageFrozenProse(
      src,
      path.join(outputRoot, M.routeBase),
      M.assetRoot,
    );
    try {
      frozen = JSON.parse(
        fs.readFileSync(path.join(src, "xref-manifest.json"), "utf8"),
      );
    } catch {
      console.warn(`[generate-docs] ${mod.name}: no xref-manifest.json found`);
    }
  }
  /** @type {string[]} */
  const files = [];
  collectRst(contentRoot, files);
  // A merged backport's prose is already staged as committed MDX; only its
  // code-tracked pages (notebooks; the API has its own pass) are rebuilt.
  if (mergedRepoDir) {
    const notebooks = files.filter((f) => f.endsWith(".ipynb"));
    files.length = 0;
    files.push(...notebooks);
  }

  // MyST sidebar planning preserves source paths; RST uses runtime re-parenting.
  outputMap = new Map();
  const navSections = mod.markdown ? planMystNav(files) : [];

  // First pass: index labels/titles so `:ref:`/`:doc:` resolve across pages.
  const index = buildIndex(files);
  // The frozen prose is no longer in `files`, so its labels/titles come from the
  // manifest instead. Live entries win: a notebook's own `(label)=` is always
  // fresher than the snapshot.
  for (const [label, entry] of Object.entries(frozen.labels ?? {})) {
    if (!index.labels.has(label)) index.labels.set(label, entry);
  }
  for (const [rel, title] of Object.entries(frozen.titles ?? {})) {
    if (!index.titles.has(rel)) index.titles.set(rel, title);
  }
  // Add the `api/*.rst` cross-ref labels (api/ is skipped by collectRst).
  registerApiLabels(mod, index);
  // MyST modules register their API label(s) from the overview page instead.
  if (mod.markdown) registerNexusApiLabels(mod, index);
  // Cross-ref indexes for notebook MyST roles ({py:*} -> API, {term} -> glossary).
  apiSymbolIndex = buildApiSymbolIndex(mod);
  // C API (Breathe `.. doxygenfile::`) pages are rendered from Doxygen XML.
  doxygenFiles = prepareDoxygen(mod);
  const executedDir = executeNotebooks(mod);
  const glossarySrc = files.find((f) => path.basename(f) === "glossary.rst");
  const glossaryRelNoExt = glossarySrc
    ? path
        .relative(M.sphinxRoot, glossarySrc)
        .replace(/\.rst$/, "")
        .split(path.sep)
        .join("/")
    : null;
  const glossaryTerms = glossarySrc ? parseGlossaryTerms(glossarySrc) : [];
  glossaryIndex = new Map(
    glossaryTerms.map((t) => [
      t.toLowerCase(),
      {
        url: urlForRel(glossaryRelNoExt ?? "glossary"),
        anchor: glossarySlug(t),
      },
    ]),
  );
  // A frozen glossary cannot be rebuilt by rescanning its committed MDX:
  // glossarySlug() is lossy ("ansatz (plural: ansätze)" -> term-ansatz-plural-
  // ans-tze), so the term -> anchor map travels in the manifest.
  for (const [term, entry] of Object.entries(frozen.terms ?? {})) {
    if (!glossaryIndex.has(term)) glossaryIndex.set(term, entry);
  }
  // Bibliography: parse the bibtex file so `:cite:` roles link to author-year
  // entries and the (directive-only) bibliography page can be populated.
  const bibSrc = files.find((f) => path.basename(f) === "bibliography.rst");
  const bibRelNoExt = bibSrc
    ? path
        .relative(M.sphinxRoot, bibSrc)
        .replace(/\.rst$/, "")
        .split(path.sep)
        .join("/")
    : null;
  buildBibIndex(
    path.join(M.sphinxRoot, "references.bib"),
    bibRelNoExt ?? "bibliography",
  );
  // Figure/table numbers for `:numref:` (numfig = True).
  buildNumfigIndex(files);

  let converted = 0;
  /** @type {Set<string>} page paths (module-relative, no ext) actually emitted */
  const convertedPages = new Set();
  for (const source of files) {
    const relNoExt = path
      .relative(M.sphinxRoot, source)
      .replace(/\.(rst|ipynb|md)$/, "")
      .split(path.sep)
      .join("/");
    // The module-root index (its toctrees drive the sidebar) is owned by the
    // bespoke /<module> overview page, so it is never emitted as a doc page —
    // unless `emitIndex` is set (e.g. tket, whose Getting Started index is the
    // /tket/user-guide/ landing).
    if (source === path.join(M.sphinxRoot, M.indexFile) && !mod.emitIndex)
      continue;
    // Skip MyST prose that is `orphan: true` (deliberately outside every toctree,
    // e.g. duplicate landing pages) so it doesn't clutter the auto-nav.
    if (
      M.markdown &&
      source.endsWith(".md") &&
      stripYamlFrontmatter(fs.readFileSync(source, "utf8")).orphan
    ) {
      continue;
    }
    // A page named after a sibling SOURCE directory (e.g. nlp-101.rst + nlp-101/)
    // is a Sphinx "section landing": emit it as that folder's `index.mdx` so the
    // folder is clickable and shows this page's prose (toctree-only landings with
    // no prose are dropped below → the folder stays a plain expander). Requires a
    // real collected CHILD page under the dir — a dir of `.rst.inc` include
    // partials only (e.g. manual/spaces/) is not a section, just a page's asset
    // dir, so that page emits normally.
    const landingDir = path.join(M.sphinxRoot, ...relNoExt.split("/"));
    const isSectionLanding =
      source.endsWith(".rst") &&
      path.basename(source) !== "index.rst" &&
      files.some((f) => f !== source && f.startsWith(landingDir + path.sep));
    // `.mdx` lets Fumadocs parse JSX components. MyST pages keep source paths.
    const out = M.markdown
      ? path.join(M.routeBase, `${outputMap.get(relNoExt) ?? relNoExt}.mdx`)
      : isSectionLanding
        ? path.join(M.routeBase, relNoExt, "index.mdx")
        : path.join(M.routeBase, `${relNoExt}.mdx`);
    // Toctree-only section index.rst files carry no prose, so converting them
    // yields a garbled "folder landing". Skip them: the section surfaces its
    // pages as children (Introduction first) and the folder header just expands.
    if (
      path.basename(source) === "index.rst" &&
      collectHeadings(fs.readFileSync(source, "utf8").split(/\r?\n/)).length ===
        0
    ) {
      continue;
    }
    let markdown;
    try {
      const executed = executedDir && readExecuted(executedDir, source);
      if (source.endsWith(".ipynb") || executed) {
        markdown = withFrontmatter(
          convertNotebookViaQuarto(source, index, relNoExt, executed ?? undefined),
          out,
        );
      } else if (source.endsWith(".md")) {
        markdown = withFrontmatter(convertMyst(source, index, relNoExt), out);
      } else if (relNoExt === bibRelNoExt) {
        // The `.. bibliography::` directive yields no content via pandoc — render
        // the author-year reference list from the parsed bibtex instead.
        markdown = withFrontmatter(mdxSafe(renderBibliography()), out);
      } else {
        const resolved = resolveMathLabels(
          resolveRoles(convertRst(source), index, relNoExt, source),
        );
        const withImages = imageTransform(resolved, path.dirname(source));
        const withAnchors = numberFigures(figureDivAnchors(withImages));
        let withComponents = tabsTransform(calloutTransform(withAnchors));
        if (relNoExt === glossaryRelNoExt)
          withComponents = glossaryAnchors(withComponents, glossaryTerms);
        markdown = withFrontmatter(displayMath(mdxSafe(withComponents)), out);
      }
    } catch (err) {
      throw new Error(
        `[generate-docs] conversion failed: ${path.relative(logRoot, source)}`,
        { cause: err },
      );
    }
    // A section landing with no prose beyond its title is just a toctree holder —
    // don't emit an empty folder index; let the folder render as a plain expander.
    if (isSectionLanding && /^---\n[\s\S]*?\n---\n*$/.test(markdown)) {
      continue;
    }
    const dest = path.join(outputRoot, out);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, unlinkHeadings(markdown), "utf8");
    convertedPages.add(relNoExt);
    converted += 1;
  }

  // Ingest quartodoc-generated API markdown into generated/<mod>/api/ (must run
  // before the meta pass so the API sidebar section resolves to real pages). The
  // returned refs are listed flat under the root nav's own `API` section below.
  const { navPages: apiNavPages, navTitles: apiNavTitles } =
    mod.apiSource && fs.existsSync(mod.apiSource)
      ? mod.markdown
        ? convertNexusApi(mod, index)
        : convertApi(mod)
      : { navPages: [], navTitles: [] };

  // Fill in the `genindex` page, which only exists as a bare title in the source
  // (Sphinx generates its body). Overwrite in place so the page keeps its nav
  // slot and frontmatter title, and only where the module already has one —
  // this must run after the API pass, since it indexes those symbols.
  const genIndexDest = path.join(outputRoot, mod.name, "genindex.mdx");
  if (fs.existsSync(genIndexDest)) {
    const body = renderGenIndex();
    if (body) {
      const existing = fs.readFileSync(genIndexDest, "utf8");
      const fm = existing.match(/^---\n[\s\S]*?\n---\n/)?.[0] ?? "";
      fs.writeFileSync(genIndexDest, `${fm}\n${body}\n`, "utf8");
    }
  }

  // Emit MyST navigation after the generated API pages are available.
  if (M.markdown) {
    const metas = emitMystNavMetas(navSections, index, apiNavPages);
    // Sidebar-label overrides (e.g. API leaf names) consumed by fumadocs-source.ts.
    fs.writeFileSync(
      path.join(outputRoot, `${mod.name}-nav-titles.json`),
      `${JSON.stringify(Object.fromEntries(apiNavTitles), null, 2)}\n`,
      "utf8",
    );
    console.log(
      `[generate-docs] ${mod.name}: converted ${converted} page(s), ${metas} meta.json` +
        `, ${stagedImages.size} image(s)` +
        (unresolvedRefs.size
          ? `, ${unresolvedRefs.size} unresolved refs`
          : "") +
        (missingImages.size ? `, ${missingImages.size} missing image(s)` : "") +
        `.`,
    );
    if (unresolvedRefs.size) {
      const list = [...unresolvedRefs].slice(0, 12).join(", ");
      console.warn(
        `[generate-docs] unresolved: ${list}${unresolvedRefs.size > 12 ? " …" : ""}`,
      );
    }
    if (missingImages.size) {
      const list = [...missingImages].slice(0, 12).join(", ");
      console.warn(
        `[generate-docs] missing images: ${list}${missingImages.size > 12 ? " …" : ""}`,
      );
    }
    return;
  }

  // Recover sidebar titles/order from toctrees (both the top-level MyST index.md
  // and per-folder index.rst): an entry caption (`CLI <.../cli/summary.rst>`)
  // titles that subfolder; a block `:caption:` (`User Guides`) titles + orders the
  // entries' common parent folder — otherwise Fumadocs shows the raw folder name
  // ("User_guides", "Cli", "Sdk", "Hsm Reseed").
  /** @type {Map<string,string>} */
  const folderLabels = new Map();
  /** @type {Map<string,{title: string, pages: string[]}>} */
  const captionMeta = new Map();
  // Sidebar label for a leaf PAGE = the caption its own folder's index.rst gives
  // it (`Introduction <introduction.rst>`), keyed by page URL. Lets the sidebar
  // read "Introduction" while the page keeps its H1 title (e.g. with a version).
  /** @type {Map<string,string>} */
  const pageCaptions = new Map();
  const indexSources = [
    path.join(M.sphinxRoot, M.indexFile),
    ...files.filter((f) => path.basename(f) === "index.rst"),
  ];
  for (const src of indexSources) {
    if (!fs.existsSync(src)) continue;
    const srcDir = path
      .dirname(path.relative(M.sphinxRoot, src))
      .split(path.sep)
      .join("/");
    for (const block of parseToctreeBlocks(fs.readFileSync(src, "utf8"))) {
      const targets = block.entries
        .filter((e) => !/^[a-z][\w+.-]*:\/\//i.test(e.ref)) // drop external URLs
        .map((e) => ({
          label: e.label,
          target: srcDir === "." ? e.ref : path.posix.join(srcDir, e.ref),
        }));
      for (const { label, target } of targets) {
        const folder = path.posix.dirname(target);
        if (label && folder !== "." && !folderLabels.has(folder)) {
          folderLabels.set(folder, label);
        }
        // A caption whose target is a direct child page of this index titles that
        // page in the sidebar (folder-pointer captions are handled above).
        if (label && folder === srcDir) {
          const key = navUrl(target);
          if (!pageCaptions.has(key)) pageCaptions.set(key, label);
        }
      }
      if (!block.caption || targets.length === 0) continue;
      const parent = commonDir(
        targets.map((t) => path.posix.dirname(t.target)),
      );
      if (!parent || captionMeta.has(parent)) continue;
      const pages = uniq(
        targets.map((t) =>
          parent === "."
            ? t.target.split("/")[0]
            : t.target.slice(parent.length + 1).split("/")[0],
        ),
      );
      captionMeta.set(parent, { title: block.caption, pages });
    }
  }

  // Sphinx nests a page's own `.. toctree::` children beneath it in the sidebar.
  // Fumadocs only shows what a meta.json lists, and a folder's meta comes from
  // its index.rst / caption block, which names the parent but not those
  // children — so without this they build as routes but vanish from the nav
  // (28 of lambeq's 77 pages). Splice each parent's children in after it,
  // keeping the toctree's order.
  /** @type {Map<string, string[]>} page rel (no ext) -> child rels (no ext) */
  const toctreeChildren = new Map();
  for (const source of files) {
    if (path.basename(source) === "index.rst") continue;
    const relNoExt = path
      .relative(M.sphinxRoot, source)
      .replace(/\.(rst|ipynb|md)$/, "")
      .split(path.sep)
      .join("/");
    /** @type {string[]} */
    const kids = [];
    for (const ref of parseToctree(fs.readFileSync(source, "utf8"))) {
      if (isExternalRef(ref)) continue;
      const rel = resolveTocTarget(ref, path.posix.dirname(relNoExt));
      if (rel !== relNoExt && convertedPages.has(rel)) kids.push(rel);
    }
    if (kids.length) toctreeChildren.set(relNoExt, kids);
  }
  /** Expand a folder's page list with each entry's own toctree children.
   * @param {string[]} pages @param {string} relDir @returns {string[]} */
  const withToctreeChildren = (pages, relDir) => {
    const prefix = relDir === "." || relDir === "" ? "" : `${relDir}/`;
    const present = new Set(
      pages.filter((p) => !/^(---|\[|\.\.\.)/.test(p)).map((p) => prefix + p),
    );
    /** @type {string[]} */
    const out = [];
    // Recursive: a child can declare its own toctree (lambeq's training ->
    // manual-training -> tutorials/*). `present` also breaks any cycle.
    /** @param {string} rel */
    const pushKids = (rel) => {
      for (const kid of toctreeChildren.get(rel) ?? []) {
        if (present.has(kid)) continue;
        present.add(kid);
        out.push(
          prefix && kid.startsWith(prefix) ? kid.slice(prefix.length) : kid,
        );
        pushKids(kid);
      }
    };
    for (const entry of pages) {
      out.push(entry);
      if (/^(---|\[|\.\.\.|!)/.test(entry)) continue;
      pushKids(prefix + entry);
    }
    return out;
  };

  // Emit meta.json per folder from each index.rst toctree (sidebar order).
  let metas = 0;
  // A merged backport's staged meta.json is the authored nav; never rebuild it.
  /** @type {Set<string>} */
  const emitted = new Set(stagedMetaDirs);
  for (const source of files) {
    if (path.basename(source) !== "index.rst") continue;
    const text = fs.readFileSync(source, "utf8");
    const relDir = path
      .dirname(path.relative(M.sphinxRoot, source))
      .split(path.sep)
      .join("/");
    const blocks = parseToctreeBlocks(text);
    /** @type {string[]} */
    let pages;
    if (blocks.filter((b) => b.caption).length >= 2) {
      // Multiple captioned toctrees (e.g. the lambeq root index): render one
      // sidebar SECTION per caption via Fumadocs separators (`---Caption---`),
      // with each toctree's entries resolved to real generated pages beneath it.
      pages = [];
      const seen = new Set();
      for (const block of blocks) {
        /** @type {string[]} */
        const items = [];
        // The API toctree lists targets that don't exist as generated pages —
        // per-top-level-module names (lambeq's `api/lambeq.backend`) or, for
        // inquanto, the `inquanto_api_intro` / `inquanto-ext_api_intro` toctree
        // hubs. Emit the caption's own section (`---API---` / `---API Reference---`)
        // with the quartodoc-generated pages listed flat, instead of a nested
        // collapsible folder or dead links.
        if (
          mod.apiSource &&
          /^API(\s+Reference)?$/i.test(block.caption ?? "") &&
          apiNavPages.length > 0
        ) {
          pages.push(`---${block.caption}---`, ...apiNavPages);
          continue;
        }
        for (const e of block.entries) {
          if (isExternalRef(e.ref)) {
            items.push(`[${e.label || e.ref}](${e.ref})`);
            continue;
          }
          const rel = resolveTocTarget(e.ref, relDir);
          if (seen.has(rel)) continue;
          // Drop entries with no generated page/folder (e.g. skipped `api/*`).
          if (
            !convertedPages.has(rel) &&
            !fs.existsSync(path.join(outputRoot, mod.name, rel))
          ) {
            continue;
          }
          seen.add(rel);
          items.push(rel);
        }
        if (items.length === 0) continue; // skip empty sections (e.g. API)
        if (block.caption) pages.push(`---${block.caption}---`);
        pages.push(...items);
      }
    } else {
      pages = uniq(parseToctree(text));
    }
    pages = withToctreeChildren(pages, relDir);
    if (pages.length === 0) continue;
    const metaDest = path.join(outputRoot, mod.name, relDir, "meta.json");
    // Prefer the parent toctree caption (correct capitalisation), then the index
    // page's own heading, then a prettified folder name (toctree-only indexes).
    const idxTitle = index.titles.get(`${relDir}/index`);
    const title =
      folderLabels.get(relDir) ??
      (relDir === "."
        ? prettify(mod.name)
        : idxTitle && idxTitle !== "index"
          ? idxTitle
          : prettify(path.basename(relDir)));
    fs.mkdirSync(path.dirname(metaDest), { recursive: true });
    fs.writeFileSync(
      metaDest,
      `${JSON.stringify({ title, pages }, null, 2)}\n`,
      "utf8",
    );
    emitted.add(relDir);
    metas += 1;
  }

  // Emit meta.json for group folders that have no index.rst of their own (e.g.
  // `user_guides`), taking their title + order from a parent toctree `:caption:`.
  for (const [relDir, { title, pages }] of captionMeta) {
    if (emitted.has(relDir)) continue;
    // The generated api/ folder owns its own grouped meta.json (written by
    // convertApi); don't clobber it with the toctree's per-module target names.
    if (mod.apiSource && relDir === "api") continue;
    const metaDest = path.join(outputRoot, mod.name, relDir, "meta.json");
    if (!fs.existsSync(path.dirname(metaDest))) continue;
    fs.writeFileSync(
      metaDest,
      `${JSON.stringify({ title, pages: withToctreeChildren(pages, relDir) }, null, 2)}\n`,
      "utf8",
    );
    metas += 1;
  }

  // Sphinx "section landing" pages: a page `X.rst` next to a sibling folder `X/`
  // whose toctree lists the folder's children (e.g. nlp-101.rst → nlp-101/).
  // Fumadocs renders `X/` as a collapsible folder, so title it from the page's
  // H1 and order its children by the toctree (else it shows a prettified folder
  // name + default order).
  for (const source of files) {
    if (!source.endsWith(".rst") || path.basename(source) === "index.rst") {
      continue;
    }
    const relNoExt = path
      .relative(M.sphinxRoot, source)
      .replace(/\.rst$/, "")
      .split(path.sep)
      .join("/");
    if (emitted.has(relNoExt)) continue;
    const folderDir = path.join(outputRoot, mod.name, relNoExt);
    if (!fs.existsSync(folderDir) || !fs.statSync(folderDir).isDirectory()) {
      continue;
    }
    const indexRelDir = path.posix.dirname(relNoExt);
    /** @type {string[]} */
    const childPages = [];
    for (const block of parseToctreeBlocks(fs.readFileSync(source, "utf8"))) {
      for (const entry of block.entries) {
        const rel = resolveTocTarget(entry.ref, indexRelDir);
        if (!rel.startsWith(`${relNoExt}/`) || !convertedPages.has(rel)) {
          continue;
        }
        childPages.push(rel.slice(relNoExt.length + 1));
        if (entry.label) pageCaptions.set(navUrl(rel), entry.label);
      }
    }
    if (childPages.length === 0) continue;
    // The parent toctree's caption ("Installation") over the page's own H1
    // ("Installation v2.6.2"), matching how leaf pages are labelled.
    const title =
      pageCaptions.get(navUrl(relNoExt)) ??
      index.titles.get(relNoExt) ??
      prettify(path.basename(relNoExt));
    fs.writeFileSync(
      path.join(folderDir, "meta.json"),
      // `...` appends any child not named in the toctree (none hidden).
      `${JSON.stringify({ title, pages: [...childPages, "..."] }, null, 2)}\n`,
      "utf8",
    );
    emitted.add(relNoExt);
    metas += 1;
  }

  // A root-index toctree of purely external links (Origin's "Support" group:
  // Book a demo, Whitepaper, …) generates no pages, so it never reaches the
  // per-folder meta emission above. Carry it into the sidebar root as a Fumadocs
  // separator plus link items.
  const rootIndex = path.join(M.sphinxRoot, M.indexFile);
  if (fs.existsSync(rootIndex)) {
    const rootMeta = path.join(outputRoot, M.routeBase, "meta.json");
    const existing = fs.existsSync(rootMeta)
      ? JSON.parse(fs.readFileSync(rootMeta, "utf8"))
      : {};
    // `...` keeps the generated folders ahead of the links, in their own order.
    const pages = existing.pages ?? ["..."];
    /** @type {string[]} */
    const linkPages = [];
    for (const block of parseToctreeBlocks(fs.readFileSync(rootIndex, "utf8"))) {
      const separator = block.caption ? `---${block.caption}---` : null;
      if (
        block.entries.length === 0 ||
        !block.entries.every((e) => isExternalRef(e.ref)) ||
        // A root index inside the converted tree already emitted these above.
        (separator && pages.includes(separator))
      ) {
        continue;
      }
      if (separator) linkPages.push(separator);
      for (const e of block.entries) {
        linkPages.push(`[${e.label || e.ref}](${e.ref})`);
      }
    }
    if (linkPages.length > 0) {
      fs.writeFileSync(
        rootMeta,
        `${JSON.stringify({ ...existing, pages: [...pages, ...linkPages] }, null, 2)}\n`,
        "utf8",
      );
      metas += 1;
    }
  }

  // Sidebar overrides consumed by lib/fumadocs-source.ts (page-tree transformer).
  // Kept outside generated/<module>/ so fumadocs doesn't treat it as content.
  // Seeded from a merged backport's staged copy (live entries win) so the map
  // survives once the module's RST, which is what derives it, is deleted.
  /** @param {string} file @returns {Record<string, any>} */
  const stagedJson = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return {};
    }
  };
  const navTitlesFile = path.join(outputRoot, `${mod.name}-nav-titles.json`);
  const navTitles = stagedJson(navTitlesFile);
  for (const [url, label] of pageCaptions) navTitles[url] = label;
  for (const [url, label] of apiNavTitles) navTitles[url] = label;
  fs.writeFileSync(
    navTitlesFile,
    `${JSON.stringify(navTitles, null, 2)}\n`,
    "utf8",
  );

  // Sphinx nests a page's toctree children beneath it in the sidebar while
  // keeping their URLs flat. Fumadocs can only nest via real folders, so record
  // parent -> children as URLs and let the page-tree transformer re-parent them
  // at runtime; that avoids restructuring the source tree (lambeq's tutorials/
  // is shared by four different parents) and changes no URLs.
  const navNestingFile = path.join(outputRoot, `${mod.name}-nav-nesting.json`);
  const navNesting = stagedJson(navNestingFile);
  for (const [parent, kids] of toctreeChildren) {
    navNesting[navUrl(parent)] = kids.map(navUrl);
  }
  fs.writeFileSync(
    navNestingFile,
    `${JSON.stringify(navNesting, null, 2)}\n`,
    "utf8",
  );

  // Cross-reference bridge for backporting a module to committed MDX. Once the
  // prose is frozen and its RST deleted, the ONGOING notebook/API build steps
  // lose the in-memory indexes they resolve against, so persist them here.
  // Heading slugs stay re-derivable (github-slugger over the committed MDX) and
  // API symbols are rebuilt from the regenerated quartodoc output, but an
  // arbitrary `.. _label:` target is not, and a glossary term cannot be
  // recovered from its slug ("ansatz (plural: ansätze)" -> term-ansatz-plural-
  // ans-tze is lossy). See docs/plans/origin-mdx-backport.md.
  /** @param {Map<string, unknown>} m */
  const sortedEntries = (m) =>
    Object.fromEntries([...m].sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(
    path.join(outputRoot, `${mod.name}-xref-manifest.json`),
    `${JSON.stringify(
      {
        labels: sortedEntries(index.labels),
        terms: sortedEntries(glossaryIndex),
        titles: sortedEntries(index.titles),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `[generate-docs] ${mod.name}: converted ${converted} page(s), ${metas} meta.json` +
      `, ${stagedImages.size} image(s)` +
      (unresolvedRefs.size ? `, ${unresolvedRefs.size} unresolved refs` : "") +
      (missingImages.size ? `, ${missingImages.size} missing image(s)` : "") +
      `.`,
  );
  if (unresolvedRefs.size) {
    const list = [...unresolvedRefs].slice(0, 12).join(", ");
    console.warn(
      `[generate-docs] unresolved: ${list}${unresolvedRefs.size > 12 ? " …" : ""}`,
    );
  }
  if (missingImages.size) {
    const list = [...missingImages].slice(0, 12).join(", ");
    console.warn(
      `[generate-docs] missing images: ${list}${missingImages.size > 12 ? " …" : ""}`,
    );
  }
}

/**
 * Convert documentation modules into Fumadocs MDX.
 *
 * Output per module: `<outputRoot>/<routeBase>/**` (MDX + meta.json) plus the
 * sidecar `<outputRoot>/<name>-{nav-titles,nav-nesting,xref-manifest}.json`, and
 * staged assets under `<publicRoot>/<name>-assets/` (referenced from the MDX by
 * the root-absolute URL `/<name>-assets/...`).
 *
 * @param {DocsModule[]} modules
 * @param {object} options
 * @param {string} options.outputRoot Generated content tree.
 * @param {string} options.publicRoot Static directory the site serves from `/`.
 * @param {string} [options.cacheRoot] Scratch space (Doxygen XML); defaults to outputRoot's parent.
 * @param {string} [options.logRoot] Paths in log messages are shown relative to this.
 */
export function convertModules(modules, options) {
  outputRoot = path.resolve(options.outputRoot);
  publicRoot = path.resolve(options.publicRoot);
  cacheRoot = path.resolve(options.cacheRoot ?? path.dirname(outputRoot));
  logRoot = path.resolve(options.logRoot ?? process.cwd());
  for (const mod of modules) convertModule(mod);
}
