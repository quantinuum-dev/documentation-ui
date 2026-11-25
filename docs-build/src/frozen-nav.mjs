// @ts-check
// Sidebar structure declared by committed (frozen) MDX, shared by the converter
// and the standalone preview so both derive the same nav from the same files:
//
// - a page's `navTitle` frontmatter is its sidebar label;
// - its `navChildren` frontmatter lists the pages nested beneath it, as Sphinx
//   toctree entries relative to the page's directory: `path`, `Label <path>`,
//   or `Label <https://…>` for an external link;
// - a root meta.json with `"navTree": true` (a MyST module) lays out the whole
//   sidebar from its `pages`, each page expanding into its `navChildren`.
import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {object} NavPage
 * @property {string} rel path within the content root, without extension (`guide/a`, `x/index`)
 * @property {string} title
 * @property {string} [navTitle]
 * @property {string[]} [navChildren]
 */

/**
 * @typedef {object} NavMeta
 * @property {string} [title]
 * @property {string[]} [pages]
 * @property {boolean} [navTree]
 */

/**
 * @typedef {object} NavTreeNode
 * @property {"page" | "folder" | "separator" | "reference"} type
 * @property {string} [name]
 * @property {string} [url]
 * @property {boolean} [external]
 * @property {NavTreeNode} [index]
 * @property {NavTreeNode[]} [children]
 */

/** The scalar and list fields of an MDX page's YAML frontmatter (the simple
 * subset pages use: `key: value`, `key: [a, b]` and `key:` + `- item` lines).
 * @param {string} text @returns {Record<string, string | string[]>} */
export function frontmatterFields(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  /** @param {string} v @returns {string} */
  const scalar = (v) => {
    const s = v.trim();
    if (s.startsWith('"')) {
      try {
        return JSON.parse(s);
      } catch {
        return s.slice(1, -1);
      }
    }
    return s.startsWith("'") ? s.slice(1, -1).replace(/''/g, "'") : s;
  };
  /** @type {Record<string, string | string[]>} */
  const out = {};
  const lines = fm.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([\w-]+):(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();
    if (value.startsWith("[")) {
      out[key] = value.slice(1, -1).split(",").map(scalar).filter(Boolean);
    } else if (value) {
      out[key] = scalar(value);
    } else {
      /** @type {string[]} */
      const items = [];
      while (/^\s*-\s/.test(lines[i + 1] ?? "")) {
        items.push(scalar(lines[++i].replace(/^\s*-\s+/, "")));
      }
      out[key] = items;
    }
  }
  return out;
}

/** Split a toctree-style entry into its label and target.
 * @param {string} entry @returns {{ label: string, target: string }} */
export function parseNavEntry(entry) {
  const m = entry.match(/<([^<>]+)>$/);
  return m
    ? { label: entry.slice(0, m.index).trim(), target: m[1].trim() }
    : { label: "", target: entry.trim() };
}

/** @param {string} target */
const isExternal = (target) => /^[a-z][\w+.-]*:/i.test(target);

/** `guide/a.mdx` / `x/index` -> the key a page is addressed by (`guide/a`, `x`).
 * @param {string} rel */
const keyOf = (rel) =>
  path.posix.normalize(rel).replace(/\.(mdx?|ipynb|rst)$/, "").replace(/(^|\/)index$/, "");

/** @param {string} name */
const prettify = (name) => name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Read the nav-relevant frontmatter of every page under a content root, and its
 * meta.json files. `_`-prefixed partials, dot-dirs and `public/` are skipped.
 * @param {string} root
 * @returns {{ pages: NavPage[], metas: Record<string, NavMeta> }} metas keyed by directory (`.` for the root)
 */
export function readNavContent(root) {
  /** @type {NavPage[]} */
  const pages = [];
  /** @type {Record<string, NavMeta>} */
  const metas = {};
  if (!fs.existsSync(root)) return { pages, metas };
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        if (rel !== "public") walk(full);
      } else if (entry.name === "meta.json") {
        try {
          metas[path.posix.dirname(rel)] = JSON.parse(fs.readFileSync(full, "utf8"));
        } catch {
          // An unreadable meta.json is Fumadocs' problem to report, not the nav's.
        }
      } else if (/\.mdx?$/.test(entry.name)) {
        const fields = frontmatterFields(fs.readFileSync(full, "utf8"));
        const relNoExt = rel.replace(/\.mdx?$/, "");
        pages.push({
          rel: relNoExt,
          title: typeof fields.title === "string" ? fields.title : path.posix.basename(relNoExt),
          ...(typeof fields.navTitle === "string" && fields.navTitle ? { navTitle: fields.navTitle } : {}),
          ...(Array.isArray(fields.navChildren) ? { navChildren: fields.navChildren } : {}),
        });
      }
    }
  };
  walk(root);
  return { pages, metas };
}

