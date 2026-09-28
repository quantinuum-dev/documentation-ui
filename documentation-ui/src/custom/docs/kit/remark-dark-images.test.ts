import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DARK_IMAGE_CLASS, LIGHT_IMAGE_CLASS, remarkDarkImages } from './remark-dark-images'

describe('remarkDarkImages', () => {
  let publicDir: string

  beforeEach(() => {
    publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dark-images-'))
    fs.mkdirSync(path.join(publicDir, 'm-assets'))
    for (const name of ['a.png', 'a.dark.png', 'b.png', 'with space.png', 'with space.dark.png']) {
      fs.writeFileSync(path.join(publicDir, 'm-assets', name), '')
    }
  })
  afterEach(() => fs.rmSync(publicDir, { recursive: true, force: true }))

  const jsxImg = (src: string) => ({
    type: 'mdxJsxFlowElement',
    name: 'img',
    attributes: [
      { type: 'mdxJsxAttribute', name: 'src', value: src },
      { type: 'mdxJsxAttribute', name: 'alt', value: 'Diagram' },
    ],
    children: [],
  })
  const span = (className: string, child: unknown, type = 'mdxJsxFlowElement') => ({
    type,
    name: 'span',
    attributes: [{ type: 'mdxJsxAttribute', name: 'className', value: className }],
    children: [child],
  })
  const run = (tree: object) => {
    remarkDarkImages({ publicDir })(tree as never)
    return tree
  }

  it('pairs a JSX img with its dark sibling', () => {
    const tree = run({ type: 'root', children: [jsxImg('/m-assets/a.png')] })
    expect(tree).toEqual({
      type: 'root',
      children: [
        span(LIGHT_IMAGE_CLASS, jsxImg('/m-assets/a.png')),
        span(DARK_IMAGE_CLASS, jsxImg('/m-assets/a.dark.png')),
      ],
    })
  })

  it('pairs a nested markdown image, including URL-encoded paths', () => {
    const image = { type: 'image', url: '/m-assets/with%20space.png', alt: 'x' }
    const tree = run({ type: 'root', children: [{ type: 'paragraph', children: [image] }] })
    expect(tree).toEqual({
      type: 'root',
      children: [{
        type: 'paragraph',
        children: [
          span(LIGHT_IMAGE_CLASS, image, 'mdxJsxTextElement'),
          span(DARK_IMAGE_CLASS, { ...image, url: '/m-assets/with%20space.dark.png' }, 'mdxJsxTextElement'),
        ],
      }],
    })
  })

  it('leaves images without a dark sibling, relative and external images alone', () => {
    const children = [
      jsxImg('/m-assets/b.png'),
      jsxImg('m-assets/a.png'),
      jsxImg('https://example.com/a.png'),
      jsxImg('/m-assets/a.dark.png'),
      jsxImg('/../a.png'),
    ]
    const tree = run({ type: 'root', children: structuredClone(children) })
    expect(tree).toEqual({ type: 'root', children })
  })
})
