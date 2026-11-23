// @ts-check
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CUTOVER_MESSAGES, cutover } from "./cutover.mjs";

test("cutover moves sources onto their frozen paths in commits git follows", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-cutover-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Keep the user's git config (signing, hooks) out of the throwaway repo.
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com",
  };
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, "");
  /** @param {string[]} args */
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", env });
  /** @param {string} rel @param {string} text */
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  const rst = Array.from({ length: 20 }, (_, i) => `Line ${i} of the page.`).join("\n");
  write("source/page.rst", `Page\n====\n\n${rst}\n`);
  write("source/page/part.rst.inc", "Part text.\n");
  write("source/page/pic.png", "png");
  write("source/shared.png", "shared");
  write("source/notebook.ipynb", '{"cells": [{"source": "![](shared.png)"}]}\n');
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "rst");
  const mdx = `---\ntitle: "Page"\n---\n\n${rst}\n\n<include>./page/_part.mdx</include>\n`;
  write("docs/page.mdx", mdx);
  write("docs/page/_part.mdx", "Part text, converted.\n");
  write("docs/public/x-assets/page/pic.png", "png");
  write("docs/public/x-assets/shared.png", "shared");
  write("docs/freeze-sources.json", `${JSON.stringify({
    "page.mdx": "../source/page.rst",
    "page/_part.mdx": "../source/page/part.rst.inc",
    "public/x-assets/page/pic.png": "../source/page/pic.png",
    "public/x-assets/shared.png": "../source/shared.png",
  })}\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "parallel mdx");

  const saved = { ...process.env };
  Object.assign(process.env, env);
  context.after(() => {
    for (const key of Object.keys(env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });
  const result = cutover(path.join(root, "docs"), { log: () => {} });

  assert.deepEqual(result.kept, ["source/shared.png"]);
  assert.equal(result.moved.length, 3);
  assert.deepEqual(git("log", "-3", "--format=%s").trim().split("\n"), [...CUTOVER_MESSAGES].reverse());
  assert.equal(fs.readFileSync(path.join(root, "docs/page.mdx"), "utf8"), mdx);
  assert.equal(fs.existsSync(path.join(root, "source/page.rst")), false);
  assert.ok(fs.existsSync(path.join(root, "source/shared.png")));
  assert.equal(git("status", "--porcelain").trim(), "");
  // History reaches back through the move to the RST.
  assert.match(git("log", "--follow", "--name-status", "--format=", "docs/page.mdx"), /^R100\tsource\/page\.rst\tdocs\/page\.mdx$/m);
  assert.match(git("log", "--follow", "--format=%s", "docs/page/_part.mdx"), /^rst$/m);
  // The 20 prose lines (and a blank) are unchanged from the RST, so blamed to it.
  const blamed = git("blame", "--line-porcelain", "docs/page.mdx").match(/^summary rst$/gm) ?? [];
  assert.ok(blamed.length >= 20);
});
