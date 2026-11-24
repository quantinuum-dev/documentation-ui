import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { convertModules } from "./generate.mjs";

test("MyST navigation nests pages without changing their source-based URLs", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-nav-test-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "examples"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\n:caption: Guides\n\nstart\n```\n\n```{toctree}\n:caption: Resources\n\nWebsite <https://example.com/>\n```\n");
  fs.writeFileSync(path.join(source, "start.md"), "# Start\n\nIntro.\n\n```{toctree}\nFirst steps <examples/first>\nWebsite <https://example.com/>\n```\n");
  fs.writeFileSync(path.join(source, "examples/first.md"), "# First\n\nIntro.\n\n```{toctree}\nsecond\n```\n");
  fs.writeFileSync(path.join(source, "examples/second.md"), "# Second\n\n[First](first.md)\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });

  assert.ok(fs.existsSync(path.join(output, "fixture/examples/first.mdx")));
  assert.ok(fs.existsSync(path.join(output, "fixture/start.mdx")));
  const tree = JSON.parse(fs.readFileSync(path.join(output, "fixture-nav-tree.json"), "utf8"));
  assert.equal(tree[0].type, "separator");
  assert.equal(tree[1].index.url, "/fixture/start");
  assert.equal(tree[1].children[0].index.url, "/fixture/examples/first");
  assert.equal(tree[1].children[0].name, "First steps");
  assert.equal(tree[1].children[0].children[0].url, "/fixture/examples/second");
  assert.equal(tree[1].children[1].url, "https://example.com/");
  assert.equal(tree[1].children[1].external, true);
  const redirects = JSON.parse(fs.readFileSync(path.join(output, "fixture-route-redirects.json"), "utf8"));
  assert.equal(redirects["/fixture/start/first"], "/fixture/examples/first");
  assert.equal(redirects["/fixture/start/first/second"], "/fixture/examples/second");
  assert.equal(redirects["/fixture/start"], undefined);
});

test("a frozen MyST module's sidebar comes from its committed pages", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-myst-freeze-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const committed = path.join(root, "docs");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "examples"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\n:caption: Guides\n\nstart\n```\n\n```{toctree}\n:caption: Resources\n\nWebsite <https://example.com/>\n```\n");
  fs.writeFileSync(path.join(source, "start.md"), "# Start\n\nIntro.\n\n```{toctree}\nFirst steps <examples/first>\nWebsite <https://example.com/>\n```\n");
  fs.writeFileSync(path.join(source, "examples/first.md"), "# First\n\nIntro.\n\n```{toctree}\nsecond\n```\n");
  fs.writeFileSync(path.join(source, "examples/second.md"), "# Second\n\nText.\n");
  const mod = { name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true };
  const roots = { outputRoot: output, publicRoot: path.join(root, "public") };
  convertModules([{ ...mod, freeze: { pages: ["**"], outDir: committed, nav: true } }], roots);
  const before = JSON.parse(fs.readFileSync(path.join(output, "fixture-nav-tree.json"), "utf8"));

  const meta = JSON.parse(fs.readFileSync(path.join(committed, "meta.json"), "utf8"));
  assert.equal(meta.navTree, true);
  assert.deepEqual(meta.pages,
    ["---Guides---", "start", "---Resources---", "[Website](https://example.com/)", "..."]);
  assert.match(fs.readFileSync(path.join(committed, "start.mdx"), "utf8"),
    /^navChildren:\n {2}- "First steps <examples\/first>"\n {2}- "Website <https:\/\/example\.com\/>"$/m);
  assert.match(fs.readFileSync(path.join(committed, "examples/first.mdx"), "utf8"),
    /^navChildren:\n {2}- "second"$/m);
  assert.equal(fs.existsSync(path.join(committed, "nav-tree.json")), false);

  // With every source deleted, the committed pages rebuild the same sidebar.
  fs.rmSync(source, { recursive: true });
  fs.mkdirSync(source);
  convertModules([{ ...mod, mergedProse: committed }], roots);
  const after = JSON.parse(fs.readFileSync(path.join(output, "fixture-nav-tree.json"), "utf8"));
  /** @param {any[]} nodes @returns {any[]} */
  const shape = (nodes) => nodes.map((n) => ({
    type: n.type,
    url: n.url ?? n.index?.url,
    ...(n.type === "folder" || n.type === "separator" || n.external ? { name: n.name } : {}),
    ...(n.children ? { children: shape(n.children) } : {}),
  }));
  assert.deepEqual(shape(after), shape(before));
  assert.equal(after[1].children[0].name, "First steps");
});

test("visible toctrees render as link lists and hidden ones are dropped", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-toctree-list-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nguide\n```\n");
  fs.writeFileSync(path.join(source, "guide.md"), [
    "# Guide", "", "Intro.", "", "## Examples", "",
    "```{toctree}", ":maxdepth: 1", "", "first", "Second one <second>", "missing", "Site <https://example.com/>", "```", "",
    "```{toctree}", ":hidden:", "", "third", "```", "",
  ].join("\n"));
  for (const name of ["first", "second", "third"]) {
    fs.writeFileSync(path.join(source, `${name}.md`), `# Page ${name}\n\nText.\n`);
  }
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/guide.mdx"), "utf8");
  assert.match(generated, /## Examples\n\n- \[\]\(\.\/first\.mdx\)\n- \[Second one\]\(\.\/second\.mdx\)\n- \[Site\]\(https:\/\/example\.com\/\)\n/);
  assert.doesNotMatch(generated, /missing|third|toctree/);
});

