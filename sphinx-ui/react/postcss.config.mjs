import postcssImport from 'postcss-import'
import tailwindcssNesting from 'tailwindcss/nesting/index.js'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import prefixSelector from 'postcss-prefix-selector'
import failOnWarn from 'postcss-fail-on-warn'

export default {
  plugins: [
    postcssImport,
    tailwindcssNesting,
    tailwindcss,
    autoprefixer,
    prefixSelector({ prefix: '.use-tailwind' }),
    failOnWarn,
  ],
}
