import postcssImport from 'postcss-import'
import tailwindcssNesting from 'tailwindcss/nesting/index.js'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import prefixSelector from 'postcss-prefix-selector'
import failOnWarn from 'postcss-fail-on-warn'

const tailwindScopeSelector = '.use-tailwind'

function scopeTailwindSelector(prefix, selector, prefixedSelector) {
  if (selector === '*') {
    return `${prefix}, ${prefixedSelector}`
  }

  if (selector.startsWith('::')) {
    return `${prefix}${selector}, ${prefixedSelector}`
  }

  if (selector.startsWith('.')) {
    return `${prefixedSelector}, ${prefix}${selector}`
  }

  return prefixedSelector
}

export default {
  plugins: [
    postcssImport,
    tailwindcssNesting,
    tailwindcss,
    autoprefixer,
    prefixSelector({
      prefix: tailwindScopeSelector,
      transform: scopeTailwindSelector,
    }),
    failOnWarn,
  ],
}
