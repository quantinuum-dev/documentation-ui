rm -rf ./dist
mkdir ./dist
cp -a quantinuum_sphinx/. dist/
echo "🔨 Generating UI assets..."
cd ./react
npm update @quantinuum/documentation-ui
npm install
npm run build
cp ./build/injectNav.iife.js ../quantinuum_sphinx/static/injectNav.iife.js
cp ./build/syncTheme.iife.js ../quantinuum_sphinx/static/syncTheme.iife.js
cp ./node_modules/@quantinuum/quantinuum-ui/dist/tokens.css ../quantinuum_sphinx/static/styles/quantinuum-ui-tokens.css
npx tailwindcss --postcss ./postcss.config.cjs -i ./index.css -o ../quantinuum_sphinx/static/styles/quantinuum-ui-tailwind.css
echo ✅ "Done. Added UI assets to dist."
cd ../
