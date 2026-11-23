"""Shared quartodoc renderer patches + build entry point for the API references.

Every product's ``build_api.py`` imports this so the MdRenderer patches live in
one place instead of being copy-pasted. Each project runs its wrapper from its
own directory with its own uv venv (which provides quartodoc); ``docs-build``
puts this directory on ``PYTHONPATH`` so ``import build_api_common`` resolves
regardless of which venv is active. (The central site's not-yet-migrated
projects still carry a copy beside them; keep the two in step until they move.)

Patches applied on import (quartodoc 0.11.1):

* numpydoc ``Yields`` support. quartodoc has no renderer for
  ``DocstringSectionYields`` and otherwise aborts the whole build with::

      NotImplementedError: Unsupported type:
      <class '_griffe.docstrings.models.DocstringSectionYields'>

  A ``Yields`` section has the same (name, type, description) shape as
  ``Returns``, so we render it identically. ``Warns``/``Receives``/
  ``Other Parameters``/``Deprecated`` are unrenderable for the same reason and
  are mapped onto their equivalent tables.
* Class constructor parameters. quartodoc renders only the class-level
  docstring, so numpydoc/Google style parameters documented on ``__init__`` are
  dropped. We merge the ``__init__`` docstring's sections (Parameters, etc.) into
  the class output. Re-exported classes reach the renderer as griffe ``Alias``
  objects (not ``dc.Class``), so both dispatches are needed.
* Return names. griffe misreads ``Type: description`` and ``Word :role:`x```
  returns as named values; ``_return_row`` moves them back (see there).
* Section layout. Parameters, Attributes, Returns, Yields, etc. render as
  two-column ``Name | Description`` tables in the style of spaCy's API docs (type
  and default under the description); unnamed Returns/Yields drop the name
  column, and Raises/Warns use ``Type | Description``. This replaces quartodoc's
  wide ``Name | Type | Description | Default``.
* No member summary tables. ``build`` strips the ``Attributes``/``Classes``/
  ``Methods``/``Functions`` summary tables; each member is documented in full
  below them (attributes too, which quartodoc only summarises, leaving the
  table's links without targets) and the site's page contents already lists them.

A content entry may give ``extra_members``: names its module imports but leaves
out of ``__all__`` (as a Sphinx page's ``.. autoclass::`` lines can document);
``build`` turns them into an explicit ``members`` list with ``__all__``.

A section may also give ``autosummary:`` roots (module names relative to the
quartodoc ``package``, or ``{name, package}`` mappings; omit ``name`` for the
package itself). ``build`` expands each root into module entries the way the
Sphinx docs' ``.. autosummary:: :recursive:`` does with
``autosummary_ignore_module_all = False``:

* a package with ``__all__`` documents just those names (re-exports included)
  and recurses only into submodules named in it;
* a package without ``__all__`` recurses into every public submodule.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import griffe
import quartodoc.ast as qast
import yaml
from quartodoc import Builder, layout
from quartodoc import parsers as _qd_parsers
from quartodoc.renderers.md_renderer import MdRenderer, ParamRow, _has_attr_section, dc, ds

# griffe's Google parser starts a NEW return item at every unindented line of a
# `Returns:` block, so a description wrapped over several lines becomes several
# items — it then indexes the (non-tuple) return annotation per item and raises
# IndexError, aborting the build. One item per section also matches how these
# docstrings are written.
_qd_parsers.DEFAULT_OPTIONS.setdefault("google", {})["returns_multiple_items"] = False


def _render_class_with_init(self: MdRenderer, el, target) -> str:
    """Render a class docstring, merging its ``__init__`` docstring sections.

    Append any ``__init__`` sections (Parameters, etc.) the class docstring
    doesn't already provide. ``target`` is the concrete class (``el`` itself, or
    an Alias's resolved target).
    """
    parts = []
    if el.docstring is not None:
        parts.append(self.render(el.docstring))

    init = target.members.get("__init__")
    init_doc = getattr(init, "docstring", None)
    if init_doc is not None:
        present = (
            {type(s) for s in el.docstring.parsed} if el.docstring is not None else set()
        )
        for section in qast.transform(init_doc.parsed):
            if section.kind.value == "text" or type(section) in present:
                continue
            parts.append(
                "\n\n".join([self.render_header(section), self.render(section)])
            )

    return "\n\n".join([p for p in parts if p])


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringSectionYields):  # noqa: F811
    rows = list(map(self.render, el.value))
    header = ["Name", "Type", "Description"]
    return self._render_table(rows, header, "returns")


_BUILTIN_TYPES = {
    "bool", "bytes", "complex", "dict", "float", "frozenset", "int", "list",
    "None", "object", "set", "str", "tuple",
}
# What griffe took for a description is really an RST role (`class:`X``).
_RE_ROLE_START = re.compile(r"^(?:[a-z][\w-]*:)+`")


def _return_row(self: MdRenderer, el) -> ParamRow:
    """Row for a Returns/Yields item, undoing griffe's ``name: description`` misreads.

    griffe reads ANY ``word:`` leading a Google return as a name, so
    ``Package: The compiled package.`` (Napoleon's ``type: description``) names the
    value "Package", and ``Mapped :class:`X` object.`` splits at the role's colon,
    naming it "Mapped".
    """
    name, desc, anno = el.name, el.description, el.annotation
    if name and _RE_ROLE_START.match(desc):
        name, desc = "", f"{name} :{desc}"
    elif name:
        base = str(anno).split("[", 1)[0].rsplit(".", 1)[-1] if anno else None
        if name == base or name in _BUILTIN_TYPES:
            name, anno = "", anno or name
    return ParamRow(name, desc, annotation=self.render_annotation(anno))


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringReturn):  # noqa: F811
    return _return_row(self, el)


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringYield):  # noqa: F811
    # Same shape as DocstringReturn: no name/default, just type + description.
    return _return_row(self, el)


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringSectionWarns):  # noqa: F811
    rows = list(map(self.render, el.value))
    return self._render_table(rows, ["Name", "Type", "Description"], "returns")


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringWarn):  # noqa: F811
    # Same shape as DocstringRaise: annotation + description, no name.
    return ParamRow(
        None,
        el.description,
        annotation=self.render_annotation(el.annotation),
    )


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringSectionReceives):  # noqa: F811
    rows = list(map(self.render, el.value))
    return self._render_table(rows, ["Name", "Type", "Description"], "returns")


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringReceive):  # noqa: F811
    return ParamRow(
        el.name,
        el.description,
        annotation=self.render_annotation(el.annotation),
    )


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringSectionOtherParameters):  # noqa: F811
    return self.render(ds.DocstringSectionParameters(el.value, title=el.title))


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringSectionDeprecated):  # noqa: F811
    return el.value.description


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: dc.Class):  # noqa: F811
    return _render_class_with_init(self, el, el)


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: dc.Alias):  # noqa: F811
    # Re-exported classes reach the renderer as Aliases; merge __init__ params
    # for those and fall back to the default object rendering otherwise.
    try:
        target = el.final_target
    except Exception:
        target = None
    if isinstance(target, dc.Class):
        return _render_class_with_init(self, el, target)
    return "" if el.docstring is None else self.render(el.docstring)


def _cell_code(text: str) -> str:
    """Inline code for a table cell from quartodoc's table-escaped text."""
    # Backslash escapes show literally inside code; only `\|` is needed (GFM
    # splits cells before parsing inline code).
    return "`" + text.replace("\\[", "[").replace("\\]", "]").replace("\\*", "*") + "`"


def _cell_text(text: str) -> str:
    """A description as one table cell, keeping paragraph breaks."""
    paragraphs = [" ".join(p.split()) for p in re.split(r"\n\s*\n", text.strip())]
    # One space keeps words apart for text extraction (search, prose checks).
    return "<br /><br /> ".join(p for p in paragraphs if p).replace("|", "\\|")


def _render_table(self: MdRenderer, rows, headers, style) -> str:
    """spaCy-style section table: name, then description with type/default below.

    Raises/Warns (the only rows with ``name=None``) keep the exception type as the
    left column; unnamed Returns/Yields drop the empty name column instead.
    """
    if all(row.name is None for row in rows):
        lines = ["| Type | Description |", "| --- | --- |"]
        for row in rows:
            anno = _cell_code(row.annotation) if row.annotation else ""
            lines.append(f"| {anno} | {_cell_text(row.description or '')} |")
        return "\n".join(lines)

    named = any(row.name for row in rows)
    lines = ["| Name | Description |", "| --- | --- |"] if named else ["| Description |", "| --- |"]
    for row in rows:
        desc = _cell_text(row.description or "")
        meta = []
        if row.annotation:
            meta.append(f"**Type:** {_cell_code(row.annotation)}")
        if style == "parameters" and row.default is not None:
            default = str(row.default).replace("|", "\\|")
            meta.append(f"**Default:** {_cell_code(default)}")
        if meta:
            desc = "<br /> ".join(filter(None, [desc, " ".join(meta)]))
        cells = [_cell_code(row.name) if row.name else "", desc] if named else [desc]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


MdRenderer._render_table = _render_table


def _render_doc_members(self: MdRenderer, el) -> str:
    """quartodoc's class/module page, with attributes documented like methods."""
    title = self.render_header(el)
    parts = []
    if el.members:
        sub_header = "#" * (self.crnt_header_level + 1)
        n_incr = 1 if el.flat else 2
        groups = [
            ("Attributes", [x for x in el.members if x.obj.is_attribute]),
            ("Classes", [x for x in el.members if x.obj.is_class]),
            (
                "Methods" if isinstance(el, layout.DocClass) else "Functions",
                [x for x in el.members if x.obj.is_function],
            ),
        ]
        for name, members in groups:
            # A docstring `Attributes:` section already documents them.
            if not members or (name == "Attributes" and _has_attr_section(el.obj.docstring)):
                continue
            rows = "\n".join(map(self.summarize, members))
            parts.append(f"{sub_header} {name}\n\n| Name | Description |\n| --- | --- |\n{rows}")
            with self._increment_header(n_incr):
                parts.extend(self.render(x) for x in members if isinstance(x, layout.Doc))

    sig_part = [self.signature(el)] if self.show_signature else []
    with self._increment_header():
        body = self.render(el.obj)
    return "\n\n".join([title, *sig_part, body, *parts])


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: layout.DocClass):  # noqa: F811
    return _render_doc_members(self, el)


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: layout.DocModule):  # noqa: F811
    return _render_doc_members(self, el)


