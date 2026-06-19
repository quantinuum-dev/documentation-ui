/// <reference types="node" />

import path from 'path'
import { fileURLToPath } from 'url'
import { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'
import { tailwindTheme } from '@quantinuum/documentation-ui/tailwindTheme'

const documentationUiDistSrcDir = path.dirname(fileURLToPath(import.meta.resolve('@quantinuum/documentation-ui')))
const quantinuumUiDistSrcDir = path.dirname(fileURLToPath(import.meta.resolve('@quantinuum/quantinuum-ui')))

export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx,html}',
    path.join(documentationUiDistSrcDir, '**/*.{js,ts,jsx,tsx,mdx}'),
    path.join(quantinuumUiDistSrcDir, '**/*.{js,ts,jsx,tsx,mdx}'),
  ],
  theme: {
    extend: {
      screens: {
        wide: '1600px',
      },
      // fontFamily: {
      //   'inter': ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif', "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"],
      // },
    },
  },
  plugins: [
    plugin(({ matchUtilities, theme }) => {
      matchUtilities(
        {
          'animation-delay': (value) => {
            return {
              'animation-delay': value,
            }
          },
        },
        {
          values: theme('transitionDelay'),
        }
      )
    }),
  ],
  presets: [tailwindTheme],
} satisfies Config
