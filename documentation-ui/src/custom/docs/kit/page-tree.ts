/**
 * Sidebar overrides produced alongside converted documentation:
 *
 * - `titles` — page URL (no trailing slash) -> sidebar label, so the nav can
 *   read e.g. "Introduction" while the page keeps its H1 ("SDK v6.0.2").
 * - `nesting` — parent page URL -> child page URLs. Sphinx nests a page's own
 *   toctree children beneath it while their URLs stay flat; Fumadocs can only
 *   nest via real folders, so the tree is re-parented instead of the files.
 */
export interface DocsNavOverrides {
  titles?: Record<string, string>
  nesting?: Record<string, string[]>
  tree?: DocsNavNode[]
}

export interface DocsNavNode {
  type: 'page' | 'folder' | 'separator' | 'reference'
  name?: string
  url?: string
  external?: boolean
  index?: DocsNavNode
  children?: DocsNavNode[]
}

type TreeNode = {
  type: string
  name?: unknown
  url?: string
  index?: TreeNode
  children?: TreeNode[]
}

const trimSlash = (url: string) => url.replace(/\/$/, '')

function applyNavTree(root: TreeNode, tree: DocsNavNode[]): void {
  const pages = new Map<string, TreeNode>()
  const folders = new Map<string, TreeNode>()
  const collect = (node: TreeNode): void => {
    if (node.type === 'page' && node.url) pages.set(trimSlash(node.url), node)
    if (node.index?.url) {
      folders.set(trimSlash(node.index.url), node)
      collect(node.index)
    }
    node.children?.forEach(collect)
  }
  collect(root)
  const resolve = (node: DocsNavNode, position: string): TreeNode => {
    if (node.type === 'reference' || (node.type === 'page' && !node.external)) {
      const url = trimSlash(node.url ?? '')
      const existing = node.type === 'reference' ? folders.get(url) ?? pages.get(url) : pages.get(url)
      if (!existing) throw new Error(`Sidebar page not found: ${url}`)
      return { ...existing, ...(node.name ? { name: node.name } : {}) }
    }
    return {
      ...node,
      ...(node.index ? { index: resolve(node.index, `${position}/index`) } : {}),
      ...(node.children ? { children: node.children.map((child, index) => resolve(child, `${position}/${index}`)) } : {}),
      $id: `docs-nav:${position}`,
    } as TreeNode
  }
  root.children = tree.map((node, index) => resolve(node, String(index)))
}

/** Re-parent each nesting entry's children under its parent page, turning that
 * page into a folder whose index is the page itself. URLs are untouched. */
function applyNavNesting(
  root: TreeNode,
  nesting: Record<string, string[]>,
  titles: Record<string, string>,
): void {
  if (Object.keys(nesting).length === 0) return

  // Every page node, with the array holding it so it can be moved later.
  const found = new Map<string, { node: TreeNode; siblings: TreeNode[] }>()
  const collect = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'page' && typeof node.url === 'string') {
        found.set(trimSlash(node.url), { node, siblings: nodes })
      }
      if (node.children) collect(node.children)
    }
  }
  collect(root.children ?? [])

  // Promote parents first, in place, so a parent that is itself someone's child
  // (lambeq: training -> manual-training -> tutorials/*) moves with its subtree.
  for (const parentUrl of Object.keys(nesting)) {
    const entry = found.get(parentUrl)
    if (!entry || entry.node.type !== 'page') continue
    const folder: TreeNode = {
      type: 'folder',
      name: titles[parentUrl] ?? entry.node.name,
      index: entry.node,
      children: [],
    }
    const at = entry.siblings.indexOf(entry.node)
    if (at >= 0) entry.siblings[at] = folder
    found.set(parentUrl, { node: folder, siblings: entry.siblings })
  }

  for (const [parentUrl, childUrls] of Object.entries(nesting)) {
    const parent = found.get(parentUrl)
    if (!parent || parent.node.type !== 'folder') continue
    for (const childUrl of childUrls) {
      const child = found.get(trimSlash(childUrl))
      if (!child || child.node === parent.node) continue
      const at = child.siblings.indexOf(child.node)
      if (at < 0) continue // already moved under another parent
      child.siblings.splice(at, 1)
      parent.node.children?.push(child.node)
      found.set(trimSlash(childUrl), {
        node: child.node,
        siblings: parent.node.children as TreeNode[],
      })
    }
  }
}

/** Structural subset of Fumadocs' `PageTreeTransformer`, deliberately free of
 * fumadocs types: a consumer's loader may resolve a different fumadocs-core
 * copy, and a typed transformer would then widen its inferred page data. */
export interface DocsNavTransformer {
  file<T extends { type: string; url?: string; name?: unknown }>(node: T): T
  root<T>(node: T): T
}

/** Page-tree transformer applying a module's sidebar labels and nesting; pass
 * it in a Fumadocs `loader({ pageTree: { transformers: [...] } })`. */
export function docsNavTransformer({
  titles = {},
  nesting = {},
  tree,
}: DocsNavOverrides): DocsNavTransformer {
  return {
    file(node) {
      if (node.type === 'page' && typeof node.url === 'string') {
        const name = titles[trimSlash(node.url)]
        if (name) node.name = name
      }
      return node
    },
    root(node) {
      if (tree) applyNavTree(node as unknown as TreeNode, tree)
      else applyNavNesting(node as unknown as TreeNode, nesting, titles)
      return node
    },
  }
}
