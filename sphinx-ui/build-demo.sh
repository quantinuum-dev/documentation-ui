#!/usr/bin/env bash

set -euo pipefail

analytics_enabled=false
analytics_id=""

while (($#)); do
  case "$1" in
    --analytics)
      analytics_enabled=true
      shift
      ;;
    --analytics-id)
      if (($# < 2)); then
        echo "Error: --analytics-id requires a GA4 measurement ID." >&2
        exit 2
      fi
      analytics_enabled=true
      analytics_id="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: ./build-demo.sh [--analytics] [--analytics-id ID]"
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      echo "Usage: ./build-demo.sh [--analytics] [--analytics-id ID]" >&2
      exit 2
      ;;
  esac
done

rm -rf ./demo/build/html
./build-dist.sh
uv sync
cd ./demo

sphinx_options=""
if $analytics_enabled; then
  sphinx_options="-D html_theme_options.enable_analytics=true"
  if [[ -n "$analytics_id" ]]; then
    sphinx_options+=" -D html_theme_options.analytics_id=$analytics_id"
  fi
fi

uv run make html SPHINXOPTS="$sphinx_options"
cd ../
