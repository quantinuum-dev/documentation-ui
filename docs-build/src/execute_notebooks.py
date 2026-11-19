"""Execute a docs tree's notebooks for docs-build, like myst-nb's "cache" mode.

Runs every `.ipynb` and MyST-NB markdown page (`file_format: mystnb`) under
--root, except --exclude globs and --skip-dir directories, and writes each
executed notebook to --out at the source's relative path (`.md` sources gain an
`.ipynb` suffix). Each result is stamped with the source's SHA-256, so unchanged
sources are not re-run. Cells tagged `skip-execution` are not run and cells
tagged `raises-exception` may fail, as in myst-nb.

Committed MDX pages (`.mdx`, not `_`-prefixed partials) with ```` ```python exec
```` blocks run the same way: the page with its Fumadocs `<include>`s inlined is
one notebook of those blocks, written as `<page>.mdx.ipynb` and keyed on that
inlined text (generate.mjs mirrors the inlining and checks the key).

Run it inside the documented product's environment, which must provide
nbformat, nbclient and ipykernel, adding this script's own requirements
(jupytext reads the MyST-NB pages):

    uv run --project <product> --with-requirements execute-requirements.txt \
        python execute_notebooks.py --root docs --out out
"""

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

import jupytext
import nbformat
import yaml
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError

# Kept in step with collectRst's SKIP_DIRS in generate.mjs.
SKIP_DIRS = {"_build", "_static", "_templates", "api", "public", "quantinuum-sphinx"}
MANIFEST = ".execution.json"
KERNELSPEC = {"name": "python3", "display_name": "Python 3", "language": "python"}


def glob_regex(pattern: str) -> re.Pattern:
    """Sphinx-style path glob: `*` stays within a segment, `**` spans them."""
    out = ""
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
        elif pattern.startswith("**", i):
            out += ".*"
            i += 2
        elif pattern[i] == "*":
            out += "[^/]*"
            i += 1
        elif pattern[i] == "?":
            out += "[^/]"
            i += 1
        else:
            out += re.escape(pattern[i])
            i += 1
    return re.compile(out + r"\Z")


def split_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text
    return yaml.safe_load(text[4:end]) or {}, text[end + 5 :]


def is_mystnb(path: Path) -> bool:
    front, _ = split_frontmatter(path.read_text(encoding="utf-8"))
    fmt = front.get("jupytext", {}).get("text_representation", {}).get("format_name")
    return front.get("file_format") == "mystnb" or fmt == "myst"


def read_mystnb(path: Path):
    front, body = split_frontmatter(path.read_text(encoding="utf-8"))
    # myst-nb accepts a partial kernelspec (e.g. no display_name); nbformat
    # validation in jupytext doesn't, and the kernel is fixed to python3 anyway.
    front.pop("kernelspec", None)
    nb = jupytext.reads(f"---\n{yaml.safe_dump(front)}---\n{body}", fmt="md:myst")
    nb.metadata["kernelspec"] = KERNELSPEC
    return nb


# Kept in step with INCLUDE_LINE / EXEC_FENCE in generate.mjs.
INCLUDE_LINE = re.compile(r"^<include>\s*(.+?)\s*</include>[ \t]*$", re.M)
EXEC_FENCE = re.compile(r"^([ \t]*)(`{3,})python exec[ \t]*$")


def expand_includes(text: str, base: Path, depth: int = 0) -> str:
    """Inline `<include>./file.mdx</include>` lines, as generate.mjs does."""
    if depth > 12:
        return text

    def inline(m: re.Match) -> str:
        target = (base / m.group(1)).resolve()
        body = target.read_bytes().decode("utf-8").rstrip("\n")
        return expand_includes(body, target.parent, depth + 1)

    return INCLUDE_LINE.sub(inline, text)


def mdx_text(path: Path) -> str:
    # Bytes, not read_text: newline translation would change the key.
    return expand_includes(path.read_bytes().decode("utf-8"), path.parent)


def exec_blocks(text: str) -> list[str]:
    lines = text.split("\n")
    blocks = []
    i = 0
    while i < len(lines):
        m = EXEC_FENCE.match(lines[i])
        i += 1
        if not m:
            continue
        indent, close = m.group(1), re.compile(rf"^[ \t]*`{{{len(m.group(2))},}}[ \t]*$")
        body = []
        while i < len(lines) and not close.match(lines[i]):
            line = lines[i]
            body.append(line[len(indent):] if line.startswith(indent) else line)
            i += 1
        blocks.append("\n".join(body))
    return blocks


def read_mdx(path: Path):
    nb = nbformat.v4.new_notebook(
        cells=[nbformat.v4.new_code_cell(src) for src in exec_blocks(mdx_text(path))],
        metadata={"kernelspec": KERNELSPEC, "language_info": {"name": "python"}},
    )
    return nb


