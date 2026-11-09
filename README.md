# documentation-ui

Monorepo for the shared tooling behind Quantinuum's product documentation.
It is a pnpm workspace containing these packages:

| Package | npm name | Purpose |
| --- | --- | --- |
| [`documentation-ui/`](documentation-ui/) | `@quantinuum/documentation-ui` | React component library and Fumadocs theme for the documentation sites. |
| [`docs-build/`](docs-build/) | `@quantinuum/docs-build` | `docs-build` CLI: converts Sphinx RST/MyST, Jupyter notebooks and quartodoc API reference into Fumadocs MDX. |
| [`docs-preview/`](docs-preview/) | `@quantinuum/docs-preview` | `docs-preview` CLI: standalone Fumadocs harness for previewing (`dev`) or statically exporting (`build`) a product repo's docs. |
| [`docs-checks/`](docs-checks/) | `@quantinuum/docs-checks` | `docs-check-spelling`, `docs-check-prose` and `docs-check-links` CLIs, with the company-wide word list and house style. |

The `docs-*` CLIs are run from a product documentation repo's root. Each
script's usage is documented at the top of its file in the package's `bin/`
directory.

## Pre-commit hooks

This repository uses [prek](https://prek.j178.dev/) to enforce formatting and
commit message conventions before each commit. prek is a fast, dependency-free
alternative to `pre-commit`, written in Rust.

### Prerequisites

- **Node.js / pnpm** — required by the Biome format check and commitlint hooks.

No Python or other runtime is needed to run prek itself.

### Installation

1. Install prek using the standalone installer:

   ```sh
   curl -LsSf https://prek.j178.dev/install.sh | sh
   ```

   Or via pip / pipx if you prefer a Python-managed install:

   ```sh
   pipx install prek
   ```

2. Install the git hooks into the repository:

   ```sh
   prek install
   ```

   Because the config sets `default_install_hook_types`, this single command
   installs both the `pre-commit` and `commit-msg` shims automatically.

### Running hooks manually

To run all hooks against every file (useful after initial setup or to check
the full codebase):

```sh
prek run --all-files
```

To run a single hook by id:

```sh
prek run no-tabs --all-files
```
