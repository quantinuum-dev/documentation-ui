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
* No member summary tables. ``build`` strips the ``Classes``/``Methods``/
  ``Functions`` summary tables; each member is documented in full below them and
  the site's page contents already lists them.
"""
from __future__ import annotations

import re
from pathlib import Path

import quartodoc.ast as qast
from quartodoc import Builder
from quartodoc import parsers as _qd_parsers
from quartodoc.renderers.md_renderer import MdRenderer, ParamRow, dc, ds

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

# quartodoc's member summary (`## Methods` then `| Name | Description |` rows).
_RE_SUMMARY_TABLE = re.compile(
    r"^(#+ (?:Classes|Methods|Functions))\n\n\| Name \| Description \|\n\| --- \| --- \|\n(?:\|[^\n]*(?:\n|$))+",
    re.M,
)


def build(config: str = "_quarto.yml") -> None:
    """Run the quartodoc build in the current directory (patches applied on import)."""
    builder = Builder.from_quarto_config(config)
    builder.build()
    for page in Path(builder.dir).glob("*.qmd"):
        # index.qmd is the module manifest docs-build reads; its tables stay.
        if page.name == "index.qmd":
            continue
        text = page.read_text(encoding="utf-8")
        stripped = _RE_SUMMARY_TABLE.sub(r"\1\n\n", text)
        if stripped != text:
            page.write_text(stripped, encoding="utf-8")