test("a page that is only a title and toctree just feeds the sidebar", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-toctree-only-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "examples"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nexamples_index\nlinks\n```\n");
  fs.writeFileSync(path.join(source, "examples_index.md"), "(examples)=\n# Examples Gallery\n\n```{toctree}\nexamples/a\nexamples/b\n```\n");
  fs.writeFileSync(path.join(source, "examples/a.md"), "# A\n\nText.\n");
  fs.writeFileSync(path.join(source, "examples/b.md"), "# B\n\nText.\n");
  fs.writeFileSync(path.join(source, "links.md"), "# Links\n\nSee {doc}`examples_index`.\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  assert.ok(!fs.existsSync(path.join(output, "fixture/examples_index.mdx")));
  const tree = JSON.parse(fs.readFileSync(path.join(output, "fixture-nav-tree.json"), "utf8"));
  assert.equal(tree[0].type, "folder");
  assert.equal(tree[0].name, "Examples Gallery");
  assert.equal(tree[0].index, undefined);
  assert.deepEqual(tree[0].children.map((/** @type {any} */ c) => c.url), ["/fixture/examples/a", "/fixture/examples/b"]);
  const links = fs.readFileSync(path.join(output, "fixture/links.mdx"), "utf8");
  assert.match(links, /\[Examples Gallery\]\(\.\/examples\/a\.mdx\)/);
});

test("MyST shared children and external-only groups do not override canonical routes", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-shared-nav-test-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "first"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nfirst\nsecond\nexternal\nfirst/*\napi/index\n```\n");
  for (const parent of ["first", "second"]) {
    fs.writeFileSync(path.join(source, `${parent}.md`), `# ${parent}\n\n\`\`\`{toctree}\nshared\n\`\`\`\n`);
  }
  fs.writeFileSync(path.join(source, "shared.md"), "# Shared\n");
  fs.writeFileSync(path.join(source, "first/shared.md"), "# Unrelated canonical page\n");
  fs.writeFileSync(path.join(source, "external.md"), "# External\n\n```{toctree}\nWebsite <https://example.com/>\n```\n");
  const apiSource = path.join(root, "api");
  fs.mkdirSync(apiSource);
  fs.writeFileSync(path.join(apiSource, "index.qmd"), "# API\n");
  const modules = [{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true, apiSource, apiIndexFile: "api/index.md" }];
  const options = { outputRoot: output, publicRoot: path.join(root, "public") };
  convertModules(modules, options);
  const tree = JSON.parse(fs.readFileSync(path.join(output, "fixture-nav-tree.json"), "utf8"));
  assert.equal(tree[0].children[0].url, "/fixture/shared");
  assert.equal(tree[1].children[0].url, "/fixture/shared");
  assert.equal(tree[2].children[0].url, "https://example.com/");
  assert.equal(tree[3].type, "folder");
  assert.equal(tree[3].children[0].url, "/fixture/first/shared");
  assert.deepEqual(tree[4], { type: "reference", url: "/fixture/api" });
  assert.ok(fs.existsSync(path.join(output, "fixture/api/index.mdx")));
  const redirects = JSON.parse(fs.readFileSync(path.join(output, "fixture-route-redirects.json"), "utf8"));
  assert.equal(redirects["/fixture/first/shared"], undefined);
  assert.equal(redirects["/fixture/second/shared"], "/fixture/shared");
  fs.writeFileSync(path.join(source, "shared.md"), "# Shared\n\n```{toctree}\nfirst\n```\n");
  assert.throws(() => convertModules(modules, options), /circular toctree/);
});

