import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import postcssFailOnWarn from 'postcss-fail-on-warn'

export default {
  plugins: [
    tailwindcss,
    autoprefixer,
    postcssFailOnWarn,
  ],
};
