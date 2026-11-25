import { describe, expect, it } from 'vitest'
import { createXrefResolver, resolveMarkdownXrefs, type XrefProject } from './xref'

const projects: XrefProject[] = [
  {
    key: 'inquanto',
    pages: [
      {
        url: '/inquanto/manual/ansatze/ucc_family',
        path: 'manual/ansatze/ucc_family.mdx',
        title: 'The UCC Family',
        headings: [{ id: 'unitary-coupled-cluster', title: 'Unitary Coupled Cluster' }],
        targets: {
          labels: { ucc: { id: 'unitary-coupled-cluster', title: 'Unitary Coupled Cluster' } },
          ids: {},
        },
      },
      {
        url: '/inquanto/manual/spaces',
        path: 'manual/spaces.mdx',
        title: 'Spaces',
        headings: [{ id: 'fermionic-spaces', title: 'Fermionic Spaces' }],
        targets: { labels: { spaces: { id: '', title: '' } }, ids: {} },
      },
      {
        url: '/inquanto/api/inquanto.operators',
        path: 'api/inquanto.operators.mdx',
        title: 'inquanto.operators',
        headings: [],
        targets: { labels: {}, ids: { 'inquanto.operators.FermionOperator': 'FermionOperator' } },
      },
    ],
  },
  {
    key: 'tket',
    pages: [
      {
        url: '/tket/api-docs/circuit',
        path: 'circuit.mdx',
        title: 'pytket.circuit',
        headings: [],
        targets: {
          labels: { install: { id: 'installing', title: 'Installing' } },
          ids: { 'pytket.circuit.Circuit': 'Circuit' },
        },
      },
    ],
  },
]

const resolver = createXrefResolver(projects)
const from = { project: 'inquanto', page: '/inquanto/manual/spaces' }

describe('createXrefResolver', () => {
  it('resolves a label in the same project, with its heading as text', () => {
    expect(resolver.resolve('#ucc', from)).toEqual({
      url: '/inquanto/manual/ansatze/ucc_family#unitary-coupled-cluster',
      text: 'Unitary Coupled Cluster',
    })
  })

  it('links a target on the current page with a bare anchor', () => {
    expect(resolver.resolve('#fermionic-spaces', from)).toEqual({
      url: '#fermionic-spaces',
      text: 'Fermionic Spaces',
    })
  })

  it('names a page label by the page title', () => {
    const elsewhere = { project: 'inquanto', page: '/inquanto/manual/ansatze/ucc_family' }
    expect(resolver.resolve('#spaces', elsewhere)).toEqual({
      url: '/inquanto/manual/spaces',
      text: 'Spaces',
    })
  })

  it('shows a Python object by its full name as code', () => {
    expect(resolver.resolve('#inquanto.operators.FermionOperator', from)).toEqual({
      url: '/inquanto/api/inquanto.operators#inquanto.operators.FermionOperator',
      text: 'inquanto.operators.FermionOperator',
      code: true,
    })
  })

  it('falls back to other projects for `#name`', () => {
    expect(resolver.resolve('#pytket.circuit.Circuit', from)?.url).toBe(
      '/tket/api-docs/circuit#pytket.circuit.Circuit'
    )
  })

  it('resolves relative page paths with anchors', () => {
    expect(resolver.resolve('./ansatze/ucc_family.mdx#ucc', from)?.url).toBe(
      '/inquanto/manual/ansatze/ucc_family#unitary-coupled-cluster'
    )
    expect(
      resolver.resolve('spaces.mdx', {
        project: 'inquanto',
        page: '/inquanto/manual/ansatze/ucc_family',
      })
    ).toBeNull()
    expect(
      resolver.resolve('../spaces.mdx', {
        project: 'inquanto',
        page: '/inquanto/manual/ansatze/ucc_family',
      })
    ).toEqual({
      url: '/inquanto/manual/spaces',
      text: 'Spaces',
    })
  })

  it('resolves inv: links by project, type and wildcard', () => {
    expect(resolver.resolve('inv:tket:std:label#install', from)?.url).toBe(
      '/tket/api-docs/circuit#installing'
    )
    expect(resolver.resolve('inv:tket:py:class#pytket.circuit.Circuit', from)?.text).toBe(
      'pytket.circuit.Circuit'
    )
    expect(resolver.resolve('inv:#*.Circuit', from)?.url).toBe(
      '/tket/api-docs/circuit#pytket.circuit.Circuit'
    )
    expect(resolver.resolve('inv:inquanto:std:doc#manual/spaces', from)).toEqual({
      url: '#',
      text: 'Spaces',
    })
    expect(resolver.resolve('inv:nope#x', from)).toBeNull()
  })

  it("maps a project's own inv: keys to site projects", () => {
    const mapped = createXrefResolver([
      { ...projects[0], inventories: { pytket: 'tket', 'pytket-circ': 'tket/circuit' } },
      projects[1],
    ])
    expect(mapped.resolve('inv:pytket#install', from)?.url).toBe(
      '/tket/api-docs/circuit#installing'
    )
    expect(mapped.resolve('inv:pytket-circ:std:doc#index', from)).toEqual({
      url: '/tket/api-docs/circuit',
      text: 'pytket.circuit',
    })
  })

  it('finds the project from the page URL when no key is given', () => {
    expect(resolver.resolve('#ucc', { page: '/inquanto/manual/spaces/' })?.url).toBe(
      '/inquanto/manual/ansatze/ucc_family#unitary-coupled-cluster'
    )
  })

  it('leaves external and absolute links alone', () => {
    expect(resolver.resolve('https://example.com', from)).toBeUndefined()
    expect(resolver.resolve('/inquanto/manual/spaces', from)).toBeUndefined()
    expect(resolver.resolve('#unknown-target', from)).toBeNull()
  })
})

describe('resolveMarkdownXrefs', () => {
  it('rewrites links and fills empty text outside code fences', () => {
    const md = [
      'See [](#ucc) and [the class](#inquanto.operators.FermionOperator).',
      '```',
      '[](#ucc)',
      '```',
    ].join('\n')
    expect(resolveMarkdownXrefs(md, resolver, from)).toBe(
      [
        'See [Unitary Coupled Cluster](/inquanto/manual/ansatze/ucc_family#unitary-coupled-cluster) and [the class](/inquanto/api/inquanto.operators#inquanto.operators.FermionOperator).',
        '```',
        '[](#ucc)',
        '```',
      ].join('\n')
    )
  })
})
