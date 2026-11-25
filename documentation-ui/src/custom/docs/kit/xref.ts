import { XREF_EXPORT, type XrefTargets } from './remark-myst-targets'

/** One page of a docs project, as the resolver needs it. */
export interface XrefPage {
  /** Served URL, without a trailing slash. */
  url: string
  /** Source path within the collection, e.g. `manual/spaces.mdx`. */
  path: string
  title: string
  /** Headings on the page (implicit and explicit ids). */
  headings: { id: string; title: string }[]
  targets?: XrefTargets
}

/** A docs project: one Fumadocs source, named by `key` in `inv:` links. */
export interface XrefProject {
  key: string
  pages: XrefPage[]
  /**
   * This project's own `inv:` keys (its Sphinx `intersphinx_mapping` names) ->
   * the project they mean, optionally with a page path prefix for `doc` lookups:
   * `{ pytket: 'tket-api', 'pytket-qiskit': 'tket-api/pytket-qiskit' }`.
   */
  inventories?: Record<string, string>
}

export interface ResolvedXref {
  url: string
  /** Implicit link text, used when the link has none. */
  text?: string
  /** Render the implicit text as code (a Python object name). */
  code?: boolean
}

/** Where a link appears: the page URL, and its project key (found from the URL if omitted). */
export interface XrefOrigin {
  project?: string
  page: string
}

interface Target {
  page: XrefPage
  id: string
  title: string
  name: string
}

interface ProjectIndex {
  key: string
  inventories: Record<string, string>
  byUrl: Map<string, XrefPage>
  byPath: Map<string, XrefPage>
  /** Explicit targets: `(label)=` labels and `[#id]` heading ids. */
  explicit: Map<string, Target>
  explicitLower: Map<string, Target>
}

const DOC_EXT = /\.(mdx?|ipynb|rst)$/i

function stripExt(p: string): string {
  return p
    .replace(DOC_EXT, '')
    .replace(/\/index$/, '')
    .replace(/^index$/, '')
}

function buildIndex(project: XrefProject): ProjectIndex {
  const index: ProjectIndex = {
    key: project.key,
    inventories: project.inventories ?? {},
    byUrl: new Map(),
    byPath: new Map(),
    explicit: new Map(),
    explicitLower: new Map(),
  }
  const add = (name: string, target: Target) => {
    if (!index.explicit.has(name)) index.explicit.set(name, target)
    const lower = name.toLowerCase()
    if (!index.explicitLower.has(lower)) index.explicitLower.set(lower, target)
  }
  for (const page of project.pages) {
    index.byUrl.set(page.url, page)
    index.byPath.set(stripExt(page.path), page)
    for (const [name, { id, title }] of Object.entries(page.targets?.labels ?? {})) {
      add(name, { page, id, title, name })
    }
  }
  // Labels win over a heading id of the same name (e.g. an API index section).
  for (const page of project.pages) {
    for (const [id, title] of Object.entries(page.targets?.ids ?? {})) {
      add(id, { page, id, title, name: id })
    }
  }
  return index
}

/** A dotted name whose heading (or page title) shows its last segment(s) names a Python object. */
function isObject(target: Target): boolean {
  const shown = target.title || (target.id ? '' : target.page.title)
  return /^[\w.]+\.\w+$/.test(target.name) && shown !== '' && target.name.endsWith(shown)
}

