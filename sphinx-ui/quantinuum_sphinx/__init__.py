from datetime import datetime, timezone
from pathlib import Path

from sphinx.application import Sphinx


def _add_current_year(app, pagename, templatename, context, doctree):
    context["current_year"] = datetime.now(timezone.utc).year


def setup(app: Sphinx):
    app.add_html_theme("quantinuum_sphinx", str(Path(__file__).resolve().parent))
    app.add_js_file("injectNav.iife.js")
    app.add_js_file("syncTheme.iife.js")
    app.connect("html-page-context", _add_current_year)