# quartodoc's member summary (`## Methods` then `| Name | Description |` rows).
_RE_SUMMARY_TABLE = re.compile(
    r"^(#+ (?:Attributes|Classes|Methods|Functions))\n\n\| Name \| Description \|\n\| --- \| --- \|\n(?:\|[^\n]*(?:\n|$))+",
    re.M,
)


def _is_namespace_only(mod: griffe.Module) -> bool:
    """True for a package with nothing to document but its docstring."""
    return mod.exports is None and not any(
        not member.is_alias and not member.is_module and not name.startswith("_")
        for name, member in mod.members.items()
    )


def _exports(mod: griffe.Module) -> set[str] | None:
    """``__all__`` names; a spliced-in ``submodule.__all__`` counts as ``submodule``.

    Neither griffe nor quartodoc expands ``__all__ = [...] + sub.__all__`` (or
    the ``from .sub import *`` that usually goes with it), so those names are
    documented on the submodule's own page instead of the package's.
    """
    if mod.exports is None:
        return None
    names: set[str] = set()
    for item in mod.exports:
        name = str(item)
        target = "" if isinstance(item, str) else mod.imports.get(name, "")
        if target.endswith(".__all__"):
            name = target.removesuffix(".__all__").removeprefix(f"{mod.path}.")
        names.add(name)
    return names


