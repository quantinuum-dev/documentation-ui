import fs from 'node:fs'
import path from 'node:path'

import { XREF_EXPORT, type XrefTargets } from './remark-myst-targets'

interface MdNode {
  type: string
  name?: string | null
  value?: string
  attributes?: { type: string; name?: string; value?: unknown }[]
  children?: MdNode[]
  data?: { numfig?: string }
}

interface NumfigFile {
  path?: string
  data: Record<string, unknown>
}

function isElement(node: MdNode, name: string): boolean {
  return (
    (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.name === name
  )
}

/**
 * Whether figures on the page at `filePath` are numbered: the nearest `meta.json`
 * with a boolean `numfig` (Sphinx's setting of that name), walking up from the
 * page, decides. Off when none declares it.
 */
export function numfigEnabled(filePath: string | undefined): boolean {
  if (!filePath) return false
  let dir = path.dirname(path.resolve(filePath))
  for (;;) {
    const metaFile = path.join(dir, 'meta.json')
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as { numfig?: unknown }
      if (typeof meta.numfig === 'boolean') return meta.numfig
    }
    const parent = path.dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

function ids(node: MdNode): string[] {
  const own = node.attributes?.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'id')?.value
  return [...(typeof own === 'string' ? [own] : []), ...(node.children ?? []).flatMap(ids)]
}

function prefixCaption(caption: MdNode, label: string) {
  const first = caption.children?.[0]
  const host = first?.type === 'paragraph' ? first : caption
  host.children = [
    { type: 'strong', children: [{ type: 'text', value: label }] },
    { type: 'text', value: ' ' },
    ...(host.children ?? []),
  ]
}

/**
 * Number each captioned `<figure>` on the page (`Fig. 1`, `Fig. 2`, …, in
 * document order, as Sphinx's `numfig`), prefixing its caption. A figure's ids
 * (on the figure or its image) and `(label)=` labels become cross-reference
 * targets named by that number, so `[](#label)` reads "Fig. 2". Must run after
 * remarkMystLabels and before remarkMystTargets.
 */
export function remarkNumfig() {
  return (tree: MdNode, file: NumfigFile) => {
    if (!numfigEnabled(file.path)) return
    const targets = file.data[XREF_EXPORT] as XrefTargets | undefined
    let count = 0
    const visit = (node: MdNode) => {
      if (isElement(node, 'figure')) {
        const caption = node.children?.find((child) => isElement(child, 'figcaption'))
        if (!caption) return
        count += 1
        const label = `Fig. ${count}`
        prefixCaption(caption, label)
        node.data = { ...node.data, numfig: label }
        if (targets) for (const id of ids(node)) targets.ids[id] ??= label
        return
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}
