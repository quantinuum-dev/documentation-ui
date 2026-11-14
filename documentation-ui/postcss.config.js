import tailwindcss from '@tailwindcss/postcss'
import postcssFailOnWarn from 'postcss-fail-on-warn'

export default {
  plugins: [
    tailwindcss,
    postcssFailOnWarn,
  ],
};
