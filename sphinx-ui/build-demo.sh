#!/usr/bin/env bash

set -euo pipefail

rm -rf ./demo/build/html
./build-dist.sh
poetry install
cd ./demo && poetry run make html
cd ../