def discover(root: Path, exclude: list[re.Pattern], skip_dirs: set[str]):
    # Follow symlinked dirs (e.g. guppyft's docs/examples -> ../examples), as Sphinx does.
    for dirpath, dirnames, filenames in os.walk(root, followlinks=True):
        dirnames[:] = sorted(
            d for d in dirnames if not d.startswith(".") and d not in SKIP_DIRS | skip_dirs
        )
        for name in sorted(filenames):
            path = Path(dirpath, name)
            rel = path.relative_to(root).as_posix()
            if any(p.match(rel) for p in exclude):
                continue
            if name.endswith(".ipynb") or (name.endswith(".md") and is_mystnb(path)):
                yield path, rel
            elif (
                name.endswith(".mdx")
                and not name.startswith("_")
                and exec_blocks(mdx_text(path))
            ):
                yield path, rel


def use_this_python_as_kernel() -> None:
    """Point the `python3` kernel at this interpreter (the product env), ahead of
    any user-installed kernelspec of the same name."""
    spec_dir = Path(tempfile.mkdtemp(prefix="docs-build-kernel-"), "kernels", "python3")
    spec_dir.mkdir(parents=True)
    (spec_dir / "kernel.json").write_text(
        json.dumps(
            {
                "argv": [sys.executable, "-m", "ipykernel_launcher", "-f", "{connection_file}"],
                "display_name": "Python 3",
                "language": "python",
            }
        )
    )
    os.environ["JUPYTER_PATH"] = os.pathsep.join(
        filter(None, [str(spec_dir.parent.parent), os.environ.get("JUPYTER_PATH")])
    )


def execute(nb, timeout: int, cwd: Path, attempts: int = 3) -> None:
    """Run `nb` in place, retrying a kernel that dies on startup.

    jupyter_client picks free ports that the kernel binds later, so a concurrent
    executor (parallel build stages share a network) can take one in between.
    """
    for attempt in range(1, attempts + 1):
        try:
            NotebookClient(
                nb,
                timeout=timeout,
                kernel_name="python3",
                resources={"metadata": {"path": str(cwd)}},
            ).execute()
            return
        except RuntimeError as err:
            if "before replying to kernel_info" not in str(err) or attempt == attempts:
                raise
            print(f"execute_notebooks: kernel failed to start, retrying ({err})", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--timeout", type=int, default=120, help="per cell, in seconds")
    parser.add_argument("--exclude", action="append", default=[])
    parser.add_argument("--skip-dir", action="append", default=[])
    args = parser.parse_args()

    use_this_python_as_kernel()
    root = args.root.resolve()
    out = args.out.resolve()
    exclude = [glob_regex(p) for p in args.exclude]
    written = set()
    failures = []
    for path, rel in discover(root, exclude, set(args.skip_dir)):
        dest = out / (rel if rel.endswith(".ipynb") else f"{rel}.ipynb")
        written.add(dest)
        is_mdx = rel.endswith(".mdx")
        source = mdx_text(path).encode("utf-8") if is_mdx else path.read_bytes()
        digest = hashlib.sha256(source).hexdigest()
        if dest.exists():
            done = json.loads(dest.read_text(encoding="utf-8"))
            if done.get("metadata", {}).get("docs_build", {}).get("source_sha256") == digest:
                continue
        print(f"execute_notebooks: executing {rel}", flush=True)
        if is_mdx:
            nb = read_mdx(path)
        elif rel.endswith(".ipynb"):
            nb = nbformat.read(path, as_version=4)
        else:
            nb = read_mystnb(path)
        try:
            # An MDX page's blocks run in a scratch dir so files they write don't
            # land in the docs repo.
            if is_mdx:
                with tempfile.TemporaryDirectory(prefix="docs-build-exec-") as cwd:
                    execute(nb, args.timeout, Path(cwd))
            else:
                execute(nb, args.timeout, path.parent)
        except CellExecutionError as err:
            failures.append(f"{rel}:\n{err}")
            dest.unlink(missing_ok=True)
            continue
        nb.metadata["docs_build"] = {"source_sha256": digest}
        dest.parent.mkdir(parents=True, exist_ok=True)
        nbformat.write(nb, dest)

    # Drop results for sources that were removed or are now excluded.
    if out.exists():
        for stale in out.rglob("*.ipynb"):
            if stale not in written:
                stale.unlink()
    out.mkdir(parents=True, exist_ok=True)
    (out / MANIFEST).write_text(
        json.dumps(
            {
                "exclude": sorted(args.exclude),
                "skipDirs": sorted(args.skip_dir),
                "timeout": args.timeout,
            },
            indent=2,
        )
        + "\n"
    )
    for failure in failures:
        print(f"execute_notebooks: FAILED {failure}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
