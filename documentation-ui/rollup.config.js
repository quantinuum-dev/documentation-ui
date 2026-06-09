import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { createRequire } from "module";
import { readFileSync } from "node:fs";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import preserveDirectives from "rollup-plugin-preserve-directives";
import terser from "@rollup/plugin-terser";

const suppressUseClientWarning = (warning, warn) => {
  if (
    warning.code === "MODULE_LEVEL_DIRECTIVE" &&
    (warning.message.includes("'use client'") || warning.message.includes('"use client"'))
  ) {
    return;
  }
  warn(warning);
};

const require = createRequire(import.meta.url);
const pkg = require("./package.json");
const externalPackages = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

const isExternalDependency = (id) =>
  externalPackages.some((dependency) => id === dependency || id.startsWith(`${dependency}/`));

const emitStaticAssets = (assets) => ({
  name: "emit-static-assets",
  generateBundle() {
    for (const asset of assets) {
      this.emitFile({
        type: "asset",
        fileName: asset.fileName,
        source: readFileSync(asset.sourcePath, "utf8"),
      });
    }
  },
});

export default [{
  onwarn: suppressUseClientWarning,
  input: "src/index.ts",
  external: isExternalDependency,
  output: [
    {
      dir: "dist/",
      format: "esm",
      preserveModules: true,
      sourcemap: true,
    },
  ],
  plugins: [
    peerDepsExternal(),
    resolve(),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      declarationDir: "./dist/types",
    }),
    emitStaticAssets([
      {
        sourcePath: "./src/tokens.css",
        fileName: "tokens.css",
      },
    ]),
    terser({ compress: { directives: false } }),
    preserveDirectives(),
  ],

}, {
  onwarn: suppressUseClientWarning,
  input: "src/utils/syncTheme.ts",
  external: isExternalDependency,
  output: [
    {
      dir: "dist/src/utils/",
      format: "iife",
      name: "syncTheme",
    },
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      outDir: "dist/src/utils/",
      declaration: false,
    }),
    terser(),
  ],
}];