test("staging an image also stages its .dark sibling", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-dark-image-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "img"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\npage\n```\n");
  fs.writeFileSync(path.join(source, "page.md"), "# Page\n\n![A](img/a.png)\n\n![B](img/b.png)\n");
  for (const name of ["a.png", "a.dark.png", "b.png"]) fs.writeFileSync(path.join(source, "img", name), name);
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const assets = path.join(root, "public/fixture-assets/img");
  assert.deepEqual(fs.readdirSync(assets).sort(), ["a.dark.png", "a.png", "b.png"]);
  assert.match(fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8"), /\/fixture-assets\/img\/a\.png/);
});

test("RST figure caption math is emitted as KaTeX-ready TeX", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-caption-math-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  fs.writeFileSync(path.join(source, "fig.png"), "");
  fs.writeFileSync(path.join(source, "page.rst"),
    "Page\n====\n\n.. figure:: fig.png\n   :align: center\n\n   Overlap :math:`\\text{Re}\\Braket{a | b}` for :math:`k<l`.\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.match(generated, /<figcaption>Overlap \$\\text\{Re\}\\Braket\{a \| b\}\$ for \$k\\lt l\$\.<\/figcaption>/);
  assert.doesNotMatch(generated, /class(Name)?="math/);
});

test("RST image :align: and :width: become inline styles", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-image-align-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  fs.writeFileSync(path.join(source, "logo.png"), "");
  fs.writeFileSync(path.join(source, "plain.png"), "");
  fs.writeFileSync(path.join(source, "page.rst"),
    "Page\n====\n\n.. image:: logo.png\n   :align: right\n   :width: 350px\n\n.. image:: plain.png\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.match(generated,
    /<img src="\/fixture-assets\/logo\.png" alt="image" style=\{\{ "float": "right", "margin": "0 0 1rem 1\.5rem", "maxWidth": "50%", "width": "350px" \}\} \/>/);
  assert.match(generated, /!\[image\]\(\/fixture-assets\/plain\.png\)/);
});

test("Sphinx `name.*` image wildcards resolve to the preferred format", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-image-wildcard-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  for (const name of ["fig.png", "fig.svg", "pic.png"]) fs.writeFileSync(path.join(source, name), "");
  fs.writeFileSync(path.join(source, "page.rst"),
    "Page\n====\n\n.. figure:: fig.*\n\n   Caption.\n\n.. image:: pic.*\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.match(generated, /<img src="\/fixture-assets\/fig\.svg"/);
  assert.match(generated, /!\[image\]\(\/fixture-assets\/pic\.png\)/);
  assert.deepEqual(fs.readdirSync(path.join(root, "public/fixture-assets")).sort(), ["fig.svg", "pic.png"]);
});

test(":numref: resolves figures labelled with :name: as well as .. _label:", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-numref-name-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  for (const name of ["a.png", "b.png"]) fs.writeFileSync(path.join(source, name), "");
  fs.writeFileSync(path.join(source, "page.rst"), [
    "Page", "====", "",
    "See :numref:`first-fig` and :numref:`second_fig`.", "",
    ".. _first-fig:", "",
    ".. figure:: a.png", "", "   First.", "",
    ".. figure:: b.png", "   :align: center", "   :name: second_fig", "", "   Second.", "",
    ".. math::", "   :label: eq-one", "", "   x = 1", "",
  ].join("\n"));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.match(generated, /See \[Fig\. 1\]\(#first-fig\) and \[Fig\. 2\]\(#second_fig\)\./);
  assert.match(generated, /<img src="\/fixture-assets\/b\.png" id="second_fig"/);
  assert.doesNotMatch(generated, /label=/);
});

test("commented-out includes are not inlined; toctree entries take the page title", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-comment-include-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n   child\n");
  fs.writeFileSync(path.join(source, "child.rst"),
    ":class:`~pkg.mod.Alpha` and :class:`pkg.Beta`\n==============================================\n\nChild body text.\n");
  fs.writeFileSync(path.join(source, "page.rst"),
    "Page\n====\n\nIntro.\n\n.. toctree::\n\n   child\n\n..\n    .. include:: child.rst\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.doesNotMatch(generated, /Child body text/);
  assert.match(generated, /^- \[\]\(\.\/child\.mdx\)$/m);
  // Sphinx's display for the roles: `~` shortens, a bare target stays in full.
  assert.match(fs.readFileSync(path.join(output, "fixture/child.mdx"), "utf8"),
    /^title: "Alpha and pkg\.Beta"$/m);
});

test("bibliography entries decode LaTeX accents and citations link to them", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-bib-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n   bibliography\n");
  fs.writeFileSync(path.join(source, "page.rst"), "Page\n====\n\nSee :cite:`diaz2021`.\n");
  fs.writeFileSync(path.join(source, "bibliography.rst"), "Bibliography\n============\n\n.. bibliography::\n");
  fs.writeFileSync(path.join(source, "references.bib"),
    "@article{diaz2021,\n  author = {D\\'iaz-Tinoco, Manuel and Al\\'{a}n, B and M{\\\"u}ller, C and Pe\\~na, D and Musia{\\l}, E},\n" +
    "  title = {Local ans\\\"atze},\n  year = {2021},\n}\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const bib = fs.readFileSync(path.join(output, "fixture/bibliography.mdx"), "utf8");
  assert.match(bib, /Díaz-Tinoco, Manuel; Alán, B; Müller, C; Peña, D; Musiał, E \(2021\)\. \*Local ansätze\*\./);
  const cited = /See \(\[Díaz-Tinoco et al\., 2021\]\(\/fixture\/bibliography\/?#bib-diaz2021\)\)\./;
  assert.match(fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8"), cited);

  // Frozen, citations stay `cite:` links and the bibliography a placeholder,
  // filled from the `.bib` copied beside them.
  const committed = path.join(root, "docs");
  const mod = { name: "fixture", sphinxRoot: source, indexFile: "index.rst" };
  const roots = { outputRoot: output, publicRoot: path.join(root, "public") };
  convertModules([{ ...mod, freeze: { pages: ["**"], outDir: committed } }], roots);
  assert.match(fs.readFileSync(path.join(committed, "page.mdx"), "utf8"), /^See \[\]\(cite:p#diaz2021\)\.$/m);
  assert.match(fs.readFileSync(path.join(committed, "bibliography.mdx"), "utf8"), /^<Bibliography \/>$/m);
  const sources = JSON.parse(fs.readFileSync(path.join(committed, "freeze-sources.json"), "utf8"));
  assert.equal(sources["references.bib"], "../source/references.bib");
  assert.equal(sources["bibliography.mdx"], "../source/bibliography.rst");

  // With the RST and `.bib` gone, both come from the committed copies.
  for (const f of ["page.rst", "bibliography.rst", "references.bib"]) fs.rmSync(path.join(source, f));
  convertModules([{ ...mod, mergedProse: committed }], roots);
  assert.match(fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8"), cited);
  assert.match(fs.readFileSync(path.join(output, "fixture/bibliography.mdx"), "utf8"), /Díaz-Tinoco, Manuel/);
});

test("RST :sup: and :sub: become HTML tags", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-supsub-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  fs.writeFileSync(path.join(source, "page.rst"),
    "Page\n====\n\nPowered by TKET :sup:`TM`\n------------------------\n\nAn H :sub:`2` molecule.\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.match(generated, /^## Powered by TKET <sup>TM<\/sup>$/m);
  assert.match(generated, /An H <sub>2<\/sub> molecule\./);
  assert.doesNotMatch(generated, /\^TM\^|~2~/);
});

test("apiGroups splits an RST module's API sidebar into folders", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-api-groups-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const apiSource = path.join(root, "api");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.mkdirSync(apiSource);
  fs.writeFileSync(path.join(source, "index.rst"), [
    "Docs", "====", "",
    ".. toctree::", "   :caption: Guide", "", "   page", "",
    ".. toctree::", "   :caption: API Reference", "", "   api/pkg_intro", "",
  ].join("\n"));
  fs.writeFileSync(path.join(source, "page.rst"), "Page\n====\n\nUses :class:`~pkg.extensions.viz.Viewer`.\n");
  fs.writeFileSync(path.join(apiSource, "index.qmd"), [
    "# API", "",
    "## pkg.core", "", "[core](core.qmd)", "",
    "## Pkg-Viz", "", "[extensions.viz](extensions.viz.qmd)", "",
  ].join("\n"));
  fs.writeFileSync(path.join(apiSource, "core.qmd"), "# core { #pkg.core }\n\nCore.\n");
  fs.writeFileSync(path.join(apiSource, "extensions.viz.qmd"),
    "# extensions.viz { #pkg.extensions.viz }\n\n### Viewer { #pkg.extensions.viz.Viewer }\n\nShows things.\n");
  convertModules([{
    name: "pkg", sphinxRoot: source, indexFile: "index.rst", apiSource,
    apiGroups: { title: "Pkg", groups: [{ title: "Pkg-Extensions", dir: "extensions", prefix: "extensions." }] },
  }], { outputRoot: output, publicRoot: path.join(root, "public") });
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(output, rel), "utf8"));
  assert.deepEqual(read("pkg/api/meta.json"), { title: "Pkg", pages: ["pkg.core"] });
  assert.deepEqual(read("pkg/api/extensions/meta.json"), { title: "Pkg-Extensions", pages: ["viz"] });
  const rootPages = read("pkg/meta.json").pages;
  assert.deepEqual(rootPages.slice(rootPages.indexOf("---API Reference---")), ["---API Reference---", "api", "api/extensions"]);
  assert.equal(read("pkg-nav-titles.json")["/pkg/api/extensions/viz"], "Pkg-Viz");
  assert.ok(fs.existsSync(path.join(output, "pkg/api/extensions/viz.mdx")));
  assert.match(fs.readFileSync(path.join(output, "pkg/page.mdx"), "utf8"),
    /\[`Viewer`\]\(#pkg\.extensions\.viz\.Viewer\)/);
});

test("apiPagePerSection renders each API section as one page of module sections", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-api-sections-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const apiSource = path.join(root, "api");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.mkdirSync(apiSource);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  fs.writeFileSync(path.join(source, "page.rst"), "Page\n====\n\nUses :class:`~pkg.multi.b.B` and :mod:`pkg.emb`.\n");
  fs.writeFileSync(path.join(apiSource, "index.qmd"), [
    "# API", "",
    "## pkg.core", "", "[core](core.qmd)", "",
    "## pkg.emb", "", "[emb.dmet](emb.dmet.qmd)", "",
    "## pkg.multi", "", "[multi.a](multi.a.qmd)", "[multi.b](multi.b.qmd)", "",
    "## Pkg-Viz", "", "[extensions.viz](extensions.viz.qmd)", "[extensions.viz.fmo](extensions.viz.fmo.qmd)", "",
  ].join("\n"));
  const mod = (/** @type {string} */ name, /** @type {string} */ cls) =>
    `# ${name} { #pkg.${name} }\n\nAbout ${name}.\n\n## Classes\n\n### ${cls} { #pkg.${name}.${cls} }\n\nA class.\n`;
  fs.writeFileSync(path.join(apiSource, "core.qmd"), mod("core", "Core"));
  fs.writeFileSync(path.join(apiSource, "emb.dmet.qmd"), mod("emb.dmet", "Dmet"));
  fs.writeFileSync(path.join(apiSource, "multi.a.qmd"), mod("multi.a", "A"));
  fs.writeFileSync(path.join(apiSource, "multi.b.qmd"), mod("multi.b", "B"));
  fs.writeFileSync(path.join(apiSource, "extensions.viz.qmd"), mod("extensions.viz", "Viewer"));
  fs.writeFileSync(path.join(apiSource, "extensions.viz.fmo.qmd"), mod("extensions.viz.fmo", "FMO"));
  convertModules([{
    name: "pkg", sphinxRoot: source, indexFile: "index.rst", apiSource, apiPagePerSection: true,
    apiGroups: { title: "Pkg", groups: [{ title: "Pkg-Extensions", dir: "extensions", prefix: "extensions." }] },
  }], { outputRoot: output, publicRoot: path.join(root, "public") });
  const read = (/** @type {string} */ rel) => fs.readFileSync(path.join(output, "pkg/api", rel), "utf8");
  assert.deepEqual(JSON.parse(read("meta.json")).pages, ["pkg.core", "pkg.emb", "pkg.multi"]);
  // A section that is its own module stays a plain module page.
  assert.match(read("pkg.core.mdx"), /^\(pkg\.core\)=$/m);
  const emb = read("pkg.emb.mdx");
  assert.match(emb, /^title: "pkg\.emb"$/m);
  assert.match(emb, /^\(pkg\.emb\)=$/m);
  assert.match(emb, /^## emb\.dmet \[#pkg\.emb\.dmet\]$/m);
  assert.doesNotMatch(emb, /## Classes/);
  assert.match(read("pkg.multi.mdx"), /## multi\.a \[#pkg\.multi\.a\][\s\S]*## multi\.b \[#pkg\.multi\.b\]/);
  assert.match(read("extensions/viz.mdx"), /### Viewer[\s\S]*## extensions\.viz\.fmo \[#pkg\.extensions\.viz\.fmo\]/);
  assert.match(fs.readFileSync(path.join(output, "pkg/page.mdx"), "utf8"),
    /\[`B`\]\(#pkg\.multi\.b\.B\) and \[\]\(#pkg\.emb\)/);
});

test("Python roles become MyST refs that keep Sphinx's display text", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-py-refs-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const apiSource = path.join(root, "api");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.mkdirSync(apiSource);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  fs.writeFileSync(path.join(source, "page.rst"), [
    "Page", "====", "",
    "Full :class:`pkg.core.Thing`, short :class:`~pkg.core.Thing`,",
    "method :meth:`~pkg.core.Thing.run`, titled :class:`a thing <pkg.core.Thing>`",
    "and missing :class:`pkg.core.Gone`.", "",
  ].join("\n"));
  fs.writeFileSync(path.join(apiSource, "index.qmd"), "# API\n\n## pkg.core\n\n[core](core.qmd)\n");
  fs.writeFileSync(path.join(apiSource, "core.qmd"), [
    "# core { #pkg.core }", "",
    "### Thing { #pkg.core.Thing }", "", "A thing.", "", "# WARNING not a heading", "",
    "##### run { #pkg.core.Thing.run }", "", "Runs.", "",
    "###### Warning {.doc-section .doc-section-warning}", "", "Careful.", "",
    "###### Returns {.doc-section .doc-section-returns}", "", "Nothing.", "",
    "### Sub { #pkg.core.Sub }", "",
    "Bases: [`Thing`](#pkg.core._impl.Thing), [`Hidden`](#pkg.core._impl.Hidden)`[int]`", "",
  ].join("\n"));
  convertModules([{ name: "pkg", sphinxRoot: source, indexFile: "index.rst", apiSource }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const page = fs.readFileSync(path.join(output, "pkg/page.mdx"), "utf8");
  assert.match(page, /Full \[\]\(#pkg\.core\.Thing\)/);
  assert.match(page, /short \[`Thing`\]\(#pkg\.core\.Thing\)/);
  assert.match(page, /method \[`run\(\)`\]\(#pkg\.core\.Thing\.run\)/);
  assert.match(page, /titled \[`a thing`\]\(#pkg\.core\.Thing\)/);
  assert.match(page, /missing `pkg\.core\.Gone`/);
  assert.match(fs.readFileSync(path.join(output, "pkg/api/pkg.core.mdx"), "utf8"), /^\\# WARNING not a heading$/m);
  // A napoleon admonition section becomes a callout, as on prose pages.
  assert.match(fs.readFileSync(path.join(output, "pkg/api/pkg.core.mdx"), "utf8"),
    /<Callout type="warn">\n\nCareful\.\n\n<\/Callout>\n\n###### Returns\n/);
  // Bases linked by canonical (private) path land where the class is documented.
  assert.match(fs.readFileSync(path.join(output, "pkg/api/pkg.core.mdx"), "utf8"),
    /^Bases: \[`Thing`\]\(#pkg\.core\.Thing\), `Hidden\[int\]`$/m);
});

test("labels atop nested Sphinx API pages point at their module's API page", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-api-labels-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const apiSource = path.join(root, "api");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "api/pkg"), { recursive: true });
  fs.mkdirSync(apiSource);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  fs.writeFileSync(path.join(source, "page.rst"), "Page\n====\n\nSee :ref:`the core <core-api>`.\n");
  fs.writeFileSync(path.join(source, "api/pkg/core.rst"),
    ".. _core-api:\n\npkg.core\n========\n\n.. automodule:: pkg.core.impl\n");
  fs.writeFileSync(path.join(apiSource, "index.qmd"), "# API\n\n## pkg.core.impl\n\n[impl](core.impl.qmd)\n");
  fs.writeFileSync(path.join(apiSource, "core.impl.qmd"), "# impl { #pkg.core.impl }\n\nText.\n");
  convertModules([{ name: "pkg", sphinxRoot: source, indexFile: "index.rst", apiSource }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const page = fs.readFileSync(path.join(output, "pkg/page.mdx"), "utf8");
  assert.match(page, /\[the core\]\(\/pkg\/api\/[^)#]*#pkg\.core\.impl\)/);
});

test("links to autosummary pages become API refs; paths re-entering the docs resolve", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-autosummary-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "sphinx");
  const apiSource = path.join(root, "api");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "guide"), { recursive: true });
  fs.mkdirSync(apiSource);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nguide/page\nother\n```\n");
  fs.writeFileSync(path.join(source, "other.md"), "# Other\n\nText.\n");
  fs.writeFileSync(path.join(source, "guide/page.md"), [
    "# Page", "",
    "Use [Thing](../api/generated/pkg.core.Thing.rst),",
    "[core](https://docs.quantinuum.com/pkg/api/generated/pkg.core.html),",
    "[gone](../api/generated/pkg.core.Gone.rst) and [other](../../sphinx/other.md).", "",
    "Bare [Thing too](../api/generated/pkg.core.Thing) and [the page](../api/pkg.core.md).", "",
  ].join("\n"));
  fs.writeFileSync(path.join(apiSource, "index.qmd"), "# API\n\n## pkg.core\n\n[core](core.qmd)\n");
  fs.writeFileSync(path.join(apiSource, "core.qmd"),
    "# core { #pkg.core }\n\n### Thing { #pkg.core.Thing }\n\nA thing.\n");
  convertModules([{ name: "pkg", sphinxRoot: source, indexFile: "index.md", markdown: true, apiSource }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const page = fs.readFileSync(path.join(output, "pkg/guide/page.mdx"), "utf8");
  assert.match(page, /Use \[Thing\]\(#pkg\.core\.Thing\),/);
  assert.match(page, /\[core\]\(\/pkg\/api\/pkg\.core#pkg\.core\),/);
  // An undocumented object links to its nearest documented parent.
  assert.match(page, /\[gone\]\(\/pkg\/api\/pkg\.core#pkg\.core\)/);
  assert.match(page, /\[other\]\(\.\.\/other\.mdx\)/);
  assert.match(page, /Bare \[Thing too\]\(#pkg\.core\.Thing\) and \[the page\]\(\.\.\/api\/pkg\.core\.mdx\)\./);
});

test("a multi-equation RST math block becomes one aligned/gathered display", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-multi-math-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  fs.writeFileSync(path.join(source, "page.rst"), [
    "Page", "====", "",
    ".. math::", "", "    a &= 0", "", "    b &= 1", "",
    ".. math::", "", "    x = 1", "", "    y = 2", "",
  ].join("\n"));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.match(generated, /\\begin\{aligned\}a &= 0 \\\\ b &= 1\\end\{aligned\}/);
  assert.match(generated, /\\begin\{gathered\}x = 1 \\\\ y = 2\\end\{gathered\}/);
  assert.doesNotMatch(generated, /\$\$\$\$/);
});

test("labelled RST equations are numbered and :eq: links to them", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-eq-refs-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "parts"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  fs.writeFileSync(path.join(source, "parts", "more.rst.inc"),
    ".. math::\n   :label: second\n\n   a &= b\n\n   c &= d\n");
  fs.writeFileSync(path.join(source, "page.rst"), [
    "Page", "====", "",
    ".. math::", "", "   u = v", "",
    ".. math::", "   :label: first", "", "   x = 1", "",
    ".. include:: parts/more.rst.inc", "",
    "Using :eq:`first` and :eq:`second`.", "",
  ].join("\n"));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.match(generated, /^<a id="eq-first" \/>\n\n\$\$\nx = 1 \\tag\{1\}\n\$\$$/m);
  assert.match(generated, /^<a id="eq-second" \/>$/m);
  assert.match(generated, /\\end\{aligned\} \\tag\{2\}/);
  assert.match(generated,
    /Using \[\(1\)\]\(#eq-first\) and \[\(2\)\]\(#eq-second\)\./);
  assert.doesNotMatch(generated, /u = v \\tag/);
});

test("refs and relative .html links to a page resolve, in-page ones to hashes", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-self-refs-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "index.rst"), ".. _top:\n\nDocs\n====\n\n.. toctree::\n\n   page\n   other\n");
  fs.writeFileSync(path.join(source, "page.rst"),
    "Page\n====\n\n.. _sec:\n\nSection\n-------\n\nSee :ref:`here <sec>`.\n\n.. _two words:\n\nMore\n----\n\nText.\n");
  fs.writeFileSync(path.join(source, "other.rst"),
    "Other\n=====\n\nSee :ref:`there <sec>`, :ref:`top`, :ref:`two words` and `that <page.html#sec>`_.\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const page = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  const other = fs.readFileSync(path.join(output, "fixture/other.mdx"), "utf8");
  assert.match(page, /^\(sec\)=\n\n## Section\s*$/m);
  assert.match(page, /\[here\]\(#sec\)/);
  assert.match(other, /\[there\]\(#sec\)/);
  // The module root index isn't emitted, so its label falls back to the URL.
  assert.match(other, /\[Docs\]\(\/fixture\/\)/);
  assert.match(other, /\[\]\(#two%20words\)/);
  assert.match(page, /^\(two words\)=$/m);
  assert.match(other, /\[that\]\(\.\/page\.mdx#section\)/);
});

test("freezing writes exec blocks and include partials that staging re-inlines", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-freeze-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const committed = path.join(root, "docs");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "page"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n   other\n");
  fs.writeFileSync(path.join(source, "page", "part.rst.inc"),
    "Part\n----\n\n.. jupyter-execute::\n\n   x = 2\n");
  fs.writeFileSync(path.join(source, "page.rst"), [
    "Page", "====", "",
    "Intro.", "",
    ".. image:: page/pic.png", "",
    ".. include:: page/part.rst.inc", "",
    ".. code-block:: python", "", "   y = 3", "",
  ].join("\n"));
  fs.writeFileSync(path.join(source, "page", "pic.png"), "png");
  fs.writeFileSync(path.join(source, "other.rst"), "Other\n=====\n\nText.\n");
  const mod = { name: "fixture", sphinxRoot: source, indexFile: "index.rst" };
  const roots = { outputRoot: output, publicRoot: path.join(root, "public") };

  convertModules([{ ...mod, freeze: { pages: ["page"], outDir: committed } }], roots);
  const page = fs.readFileSync(path.join(committed, "page.mdx"), "utf8");
  const part = fs.readFileSync(path.join(committed, "page", "_part.mdx"), "utf8");
  // The include's opening heading stays in the page: its level is the page's.
  assert.match(page, /^## Part\n\n<include>\.\/page\/_part\.mdx<\/include>$/m);
  assert.match(page, /^``` ?python\ny = 3\n```$/m);
  assert.doesNotMatch(part, /^#/m);
  assert.match(part, /^```python exec\nx = 2\n```$/m);
  assert.equal(fs.existsSync(path.join(committed, "xref-manifest.json")), false);
  // What `docs-build cutover` renames into each frozen file.
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(committed, "freeze-sources.json"), "utf8")), {
    "page.mdx": "../source/page.rst",
    "page/_part.mdx": "../source/page/part.rst.inc",
    "public/fixture-assets/page/pic.png": "../source/page/pic.png",
  });
  assert.doesNotMatch(fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8"), /exec|<include>/);

  // Without executeBlocks a page with exec blocks is an error, so drop the block
  // to check staging: the partial is inlined and the committed page wins.
  fs.writeFileSync(path.join(committed, "page", "_part.mdx"),
    "(part-label)=\n\n## Part `x`\n\nCommitted.\n\n<a id=\"term-big-word\" />\n\n**Big Word**\n\nMeaning.\n");
  // Once the RST is gone, other pages' refs resolve against the committed MDX.
  fs.rmSync(path.join(source, "page.rst"));
  fs.rmSync(path.join(source, "page"), { recursive: true });
  fs.writeFileSync(path.join(source, "other.rst"),
    "Other\n=====\n\nSee :ref:`part-label`, :doc:`page` and :term:`big word`.\n");
  convertModules([{ ...mod, mergedProse: committed }], roots);
  const staged = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.match(staged, /^## Part `x`\n\nCommitted\.$/m);
  assert.doesNotMatch(staged, /<include>/);
  assert.equal(fs.existsSync(path.join(output, "fixture/page/_part.mdx")), false);
  const other = fs.readFileSync(path.join(output, "fixture/other.mdx"), "utf8");
  assert.match(other, /See \[\]\(#part-label\), \[\]\(\.\/page\.mdx\) and \[big word\]\(\/fixture\/page\/#term-big-word\)\./);
  const xref = JSON.parse(fs.readFileSync(path.join(output, "fixture-xref-manifest.json"), "utf8"));
  assert.deepEqual(xref.labels["part-label"],
    { url: "/fixture/page/", anchor: "part-x", title: "Part x", defined: true });
  assert.ok(fs.existsSync(path.join(output, "fixture/other.mdx")));
  const meta = JSON.parse(fs.readFileSync(path.join(output, "fixture/meta.json"), "utf8"));
  assert.deepEqual(meta.pages, ["page", "other"]);
});

test("an include shared by two pages freezes to one partial both can use", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-shared-include-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const committed = path.join(root, "docs");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "t"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   t/overview\n   t/sub\n");
  fs.writeFileSync(path.join(source, "t", "data.txt"), "data\n");
  fs.writeFileSync(path.join(source, "t", "shared.rst.inc"),
    "Shared\n######\n\nBody with :download:`a file <data.txt>`.\n");
  fs.writeFileSync(path.join(source, "t", "overview.rst"), "Overview\n========\n\nIntro.\n\n.. include:: shared.rst.inc\n");
  fs.writeFileSync(path.join(source, "t", "sub.rst"), ".. include:: shared.rst.inc\n");
  const mod = { name: "fixture", sphinxRoot: source, indexFile: "index.rst" };
  const roots = { outputRoot: output, publicRoot: path.join(root, "public") };

  convertModules([{ ...mod, freeze: { pages: ["t/*"], outDir: committed } }], roots);
  const overview = fs.readFileSync(path.join(committed, "t/overview.mdx"), "utf8");
  const sub = fs.readFileSync(path.join(committed, "t/sub.mdx"), "utf8");
  const shared = fs.readFileSync(path.join(committed, "t/_shared.mdx"), "utf8");
  assert.match(overview, /^## Shared\n\n<include>\.\/_shared\.mdx<\/include>$/m);
  assert.match(sub, /^title: "Shared"$/m);
  assert.match(sub, /^<include>\.\/_shared\.mdx<\/include>$/m);
  // Keyed by the downloaded file's path in the repo, so the link is the same
  // from either page, and staged from there rather than committed twice.
  assert.match(shared, /<a href="\/fixture-assets\/_downloads\/source\/t\/data\.txt" download>a file<\/a>/);
  assert.equal(fs.existsSync(path.join(committed, "public/fixture-assets/_downloads")), false);
  convertModules([{ ...mod, mergedProse: committed }], roots);
  assert.ok(fs.existsSync(path.join(root, "public/fixture-assets/_downloads/source/t/data.txt")));

  // A heading inside the include whose level depends on the page can't share.
  fs.writeFileSync(path.join(source, "t", "shared.rst.inc"), "Body.\n\nInner\n-----\n\nMore.\n");
  fs.writeFileSync(path.join(source, "t", "sub.rst"),
    "Sub\n===\n\nSection\n~~~~~~~\n\n.. include:: shared.rst.inc\n");
  assert.throws(
    () => convertModules([{ ...mod, freeze: { pages: ["t/*"], outDir: committed } }], roots),
    (err) => /_shared\.mdx converts differently/.test(String(err?.cause?.message ?? err)),
  );
});

test("included-only RST pages fold into their includer, labels and all", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-included-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   host\n   other\n");
  fs.writeFileSync(path.join(source, "host.rst"), "Host\n====\n\n.. include:: part.rst\n");
  fs.writeFileSync(path.join(source, "part.rst"), ".. _part-label:\n\nPart\n----\n\nText.\n");
  fs.writeFileSync(path.join(source, "other.rst"), "Other\n=====\n\nSee :ref:`part-label`.\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  assert.equal(fs.existsSync(path.join(output, "fixture/part.mdx")), false);
  assert.match(fs.readFileSync(path.join(output, "fixture/host.mdx"), "utf8"), /^\(part-label\)=\n\n## Part\s*$/m);
  assert.match(fs.readFileSync(path.join(output, "fixture/other.mdx"), "utf8"),
    /\[\]\(#part-label\)/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, "fixture-route-redirects.json"), "utf8")),
    { "/fixture/part": "/fixture/host" });
});

test("freeze globs honour exclude and can write the sidebar", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-freeze-glob-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const committed = path.join(root, "docs");
  const output = path.join(root, "output");
  fs.mkdirSync(path.join(source, "guide"), { recursive: true });
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   Alpha <guide/a>\n");
  fs.writeFileSync(path.join(source, "guide", "a.rst"), "A\n=\n\nText.\n\n.. toctree::\n\n   b\n");
  fs.writeFileSync(path.join(source, "guide", "b.rst"), "B\n=\n\nText.\n");
  const mod = { name: "fixture", sphinxRoot: source, indexFile: "index.rst" };
  const roots = { outputRoot: output, publicRoot: path.join(root, "public") };
  convertModules([{ ...mod,
    freeze: { pages: ["guide/*"], exclude: ["guide/b"], outDir: committed, nav: true } }], roots);
  const a = fs.readFileSync(path.join(committed, "guide/a.mdx"), "utf8");
  assert.equal(fs.existsSync(path.join(committed, "guide/b.mdx")), false);
  assert.ok(fs.existsSync(path.join(committed, "meta.json")));
  // Sidebar label and nesting travel in the page, not URL-keyed JSON files.
  assert.match(a, /^---\ntitle: "A"\nnavTitle: "Alpha"\nnavChildren:\n {2}- "b"\n---\n/);
  assert.equal(fs.existsSync(path.join(committed, "nav-titles.json")), false);
  assert.equal(fs.existsSync(path.join(committed, "nav-nesting.json")), false);

  // Once its RST is gone, the committed page's frontmatter still drives the nav.
  fs.rmSync(path.join(source, "guide", "a.rst"));
  fs.writeFileSync(path.join(committed, "guide/a.mdx"),
    a.replace('navTitle: "Alpha"', "navTitle: Edited"));
  convertModules([{ ...mod, mergedProse: committed }], roots);
  const titles = JSON.parse(fs.readFileSync(path.join(output, "fixture-nav-titles.json"), "utf8"));
  const nesting = JSON.parse(fs.readFileSync(path.join(output, "fixture-nav-nesting.json"), "utf8"));
  assert.equal(titles["/fixture/guide/a"], "Edited");
  assert.deepEqual(nesting["/fixture/guide/a"], ["/fixture/guide/b"]);
});

test("page titles drop pandoc's Markdown escapes", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-title-escape-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.rst"), "Docs\n====\n\n.. toctree::\n\n   page\n");
  fs.writeFileSync(path.join(source, "page.rst"), "Krylov subspace & Green's functions\n===================================\n\nBody.\n");
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.rst" }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/page.mdx"), "utf8");
  assert.match(generated, /^title: "Krylov subspace & Green's functions"$/m);
});

test("RST field lists in quartodoc docstrings become section headings", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-api-fieldlist-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const apiSource = path.join(root, "api");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.mkdirSync(apiSource);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n");
  fs.writeFileSync(path.join(apiSource, "index.qmd"), "# API\n\n## pkg.run\n\n[run](run.qmd)\n");
  fs.writeFileSync(path.join(apiSource, "run.qmd"), [
    "# run { #pkg.run }", "",
    "##### process { #pkg.run.process }", "",
    "See the base method.", "",
    ":Keyword Arguments:",
    "    * `postprocess`:",
    "        apply simplifications",
    "        (bool, default False)",
    "    * `seed`:",
    "        random seed", "",
    "Trailing prose.", "",
  ].join("\n"));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true, apiSource }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/api/pkg.run.mdx"), "utf8");
  assert.match(generated,
    /^###### Keyword Arguments\n\n\* `postprocess`:\n\n  apply simplifications\n  \(bool, default False\)\n\* `seed`:\n\n  random seed\n\nTrailing prose\.$/m);
  assert.doesNotMatch(generated, /:Keyword Arguments:/);
});

test("RST math and code directives in quartodoc docstrings become MDX", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-api-rst-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const apiSource = path.join(root, "api");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.mkdirSync(apiSource);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n");
  fs.writeFileSync(path.join(apiSource, "index.qmd"), "# API\n\n## pkg.prep\n\n[prep](prep.qmd)\n");
  fs.writeFileSync(path.join(apiSource, "prep.qmd"), [
    "# prep { #pkg.prep }", "",
    "Amplitudes satisfy :math:`\\sum_i |\\alpha_i|^2 = 1`. Prepares", "",
    ".. math::", "   :label: eq-prep", "",
    "    \\sum_i \\alpha_i |i\\rangle", "",
    "Example:", "",
    ".. code-block:: python3", "",
    "    prep([1, 0])", "    if True:", "        pass", "",
    ".. currentmodule:: pkg.prep", "",
    "Done.", "",
  ].join("\n"));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true, apiSource }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/api/pkg.prep.mdx"), "utf8");
  assert.match(generated, /satisfy \$\\sum_i \|\\alpha_i\|\^2 = 1\$\./);
  assert.match(generated, /^\$\$\n\\sum_i \\alpha_i \|i\\rangle\n\$\$$/m);
  assert.match(generated, /^```python\nprep\(\[1, 0\]\)\nif True:\n    pass\n```$/m);
  assert.doesNotMatch(generated, /\.\. [a-z-]+::|:math:|:label:/);
  assert.match(generated, /Done\./);
});

test("notebook HTML comments are removed before directive conversion", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-notebook-comments-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nexample\n```\n");
  const markdown = "# Example\n\nVisible before.\n\n<!-- Hidden FAQ\n\nHidden answer. -->\n\n<!--\n```{eval-rst}\n.. csv-table:: Hidden table\n    :file: nonexistent.csv\n```\n-->\n\nVisible after.\n";
  fs.writeFileSync(path.join(source, "example.ipynb"), JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } },
    cells: [{ id: "markdown", cell_type: "markdown", metadata: {}, source: markdown.split(/(?<=\n)/) }],
  }));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/example.mdx"), "utf8");
  assert.match(generated, /Visible before\./);
  assert.match(generated, /Visible after\./);
  assert.doesNotMatch(generated, /<!--|Hidden|nonexistent\.csv/);
});

test("notebook lists directly after a paragraph line stay lists despite Quarto", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-notebook-lists-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nexample\n```\n");
  const markdown = "# Example\n\nIncluding:\n* `alpha` first\n* `beta` second\n\nSteps:\n1. one\n2. two\n\nLimits between 10 and\n25. Not a list.\n\n```python\nx = 1\n* 2\n```\n";
  fs.writeFileSync(path.join(source, "example.ipynb"), JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } },
    cells: [{ id: "markdown", cell_type: "markdown", metadata: {}, source: markdown.split(/(?<=\n)/) }],
  }));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/example.mdx"), "utf8");
  assert.match(generated, /^Including:\n\n[-*] `alpha` first\n[-*] `beta` second$/m);
  assert.match(generated, /^Steps:\n\n1\. {1,2}one\n2\. {1,2}two$/m);
  assert.match(generated, /Limits between 10 and\s+25\. Not a list\./);
  assert.match(generated, /``` ?python\nx = 1\n\* 2\n```/);
  assert.doesNotMatch(generated, /\\\*/);
});

test("sphinx-tabs in notebook markdown become Tabs despite Quarto", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-notebook-tabs-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nexample\n```\n");
  const markdown = "# Example\n\n```{eval-rst}\n.. tabs::\n\n   .. code-tab:: shell pip\n\n      pip install x\n\n   .. code-tab:: shell uv\n\n      uv add x\n```\n";
  fs.writeFileSync(path.join(source, "example.ipynb"), JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } },
    cells: [{ id: "markdown", cell_type: "markdown", metadata: {}, source: markdown.split(/(?<=\n)/) }],
  }));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/example.mdx"), "utf8");
  assert.match(generated, /<Tabs items=\{\["pip","uv"\]\}>/);
  assert.match(generated, /```shell\npip install x\n```/);
  assert.doesNotMatch(generated, /QDOCSHIELDED|code-tab/);
});

test("MyST code-cell YAML options are not rendered as code", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-code-cell-options-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nexample\n```\n");
  fs.writeFileSync(path.join(source, "example.md"), [
    "# Example",
    "",
    "```{code-cell} ipython3",
    "---",
    "tags: [raises-exception]",
    "---",
    "raise ValueError()",
    "```",
    "",
  ].join("\n"));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/example.mdx"), "utf8");
  assert.match(generated, /```python\nraise ValueError\(\)\n```/);
  assert.doesNotMatch(generated, /raises-exception/);
});

test("MyST list-table renders as a GFM table", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-list-table-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nexample\n```\n");
  fs.writeFileSync(path.join(source, "example.md"), [
    "# Example",
    "",
    "```{list-table} Options",
    ":header-rows: 1",
    ":widths: auto",
    "",
    "* - Name",
    "  - Notes",
    "* - **Fast**",
    "  - First line.  ",
    "    Second $x \\leq 2$.",
    "",
    "    New paragraph | with pipe.",
    "* - Short",
    "  - —",
    "```",
    "",
  ].join("\n"));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/example.mdx"), "utf8");
  assert.match(generated, /\*\*Options\*\*\n\n\| Name \| Notes \|\n\| --- \| --- \|\n/);
  assert.match(generated, /\| \*\*Fast\*\* \| First line\.<br \/>Second \$x \\leq 2\$\.<br \/><br \/>New paragraph \\\| with pipe\. \|/);
  assert.match(generated, /\| Short \| — \|/);
  assert.doesNotMatch(generated, /list-table|header-rows/);
});

test("hidden directories such as .jupyter_cache are not converted", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-hidden-dirs-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  const cached = path.join(source, ".jupyter_cache", "executed", "abc123");
  fs.mkdirSync(cached, { recursive: true });
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\npage\n```\n");
  fs.writeFileSync(path.join(source, "page.md"), "# Page\n\nContent.\n");
  fs.writeFileSync(path.join(cached, "base.ipynb"), JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [{ id: "m", cell_type: "markdown", metadata: {}, source: ["# Cached\n"] }],
  }));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  assert.ok(fs.existsSync(path.join(output, "fixture/page.mdx")));
  assert.ok(!fs.existsSync(path.join(output, "fixture/.jupyter_cache")));
});

test("inline HTML in prose renders as markup unless left unclosed", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-inline-html-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nexample\n```\n");
  fs.writeFileSync(path.join(source, "example.md"), [
    "# Example",
    "",
    "<b>Ground-state energy project for",
    "CH<sub>2</sub></b>",
    "",
    "Run on methylene, CH<sub>2</sub>.<br>Then <i>wait</i>.",
    "",
    "A <b>stray tag with no close.",
    "",
    "## Next step</b>",
    "",
  ].join("\n"));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/example.mdx"), "utf8");
  assert.match(generated, /<b>Ground-state energy project for\nCH<sub>2<\/sub><\/b>/);
  assert.match(generated, /CH<sub>2<\/sub>\.<br \/>Then <i>wait<\/i>\./);
  assert.match(generated, /A &lt;b>stray tag/);
  assert.match(generated, /^## Next step$/m);
});

test("notebook srcdoc iframe outputs are staged as static pages", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-notebook-iframe-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nexample\n```\n");
  const html = '\n\n<div style="resize: vertical; overflow: auto; height: 400px; display: block">\n    <iframe srcdoc="\n&lt;!DOCTYPE html&gt;\n&lt;html&gt;&lt;body&gt;&lt;script&gt;const x = &#34;{}&#34;;&lt;/script&gt;&lt;/body&gt;&lt;/html&gt;\n"\n            width="100%" height="100%"></iframe>\n</div>\n';
  fs.writeFileSync(path.join(source, "example.ipynb"), JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } },
    cells: [
      { id: "title", cell_type: "markdown", metadata: {}, source: ["# Example\n"] },
      { id: "code", cell_type: "code", metadata: {}, execution_count: 1, source: ["render(c)"],
        outputs: [{ output_type: "display_data", metadata: {}, data: { "text/html": html, "text/plain": "<HTML>" } }] },
    ],
  }));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/example.mdx"), "utf8");
  const src = generated.match(/<iframe src="(\/fixture-assets\/example\/_html\/[0-9a-f]+\.html)"[^>]*sandbox="allow-scripts"/)?.[1];
  assert.ok(src, generated);
  assert.doesNotMatch(generated, /srcdoc|&lt;/);
  const page = fs.readFileSync(path.join(root, "public", src), "utf8");
  assert.match(page, /<!DOCTYPE html>/);
  assert.match(page, /const x = "\{\}";/);
});

test("notebook cell outputs are wrapped in a code-output panel", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-notebook-output-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\nexample\n```\n");
  fs.writeFileSync(path.join(source, "example.ipynb"), JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } },
    cells: [
      { id: "title", cell_type: "markdown", metadata: {}, source: ["# Example\n"] },
      { id: "out", cell_type: "code", metadata: {}, execution_count: 1, source: ["print(1)"],
        outputs: [{ output_type: "stream", name: "stdout", text: ["1\n"] }] },
      { id: "quiet", cell_type: "code", metadata: {}, execution_count: 2, source: ["x = 2"], outputs: [] },
    ],
  }));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot: path.join(root, "public") });
  const generated = fs.readFileSync(path.join(output, "fixture/example.mdx"), "utf8");
  assert.match(generated, /print\(1\)\n```\n\n<div className="code-output">\n\n```text\n1\n```\n\n<\/div>/);
  assert.equal(generated.match(/code-output/g)?.length, 1);
  assert.doesNotMatch(generated, /QDOCOUTPUT/);
});

test("conversion errors fail the process instead of skipping a page", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-test-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\naccess\n```\n");
  fs.writeFileSync(path.join(source, "access.md"),
    "# Access\n\n```{eval-rst}\n.. csv-table::\n    :file: missing.csv\n```\n");

  const script = `
    import { convertModules } from ${JSON.stringify(new URL("./generate.mjs", import.meta.url).href)};
    convertModules([${JSON.stringify({ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true })}],
      ${JSON.stringify({ outputRoot: output, publicRoot: path.join(root, "public"), logRoot: root })});
  `;
  const run = () => spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  const failed = run();
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /conversion failed: source\/access\.md/);
  assert.match(failed.stderr, /missing\.csv/);
  assert.equal(fs.existsSync(path.join(output, "fixture", "access.mdx")), false);

  fs.writeFileSync(path.join(source, "missing.csv"), "Machine,Qubits\nExample,2\n");
  const succeeded = run();
  assert.equal(succeeded.status, 0, succeeded.stderr);
  assert.match(fs.readFileSync(path.join(output, "fixture", "access.mdx"), "utf8"), /Example/);
});

const hasLatex = ["pdflatex", "pdftocairo"].every(
  (tool) => spawnSync(tool, ["-v"], { stdio: "ignore" }).error === undefined,
);

test("tikz directives render to SVG images with a dark variant", { skip: !hasLatex && "needs pdflatex + pdftocairo" }, (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-tikz-test-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const output = path.join(root, "output");
  const publicRoot = path.join(root, "public");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "index.md"), "# Docs\n\n```{toctree}\npage\n```\n");
  fs.writeFileSync(path.join(source, "page.md"), [
    "# Page", "", "```{tikz}", ":alt: A box", "", "\\draw (0,0) rectangle (1,1);", "```", "",
  ].join("\n"));
  convertModules([{ name: "fixture", sphinxRoot: source, indexFile: "index.md", markdown: true }],
    { outputRoot: output, publicRoot });

  const mdx = fs.readFileSync(path.join(output, "fixture", "page.mdx"), "utf8");
  const src = mdx.match(/<img src="(\/fixture-assets\/_tikz\/tikz-\w+)\.svg" alt="A box"/)?.[1];
  assert.ok(src, mdx);
  assert.doesNotMatch(mdx, /:alt:|\\draw/);
  const svg = fs.readFileSync(path.join(publicRoot, `${src}.svg`), "utf8");
  const dark = fs.readFileSync(path.join(publicRoot, `${src}.dark.svg`), "utf8");
  assert.match(svg, /rgb\(0%, 0%, 0%\)/);
  assert.doesNotMatch(dark, /rgb\(0%, 0%, 0%\)/);
});
