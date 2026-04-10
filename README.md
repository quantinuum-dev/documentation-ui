# documentation-ui

Monorepo containing the Quantinuum documentation UI component library
(`documentation-ui/`) and the Sphinx theme (`sphinx-ui/`).

## Pre-commit hooks

This repository uses [prek](https://prek.j178.dev/) to enforce formatting and
commit message conventions before each commit. prek is a fast, dependency-free
alternative to `pre-commit`, written in Rust.

### Prerequisites

- **Node.js / npm** — required by the Biome format check and commitlint hooks.

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
