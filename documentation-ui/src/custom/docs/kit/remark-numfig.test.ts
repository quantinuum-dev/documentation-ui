import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { remarkMystTargets, XREF_EXPORT, type XrefTargets } from './remark-myst-targets'
import { numfigEnabled, remarkNumfig } from './remark-numfig'

interface TestNode {
  type: string
  children?: TestNode[]
  [key: string]: unknown
}

const el = (
  name: string,
  children: TestNode[] = [],
  attrs: Record<string, string> = {}
): TestNode => ({
  type: 'mdxJsxFlowElement',
  name,
  attributes: Object.entries(attrs).map(([n, value]) => ({
    type: 'mdxJsxAttribute',
    name: n,
    value,
  })),
  children,
})
const text = (value: string): TestNode => ({ type: 'text', value })
const figure = (caption: string | null, imgAttrs: Record<string, string> = {}) =>
  el('figure', [
    el('img', [], { src: '/a.png', ...imgAttrs }),
    ...(caption === null ? [] : [el('figcaption', [text(caption)])]),
  ])

describe('remarkNumfig', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'numfig-'))
    fs.mkdirSync(path.join(root, 'on', 'sub'), { recursive: true })
    fs.mkdirSync(path.join(root, 'off'))
    fs.writeFileSync(path.join(root, 'on', 'meta.json'), '{"numfig": true}')
    fs.writeFileSync(path.join(root, 'on', 'sub', 'meta.json'), '{"title": "Sub"}')
    fs.writeFileSync(path.join(root, 'off', 'meta.json'), '{"title": "Off"}')
  })
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  const run = (tree: object, page: string) => {
    const targets: XrefTargets = { labels: {}, ids: {} }
    const file = { path: path.join(root, page), data: { [XREF_EXPORT]: targets } }
    remarkNumfig()(tree as never, file)
    remarkMystTargets()(tree as never, file)
    return targets
  }

  it('is enabled by the nearest meta.json declaring numfig', () => {
    expect(numfigEnabled(path.join(root, 'on', 'sub', 'page.mdx'))).toBe(true)
    expect(numfigEnabled(path.join(root, 'off', 'page.mdx'))).toBe(false)
    expect(numfigEnabled(undefined)).toBe(false)
  })

  it('numbers captioned figures in order and names their ids and labels', () => {
    const labelled = { ...figure('Second.'), data: { mystLabels: ['fig-two'] } }
    const tree: TestNode & { children: TestNode[] } = {
      type: 'root',
      children: [figure('First.', { id: 'first' }), figure(null), labelled],
    }
    const targets = run(tree, 'on/sub/page.mdx')

    expect(tree.children[0].children?.[1].children).toEqual([
      { type: 'strong', children: [text('Fig. 1')] },
      text(' '),
      text('First.'),
    ])
    expect(tree.children[1].children).toHaveLength(1)
    expect(tree.children[2].children?.[1].children?.[0]).toEqual({
      type: 'strong',
      children: [text('Fig. 2')],
    })
    expect(targets.ids).toEqual({ first: 'Fig. 1' })
    expect(targets.labels).toEqual({ 'fig-two': { id: 'fig-two', title: 'Fig. 2' } })
  })

  it('leaves figures alone when numfig is off', () => {
    const tree = { type: 'root', children: [figure('Caption.', { id: 'x' })] }
    const before = structuredClone(tree)
    expect(run(tree, 'off/page.mdx').ids).toEqual({})
    expect(tree).toEqual(before)
  })
})
