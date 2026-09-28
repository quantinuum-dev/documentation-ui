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
"""
from __future__ import annotations

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


@MdRenderer.render.dispatch
def render(self: MdRenderer, el: ds.DocstringYield):  # noqa: F811
    # Same shape as DocstringReturn: no name/default, just type + description.
    return ParamRow(
        el.name,
        el.description,
        annotation=self.render_annotation(el.annotation),
    )


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


def build(config: str = "_quarto.yml") -> None:
    """Run the quartodoc build in the current directory (patches applied on import)."""
    Builder.from_quarto_config(config).build()
