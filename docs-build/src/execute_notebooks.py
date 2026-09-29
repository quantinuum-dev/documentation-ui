"""Execute a docs tree's notebooks for docs-build, like myst-nb's "cache" mode.

Runs every `.ipynb` and MyST-NB markdown page (`file_format: mystnb`) under
--root, except --exclude globs and --skip-dir directories, and writes each
executed notebook to --out at the source's relative path (`.md` sources gain an
`.ipynb` suffix). Each result is stamped with the source's SHA-256, so unchanged
sources are not re-run. Cells tagged `skip-execution` are not run and cells
tagged `raises-exception` may fail, as in myst-nb.

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


def discover(root: Path, exclude: list[re.Pattern], skip_dirs: set[str]):
    for dirpath, dirnames, filenames in os.walk(root):
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
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if dest.exists():
            done = json.loads(dest.read_text(encoding="utf-8"))
            if done.get("metadata", {}).get("docs_build", {}).get("source_sha256") == digest:
                continue
        print(f"execute_notebooks: executing {rel}", flush=True)
        nb = nbformat.read(path, as_version=4) if rel.endswith(".ipynb") else read_mystnb(path)
        try:
            NotebookClient(
                nb,
                timeout=args.timeout,
                kernel_name="python3",
                resources={"metadata": {"path": str(path.parent)}},
            ).execute()
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
