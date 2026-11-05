/// <reference types="node" />

import { defineConfig } from 'tsdown'

export default defineConfig([
  // Script for injecting nav into sphinx build.
  {
    entry: { injectNav: './src/injectNav.tsx' },
    outDir: 'build',
    minify: true,
    deps: {
      alwaysBundle: [/./],
      onlyBundle: false,
    },
    target: "es2020",
    platform: "browser",
    format: ["iife"],
    clean: true,
  },
  // Script for syncing dark mode preference
  {
    entry: { syncTheme: './src/syncTheme.ts' },
    outDir: 'build',
    minify: true,
    deps: {
      alwaysBundle: [/./],
      onlyBundle: false,
    },
    target: "es2020",
    platform: "browser",
    format: ["iife"],
    clean: true,
  },
])
