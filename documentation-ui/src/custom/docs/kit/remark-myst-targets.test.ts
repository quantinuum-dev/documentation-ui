import { describe, expect, it } from 'vitest'
import {
  remarkMystLabels,
  remarkMystTargets,
  XREF_EXPORT,
  type XrefTargets,
} from './remark-myst-targets'

type Node = Record<string, unknown> & { type: string; children?: Node[] }

const text = (value: string): Node => ({ type: 'text', value })
const para = (value: string): Node => ({ type: 'paragraph', children: [text(value)] })
const heading = (value: string, id?: string): Node => ({
  type: 'heading',
  depth: 2,
  children: [text(value)],
  data: id ? { hProperties: { id } } : undefined,
})

// Stand-in for Fumadocs' remarkHeading: strip a `[#id]` suffix, else slug the text.
function fakeRemarkHeading(tree: Node) {
  for (const node of tree.children ?? []) {
    if (node.type !== 'heading') continue
    const last = node.children?.[node.children.length - 1] as unknown as { value: string }
    const match = /\s*\[#([^]+?)]\s*$/.exec(last.value)
    const id = match ? match[1] : last.value.toLowerCase().replace(/\s+/g, '-')
    if (match) last.value = last.value.slice(0, match.index)
    node.data = { ...(node.data as object), hProperties: { id } }
  }
}

function run(children: Node[]) {
  const tree: Node = { type: 'root', children }
  const file = { data: {} as Record<string, unknown> }
  remarkMystLabels()(tree as never, file)
  fakeRemarkHeading(tree)
  remarkMystTargets()(tree as never, file)
  return { tree, targets: file.data[XREF_EXPORT] as XrefTargets }
}

describe('MyST targets', () => {
  it('names the following heading and removes the label line', () => {
    const { tree, targets } = run([
      para('Intro.'),
      para('(ucc)='),
      heading('Unitary Coupled Cluster'),
    ])
    expect(targets.labels).toEqual({
      ucc: { id: 'unitary-coupled-cluster', title: 'Unitary Coupled Cluster' },
    })
    expect(tree.children?.map((c) => c.type)).toEqual(['paragraph', 'heading'])
  })

  it('treats labels opening the document as naming the page', () => {
    const { targets } = run([para('(intro)='), para('Hello.')])
    expect(targets.labels.intro).toEqual({ id: '', title: '' })
  })

  it('accepts labels containing spaces, as Sphinx does', () => {
    const { targets } = run([para('Intro.'), para('(two words)='), heading('Two')])
    expect(targets.labels['two words']).toEqual({ id: 'two', title: 'Two' })
  })

  it('gives a labelled non-heading element the label as its id', () => {
    const { tree, targets } = run([para('Intro.'), para('(my-para)='), para('Labelled.')])
    expect(targets.labels['my-para']).toEqual({ id: 'my-para', title: '' })
    expect(tree.children?.[1]).toMatchObject({ data: { hProperties: { id: 'my-para' } } })
  })

  it('records explicit heading ids but not implicit slugs', () => {
    const { targets } = run([para('Intro.'), heading('run [#pkg.Thing.run]'), heading('Plain')])
    expect(targets.ids).toEqual({ 'pkg.Thing.run': 'run' })
  })

  it('keeps a trailing label that names nothing', () => {
    const { tree } = run([para('Intro.'), para('(dangling)=')])
    expect(tree.children?.[tree.children.length - 1]).toEqual(para('(dangling)='))
  })
})
