#!/usr/bin/env bash

set -euo pipefail

rm -rf ./demo/build/html
./build-dist.sh
uv sync
cd ./demo && uv run make html
cd ../
