#!/usr/bin/env bash

set -euo pipefail

rm -rf ./dist
mkdir ./dist
cp -a quantinuum_sphinx/. dist/
echo "🔨 Building documentation-ui workspace dependency..."
pnpm --filter @quantinuum/documentation-ui install --frozen-lockfile
pnpm --filter @quantinuum/documentation-ui run build
echo "🔨 Generating UI assets..."
cd ./react
pnpm install --frozen-lockfile
pnpm run build
cp ./build/injectNav.iife.js ../quantinuum_sphinx/static/injectNav.iife.js
cp ./build/syncTheme.iife.js ../quantinuum_sphinx/static/syncTheme.iife.js
cp ./node_modules/@quantinuum/documentation-ui/dist/tokens.css ../quantinuum_sphinx/static/styles/quantinuum-ui-tokens.css
pnpm exec tailwindcss --postcss ./postcss.config.mjs -i ./index.css -o ../quantinuum_sphinx/static/styles/quantinuum-ui-tailwind.css
echo ✅ "Done. Added UI assets to dist."
cd ../
