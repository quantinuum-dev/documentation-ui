// @ts-check
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { FREEZE_SOURCES } from "./generate.mjs";

/** Tracked files that may still reference an image left in the source tree. */
const TEXT_FILE = /\.(rst|inc|md|mdx|ipynb|py|txt|html|tex|ya?ml|toml|cfg|json)$/;

export const CUTOVER_MESSAGES = [
  "docs: remove the generated MDX ahead of moving its sources",
  "docs: move the RST sources onto their MDX paths (content unchanged)",
  "docs: convert the moved sources to MDX",
];

/**
 * Swap a freeze dir's generated MDX for its sources, in three commits git can
 * follow: A removes the frozen files, B `git mv`s each source onto its frozen
 * path unchanged (an exact rename), C restores the frozen content. A single
 * commit would not do: the frozen paths already exist, so git sees them as
 * rewritten rather than renamed, and converted files are too unlike their RST to
 * be paired by similarity. Images another file still uses stay where they are.
 * @param {string} freezeDir directory holding `freeze-sources.json`
 * @param {{ dryRun?: boolean, log?: (msg: string) => void }} [options]
 * @returns {{ moved: [string, string][], kept: string[] }} repo-relative
 *   (source, frozen file) pairs moved, and sources left in place
 */
export function cutover(freezeDir, { dryRun = false, log = console.log } = {}) {
  const dir = path.resolve(freezeDir);
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8" }).trim();
  /** @param {string[]} args @param {string} [input] */
  const git = (args, input) => execFileSync("git", args, { cwd: root, encoding: "utf8", input });
  /** @param {string} p */
  const repoPath = (p) => path.relative(root, p).split(path.sep).join("/");

  const manifestFile = path.join(dir, FREEZE_SOURCES);
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`no ${FREEZE_SOURCES} in ${dir}; freeze the pages first`);
  }
  if (git(["status", "--porcelain", "--untracked-files=no"]).trim()) {
    throw new Error("the working tree has changes; commit or stash them first");
  }
  const tracked = new Set(git(["ls-files", "-z"]).split("\0").filter(Boolean));
  /** @type {Record<string, string>} */
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

  /** @type {[string, string][]} */
  const candidates = [];
  const sources = new Set();
  for (const [out, src] of Object.entries(manifest)) {
    const from = repoPath(path.resolve(dir, src));
    const to = repoPath(path.join(dir, out));
    if (!tracked.has(from) || !tracked.has(to) || sources.has(from)) continue;
    sources.add(from);
    candidates.push([from, to]);
  }
  const dirPrefix = repoPath(dir) ? `${repoPath(dir)}/` : "";
  const others = [...tracked]
    .filter((f) => TEXT_FILE.test(f) && !sources.has(f) && !f.startsWith(dirPrefix))
    .map((f) => fs.readFileSync(path.join(root, f), "utf8"));
  /** @type {[string, string][]} */
  const moved = [];
  /** @type {string[]} */
  const kept = [];
  for (const [from, to] of candidates) {
    const image = to.startsWith(`${dirPrefix}public/`);
    if (image && others.some((text) => text.includes(path.posix.basename(from)))) kept.push(from);
    else moved.push([from, to]);
  }

  log(`docs-build cutover: moving ${moved.length} source(s) onto their MDX paths`);
  for (const src of kept) log(`  kept (still used elsewhere): ${src}`);
  if (dryRun) {
    for (const [from, to] of moved) log(`  ${from} -> ${to}`);
    return { moved, kept };
  }

  const head = git(["rev-parse", "HEAD"]).trim();
  const outs = `${moved.map(([, to]) => to).join("\0")}\0`;
  try {
    git(["rm", "-q", "--pathspec-from-file=-", "--pathspec-file-nul"], outs);
    git(["commit", "-q", "-m", CUTOVER_MESSAGES[0]]);
    for (const [from, to] of moved) {
      // `git rm` drops directories it empties.
      fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
      git(["mv", from, to]);
    }
    git(["commit", "-q", "-m", CUTOVER_MESSAGES[1]]);
    git(["checkout", head, "--pathspec-from-file=-", "--pathspec-file-nul"], outs);
    git(["commit", "-q", "-m", CUTOVER_MESSAGES[2]]);
  } catch (err) {
    throw new Error(`cutover stopped part-way; \`git reset --hard ${head}\` undoes it`, { cause: err });
  }

  const renames = git(["diff", "--name-status", "-M100%", "HEAD~2", "HEAD~1"])
    .split("\n")
    .filter((line) => line.startsWith("R100")).length;
  if (renames !== moved.length) {
    log(`  warning: git sees ${renames} of ${moved.length} moves as renames`);
  }
  return { moved, kept };
}
