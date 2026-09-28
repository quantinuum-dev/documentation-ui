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
  fs.writeFileSync(path.join(source, "start.md"), "# Start\n\n```{toctree}\nFirst steps <examples/first>\nWebsite <https://example.com/>\n```\n");
  fs.writeFileSync(path.join(source, "examples/first.md"), "# First\n\n```{toctree}\nsecond\n```\n");
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