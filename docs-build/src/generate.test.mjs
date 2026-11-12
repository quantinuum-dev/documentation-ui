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
  assert.match(generated, /## Examples\n\n- \[Page first\]\(\/fixture\/first\/\)\n- \[Second one\]\(\/fixture\/second\/\)\n- \[Site\]\(https:\/\/example\.com\/\)\n/);
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
  assert.match(links, /\[Examples Gallery\]\(\/fixture\/examples\/a\/\)/);
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
