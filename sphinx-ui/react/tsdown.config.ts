import { defineConfig } from 'tsdown'

const NEXT_PUBLIC_GA_ID = JSON.stringify(process.env.NEXT_PUBLIC_GA_ID || '')

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
    target: "es2015",
    platform: "browser",
    define: {
      '__NEXT_PUBLIC_GA_ID__': NEXT_PUBLIC_GA_ID,
    },
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
    target: "es2015",
    platform: "browser",
    define: {
      '__NEXT_PUBLIC_GA_ID__': NEXT_PUBLIC_GA_ID,
    },
    format: ["iife"],
    clean: true,
  },
])