function wildcard(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

/**
 * Resolve MyST-style cross-references in Markdown links, against the pages of
 * one or more Fumadocs sources:
 *
 * - `#name`: a target on the same page, then an explicit target (a `(label)=`
 *   label or `[#id]` heading id) in the same project, then in any project;
 * - `./other.mdx#anchor`: a page by its path relative to the current page;
 * - `inv:key:domain:type#name`: an explicit target (or with type `doc`, a page
 *   path) in the project `key`; any part may be `*` or omitted.
 *
 * Returns `undefined` for links that aren't cross-references (external URLs,
 * absolute paths) and `null` for cross-references that don't resolve.
 */
export function createXrefResolver(projects: XrefProject[] | (() => XrefProject[])) {
  let indexes: ProjectIndex[] | undefined
  const getIndexes = () => {
    indexes ??= (typeof projects === 'function' ? projects() : projects).map(buildIndex)
    return indexes
  }

  const ownIndex = (from: XrefOrigin): ProjectIndex | undefined =>
    from.project
      ? getIndexes().find((i) => i.key === from.project)
      : getIndexes().find((i) => i.byUrl.has(from.page))

  const link = (target: Target, from: XrefOrigin): ResolvedXref => {
    const base = target.page.url === from.page ? '' : target.page.url
    const url = target.id ? `${base}#${target.id}` : base || '#'
    if (isObject(target)) return { url, text: target.name, code: true }
    return { url, text: target.title || target.page.title }
  }

  const pageLink = (page: XrefPage, anchor: string, from: XrefOrigin): ResolvedXref => {
    const target = anchor ? findOnPage(page, anchor) : undefined
    if (target) return link(target, from)
    const base = page.url === from.page ? '' : page.url
    return { url: anchor ? `${base}#${anchor}` : base || '#', text: page.title }
  }

  const findOnPage = (page: XrefPage, name: string): Target | undefined => {
    const label = page.targets?.labels[name]
    if (label) return { page, id: label.id, title: label.title, name }
    const title = page.targets?.ids[name]
    if (title !== undefined) return { page, id: name, title, name }
    const heading = page.headings.find((h) => h.id === name)
    if (heading) return { page, id: name, title: heading.title, name }
    return undefined
  }

  const findExplicit = (indexes: ProjectIndex[], name: string): Target | undefined => {
    for (const index of indexes) {
      const hit = index.explicit.get(name)
      if (hit) return hit
    }
    const lower = name.toLowerCase()
    for (const index of indexes) {
      const hit = index.explicitLower.get(lower)
      if (hit) return hit
    }
    return undefined
  }

  const resolveHash = (name: string, from: XrefOrigin): ResolvedXref | null => {
    const all = getIndexes()
    const own = ownIndex(from)
    const page = own?.byUrl.get(from.page)
    const target =
      (page && findOnPage(page, name)) ??
      (own && findExplicit([own], name)) ??
      findExplicit(
        all.filter((i) => i !== own),
        name
      )
    return target ? link(target, from) : null
  }

  const resolvePath = (href: string, from: XrefOrigin): ResolvedXref | null => {
    const own = ownIndex(from)
    const page = own?.byUrl.get(from.page)
    if (!own || !page) return null
    const [rel, anchor = ''] = href.split('#')
    const dir = page.path.split('/').slice(0, -1)
    for (const part of rel.split('/')) {
      if (part === '..') dir.pop()
      else if (part !== '.' && part !== '') dir.push(part)
    }
    const target = own.byPath.get(stripExt(dir.join('/')))
    return target ? pageLink(target, decodeURIComponent(anchor), from) : null
  }

  const resolveInv = (href: string, from: XrefOrigin): ResolvedXref | null => {
    const [spec, name = ''] = href.slice('inv:'.length).split('#')
    const [key = '', , type = ''] = spec.split(':')
    const mapped = key && key !== '*' ? ownIndex(from)?.inventories[key] : undefined
    const [projectKey = key, ...prefix] = (mapped ?? key).split('/')
    const keys = projectKey && projectKey !== '*' ? wildcard(projectKey) : null
    const candidates = getIndexes().filter((i) => !keys || keys.test(i.key))
    const decoded = decodeURIComponent(name)
    if (type === 'doc') {
      const doc = stripExt([...prefix, decoded].join('/'))
      for (const index of candidates) {
        const page = index.byPath.get(doc)
        if (page) return pageLink(page, '', from)
      }
      return null
    }
    if (decoded.includes('*')) {
      const re = wildcard(decoded)
      for (const index of candidates) {
        for (const [n, target] of index.explicit) if (re.test(n)) return link(target, from)
      }
      return null
    }
    const target = findExplicit(candidates, decoded)
    return target ? link(target, from) : null
  }

  return {
    resolve(href: string, origin: XrefOrigin): ResolvedXref | null | undefined {
      const from = { ...origin, page: origin.page.replace(/(.)\/$/, '$1') }
      if (href.startsWith('#'))
        return href.length > 1 ? resolveHash(decodeURIComponent(href.slice(1)), from) : undefined
      if (href.startsWith('inv:')) return resolveInv(href, from)
      if (/^[a-z][\w+.-]*:/i.test(href) || href.startsWith('/')) return undefined
      if (DOC_EXT.test(href.split('#')[0])) return resolvePath(href, from)
      return undefined
    },
  }
}

export type XrefResolver = ReturnType<typeof createXrefResolver>

interface FumadocsPageLike {
  url: string
  path: string
  data: {
    title?: string
    toc?: { url: string; title?: unknown }[]
    _exports?: Record<string, unknown>
  }
}

/** Build an `XrefProject` from a Fumadocs source (`loader()` output). */
export function xrefProject(
  key: string,
  source: { getPages(): FumadocsPageLike[] },
  inventories?: Record<string, string>
): XrefProject {
  return {
    key,
    inventories,
    pages: source.getPages().map((page) => ({
      url: page.url.replace(/\/$/, ''),
      path: page.path,
      title: page.data.title ?? '',
      headings: (page.data.toc ?? []).map((item) => ({
        id: item.url.replace(/^#/, ''),
        title: typeof item.title === 'string' ? item.title : '',
      })),
      targets: page.data._exports?.[XREF_EXPORT] as XrefTargets | undefined,
    })),
  }
}

/**
 * Resolve the cross-references in Markdown text (e.g. a page's processed
 * Markdown for AI agents), filling empty link text. Fenced code is untouched.
 */
export function resolveMarkdownXrefs(
  markdown: string,
  resolver: XrefResolver,
  from: XrefOrigin
): string {
  let fence: string | undefined
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
      if (marker && (!fence || marker.startsWith(fence))) {
        fence = fence ? undefined : marker
        return line
      }
      if (fence) return line
      return line.replace(
        /(?<!!)\[([^\]]*)\]\(([^)\s]+)\)/g,
        (full, text: string, href: string) => {
          const resolved = resolver.resolve(href, from)
          if (!resolved) return full
          const label = text || (resolved.code ? `\`${resolved.text}\`` : (resolved.text ?? href))
          return `[${label}](${resolved.url})`
        }
      )
    })
    .join('\n')
}
