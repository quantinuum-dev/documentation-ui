import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],

  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 10000, // The default timeout is 5 seconds. In our case we have some complex UI tests that might take longer and may result in flaky tests thus we increase the maximum allowed time to 10 seconds.
    server: {
      // See https://vitest.dev/config/#server-deps-inline. This means we can import ESM in vitest tests.
      deps: {
          inline: ['@quantinuum/quantinuum-ui', '@quantinuum/documentation-ui'],
      },
    },
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
    include: [
      'src/**/*.{test,spec}.?(c|m)[jt]s?(x)', // By default vitest runs all .spec/.test files it finds. We don't want this because will try to run playwright tests as well so we specify here to run only tests files withing the .app folder
      'tests/contract/**/*.{test,spec}.?(c|m)[jt]s?(x)',
    ],
    setupFiles: ['setupTest.ts'],
  },
})
