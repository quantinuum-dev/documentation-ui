import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins'
import type { RehypeCodeOptions } from 'fumadocs-core/mdx-plugins'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import type { PluggableList } from 'unified'

import { quantinuumDark, quantinuumLight } from './shiki-theme'

export { quantinuumDark, quantinuumLight } from './shiki-theme'
export type { ShikiTheme } from './shiki-theme'

/**
 * Shiki/rehype options for converted documentation: the brand Shiki themes plus
 * the tolerance shims the RST/MyST conversion needs.
 */
export const docsRehypeCodeOptions: RehypeCodeOptions = {
  ...rehypeCodeDefaultOptions,
  // Brand-aligned Shiki themes (Quantinuum 2026 palette): vivid tokens on a
  // soft grey card (light) / light tones on a dark card (dark).
  themes: { light: quantinuumLight, dark: quantinuumDark },
  // Unknown code-fence languages from converted RST (e.g. `dmesg`, `console`)
  // fall back to plaintext instead of crashing Shiki.
  fallbackLanguage: 'text',
  // Tolerate leftover MyST/RST fence "languages" from conversion so Shiki
  // doesn't crash on unknown/directive identifiers.
  langAlias: {
    ...rehypeCodeDefaultOptions.langAlias,
    'eval-rst': 'plaintext',
    '{eval-rst}': 'plaintext',
    '{toctree}': 'plaintext',
    '{note}': 'plaintext',
    '{warning}': 'plaintext',
    '{code-cell}': 'plaintext',
    '{code}': 'plaintext',
    // Shell grammars fail to lazy-load under the custom-theme highlighter and
    // hard-crash the build (fallbackLanguage only covers *unknown* langs), so
    // render them as plaintext for now.
    bash: 'plaintext',
    sh: 'plaintext',
    shell: 'plaintext',
    zsh: 'plaintext',
    console: 'plaintext',
    shellsession: 'plaintext',
    'shell-session': 'plaintext',
    dmesg: 'plaintext',
  },
}

/**
 * MDX pipeline shared by every consumer's `source.config.ts`, so the central
 * site and a module's standalone preview compile the same MDX identically.
 * `$...$` / `$$...$$` math from converted RST and notebooks renders via KaTeX
 * (the host must also import `katex/dist/katex.min.css`).
 */
export interface DocsMdxOptions {
  remarkPlugins: PluggableList
  rehypePlugins: (plugins: PluggableList) => PluggableList
  rehypeCodeOptions: RehypeCodeOptions
}

export const docsMdxOptions: DocsMdxOptions = {
  remarkPlugins: [remarkMath],
  rehypePlugins: (plugins) => [rehypeKatex, ...plugins],
  rehypeCodeOptions: docsRehypeCodeOptions,
}
