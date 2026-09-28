import fs from 'node:fs'
import path from 'node:path'

interface MdNode {
  type: string
  children?: MdNode[]
  url?: string
  name?: string | null
  attributes?: { type: string; name?: string; value?: unknown }[]
}

export const LIGHT_IMAGE_CLASS = 'quantinuum-light-only'
export const DARK_IMAGE_CLASS = 'quantinuum-dark-only'

/** Root-absolute `src` of the `<name>.dark<ext>` sibling, if it exists under `publicDir`. */
function darkVariant(src: string, publicDir: string): string | null {
  if (!src.startsWith('/') || src.startsWith('//')) return null
  const clean = src.split(/[?#]/)[0]
  const ext = path.extname(clean)
  if (!ext || clean.endsWith(`.dark${ext}`)) return null
  const darkSrc = `${clean.slice(0, -ext.length)}.dark${ext}`
  let file: string
  try {
    file = path.join(publicDir, decodeURI(darkSrc))
  } catch {
    return null
  }
  if (!file.startsWith(publicDir + path.sep)) return null
  return fs.existsSync(file) ? darkSrc : null
}

function wrap(node: MdNode, className: string): MdNode {
  return {
    type: node.type === 'mdxJsxFlowElement' ? 'mdxJsxFlowElement' : 'mdxJsxTextElement',
    name: 'span',
    attributes: [{ type: 'mdxJsxAttribute', name: 'className', value: className }],
    children: [node],
  }
}

/**
 * Pair each root-absolute image that has a `<name>.dark<ext>` sibling in
 * `publicDir` with that variant, wrapped in theme-scoped spans that
 * `docs-theme.css` shows/hides. Must run before Fumadocs' remarkImage, which
 * drops any class on the image itself.
 */
export function remarkDarkImages({ publicDir = path.join(process.cwd(), 'public') } = {}) {
  const root = path.resolve(publicDir)

  function themedPair(node: MdNode): MdNode[] | null {
    let src: unknown
    if (node.type === 'image') {
      src = node.url
    } else if ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.name === 'img') {
      src = node.attributes?.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'src')?.value
    }
    if (typeof src !== 'string') return null
    const darkSrc = darkVariant(src, root)
    if (!darkSrc) return null

    const dark = structuredClone(node)
    if (dark.type === 'image') {
      dark.url = darkSrc
    } else {
      for (const attr of dark.attributes ?? []) {
        if (attr.type === 'mdxJsxAttribute' && attr.name === 'src') attr.value = darkSrc
      }
    }
    return [wrap(node, LIGHT_IMAGE_CLASS), wrap(dark, DARK_IMAGE_CLASS)]
  }

  function walk(parent: MdNode) {
    const children = parent.children
    if (!children) return
    for (let i = 0; i < children.length; i++) {
      const pair = themedPair(children[i])
      if (pair) {
        children.splice(i, 1, ...pair)
        i += 1
      } else {
        walk(children[i])
      }
    }
  }

  return (tree: MdNode) => {
    walk(tree)
  }
}