def _walk_modules(mod: griffe.Module, rel: str):
    """Yield ``(name relative to the package, entry, namespace-only?)`` per module."""
    exports = _exports(mod)
    submodules = {
        name: member
        for name, member in mod.members.items()
        if not member.is_alias and member.is_module
    }

    entry: dict = {"name": rel}
    if exports is not None:
        entry["include_imports"] = True
        # Submodules named in __all__ get their own entry below.
        if exclude := sorted(exports & submodules.keys()):
            entry["exclude"] = exclude
    yield rel, entry, _is_namespace_only(mod)

    for name in sorted(submodules):
        sub = submodules[name]
        sub_rel = f"{rel}.{name}" if rel else name
        if exports is None:
            if not name.startswith("_"):
                yield from _walk_modules(sub, sub_rel)
        elif name in exports:
            # `from .x import x`: at runtime __all__'s `x` is the object, which
            # griffe hides behind the submodule, so document just that object.
            if mod.imports.get(name) == f"{sub.path}.{name}":
                yield sub_rel, {"name": sub_rel, "members": [name]}, False
            else:
                yield from _walk_modules(sub, sub_rel)


def _load(package: str, cache: dict[str, griffe.Module]) -> griffe.Module:
    if package not in cache:
        cache[package] = griffe.load(package)
    return cache[package]