/**
 * Sidebar overrides declared by page frontmatter, in the shapes the docs kit's
 * `docsNavTransformer` takes: `titles` and `nesting` keyed by page URL, plus the
 * full `tree` when the root meta.json sets `navTree`.
 * @param {object} options
 * @param {NavPage[]} options.pages
 * @param {Record<string, NavMeta>} [options.metas] meta.json files by directory
 * @param {string} options.baseUrl URL the content root is served at (`/inquanto`)
 * @param {Record<string, string>} [options.references] root entries standing for
 *   generated folders (`{ api: "/inquanto/api" }`)
 * @param {boolean} [options.prune] leave out pages that aren't in `pages` (e.g.
 *   notebooks a preview of the committed MDX alone doesn't have)
 * @returns {{ titles: Record<string, string>, nesting: Record<string, string[]>, tree?: NavTreeNode[] }}
 */
export function frozenNav({ pages, metas = {}, baseUrl, references = {}, prune = false }) {
  let base = baseUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  /** @param {string} key */
  const urlOf = (key) => (key ? `${base}/${key}` : base || "/");
  /** @type {Map<string, NavPage>} */
  const byKey = new Map(pages.map((p) => [keyOf(p.rel), p]));
  /** @param {NavPage} page */
  const dirOf = (page) => path.posix.dirname(page.rel);

  /** @type {Record<string, string>} */
  const titles = {};
  /** @type {Record<string, string[]>} */
  const nesting = {};
  for (const page of pages) {
    const url = urlOf(keyOf(page.rel));
    if (page.navTitle) titles[url] = page.navTitle;
    /** @type {string[]} */
    const kids = [];
    for (const entry of page.navChildren ?? []) {
      const { label, target } = parseNavEntry(entry);
      if (isExternal(target)) continue;
      const kidUrl = urlOf(keyOf(path.posix.join(dirOf(page), target)));
      kids.push(kidUrl);
      if (label) titles[kidUrl] = label;
    }
    if (kids.length) nesting[url] = kids;
  }

  const root = metas["."];
  if (!root?.navTree) return { titles, nesting };

  /** @type {Set<string>} */
  const expanded = new Set();
  /** @param {string} key @param {string} [label] @returns {NavTreeNode | null} */
  const pageNode = (key, label) => {
    const page = byKey.get(key);
    if (!page && prune) return null;
    const url = urlOf(key);
    const name = label || page?.navTitle;
    if (!page?.navChildren?.length || expanded.has(key)) {
      return { type: "page", url, ...(name ? { name } : {}) };
    }
    expanded.add(key);
    return {
      type: "folder",
      name: name || page.title,
      index: { type: "page", url },
      children: page.navChildren
        .map((entry) => entryNode(entry, dirOf(page)))
        .filter((node) => node !== null),
    };
  };
  /** @param {string} entry @param {string} dir @returns {NavTreeNode | null} */
  const entryNode = (entry, dir) => {
    const { label, target } = parseNavEntry(entry);
    if (isExternal(target)) return { type: "page", name: label || target, url: target, external: true };
    return pageNode(keyOf(path.posix.join(dir, target)), label);
  };

  /** @type {NavTreeNode[]} */
  const tree = [];
  for (const item of root.pages ?? []) {
    if (item.startsWith("...")) continue;
    const separator = item.match(/^---(.*)---$/);
    if (separator) {
      tree.push({ type: "separator", name: separator[1] });
      continue;
    }
    const link = item.match(/^\[([^\]]+)\]\((.+)\)$/);
    if (link) {
      tree.push({ type: "page", name: link[1], url: link[2], external: true });
      continue;
    }
    const { label, target } = parseNavEntry(item);
    const key = keyOf(target);
    if (references[key]) {
      tree.push({ type: "reference", url: references[key] });
      continue;
    }
    // A folder without a landing page (a MyST `:glob:` entry): its direct pages, sorted.
    const kids = byKey.has(key)
      ? []
      : pages
          .map((p) => keyOf(p.rel))
          .filter((k) => k && path.posix.dirname(k) === key)
          .sort();
    if (kids.length) {
      tree.push({
        type: "folder",
        name: label || metas[key]?.title || prettify(path.posix.basename(key)),
        children: kids.map((k) => pageNode(k)).filter((node) => node !== null),
      });
    } else {
      const node = pageNode(key, label);
      if (node) tree.push(node);
    }
  }
  return { titles, nesting, tree };
}
