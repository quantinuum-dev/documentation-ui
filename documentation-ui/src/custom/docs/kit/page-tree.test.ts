import { describe, expect, it } from 'vitest'
import { docsNavTransformer, type DocsNavNode } from './page-tree'

describe('source-independent sidebar navigation', () => {
  it('nests stable page URLs and preserves API groups, labels, and external links', () => {
    const api = { type: 'folder', name: 'API', index: { type: 'page', name: 'API', url: '/docs/api' }, children: [{ type: 'page', name: 'Client', url: '/docs/api/client' }] }
    const root = { children: [
      { type: 'page', name: 'Start', url: '/docs/start' },
      { type: 'folder', name: 'Examples', children: [{ type: 'page', name: 'First', url: '/docs/examples/first/' }] },
      api,
    ] }
    const tree: DocsNavNode[] = [
      { type: 'separator', name: 'Guides' },
      { type: 'folder', name: 'Start', index: { type: 'page', url: '/docs/start' }, children: [
        { type: 'page', name: 'First steps', url: '/docs/examples/first' },
        { type: 'page', name: 'Website', url: 'https://example.com/', external: true },
      ] },
      { type: 'reference', url: '/docs/api' },
    ]
    docsNavTransformer({ tree }).root(root)
    expect(root.children).toHaveLength(3)
    expect(root.children[1]).toMatchObject({
      type: 'folder', index: { url: '/docs/start' }, children: [
        { type: 'page', name: 'First steps', url: '/docs/examples/first/' },
        { type: 'page', external: true, url: 'https://example.com/' },
      ],
    })
    expect(root.children[2]).toEqual(api)
  })

  it('fails on missing internal pages instead of silently losing navigation', () => {
    expect(() => docsNavTransformer({ tree: [{ type: 'page', url: '/missing' }] }).root({ children: [] }))
      .toThrow('Sidebar page not found: /missing')
  })

  it('retains the existing RST nesting behavior when no explicit tree is supplied', () => {
    const root = { children: [
      { type: 'page', name: 'Parent', url: '/parent' },
      { type: 'page', name: 'Child', url: '/child' },
    ] }
    docsNavTransformer({ nesting: { '/parent': ['/child'] } }).root(root)
    expect(root.children).toEqual([{
      type: 'folder', name: 'Parent', index: { type: 'page', name: 'Parent', url: '/parent' },
      children: [{ type: 'page', name: 'Child', url: '/child' }],
    }])
  })
})