def _expand_autosummary(qd: dict, *, complete: bool) -> None:
    """Replace each section's ``autosummary`` roots with the modules they reach.

    With ``complete``, exit if a module reachable from the package root (and
    with more than a docstring) is missing from every section.
    """
    default = qd["package"]
    cache: dict[str, griffe.Module] = {}
    covered = set()

    for section in qd["sections"]:
        roots = section.pop("autosummary", None)
        if roots is None:
            continue
        contents = section.setdefault("contents", [])
        for root in roots:
            root = {"name": root} if isinstance(root, str) else root
            package = root.get("package", default)
            name = root.get("name", "")
            pkg = _load(package, cache)
            for rel, entry, _ in _walk_modules(pkg[name] if name else pkg, name):
                if package == default:
                    covered.add(rel)
                if not rel:
                    # The package itself: quartodoc names it with no package prefix.
                    entry = {**entry, "name": package, "package": None}
                elif package != default:
                    entry = {**entry, "package": package}
                contents.append(entry)

    if complete:
        missing = [
            rel
            for rel, _, namespace_only in _walk_modules(_load(default, cache), "")
            if rel and not namespace_only and rel not in covered
        ]
        if missing:
            sys.exit(f"Add these modules to a section's autosummary: {', '.join(missing)}")


def _expand_extra_members(qd: dict) -> None:
    """Turn each content's ``extra_members`` into ``members``: ``__all__`` plus them."""
    cache: dict[str, griffe.Module] = {}
    for section in qd["sections"]:
        for entry in section.get("contents", []):
            if not isinstance(entry, dict) or "extra_members" not in entry:
                continue
            extra = entry.pop("extra_members")
            mod = _load(entry.get("package") or qd["package"], cache)[entry["name"]]
            entry["members"] = sorted((_exports(mod) or set()) | set(extra))


def build(config: str = "_quarto.yml", *, complete: bool = False) -> None:
    """Run the quartodoc build in the current directory (patches applied on import).

    ``complete`` checks the ``autosummary`` sections cover the whole package.
    """
    with open(config, encoding="utf-8") as f:
        quarto = yaml.safe_load(f)
    _expand_autosummary(quarto["quartodoc"], complete=complete)
    _expand_extra_members(quarto["quartodoc"])
    builder = Builder.from_quarto_config(quarto)
    builder.build()
    for page in Path(builder.dir).glob("*.qmd"):
        # index.qmd is the module manifest docs-build reads; its tables stay.
        if page.name == "index.qmd":
            continue
        text = page.read_text(encoding="utf-8")
        stripped = _RE_SUMMARY_TABLE.sub(r"\1\n\n", text)
        if stripped != text:
            page.write_text(stripped, encoding="utf-8")
