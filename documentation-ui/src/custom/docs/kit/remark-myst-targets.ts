interface MdAttribute {
  type: string
  name?: string
  value?: unknown
}

interface MdNode {
  type: string
  value?: string
  depth?: number
  name?: string | null
  attributes?: MdAttribute[]
  children?: MdNode[]
  data?: {
    hProperties?: Record<string, unknown>
    mystLabels?: string[]
    mystExplicitId?: boolean
  }
}

/** Name under which each page's cross-reference targets are exported (`page.data._exports.xref`). */
export const XREF_EXPORT = 'xref'

/** A page's MyST cross-reference targets, as resolved by `createXrefResolver`. */
export interface XrefTargets {
  /** `(label)=` labels -> the id of the element they name (`''` for the page itself). */
  labels: Record<string, { id: string; title: string }>
  /** Explicit `[#id]` heading ids -> heading text. */
  ids: Record<string, string>
}

interface XrefFile {
  data: Record<string, unknown>
}

const LABEL = /^\(([^()\s][^()]*)\)=$/
// Fumadocs' custom heading id syntax (fumadocs-core's headingIdRegex).
const HEADING_ID = /\s*\[#([^]+?)]\s*$/

function flatten(node: MdNode): string {
  if (node.children) return node.children.map(flatten).join('')
  return typeof node.value === 'string' ? node.value : ''
}

function labelOf(node: MdNode): string | null {
  if (node.type !== 'paragraph' || node.children?.length !== 1) return null
  const [only] = node.children
  return only.type === 'text' ? (LABEL.exec(only.value?.trim() ?? '')?.[1] ?? null) : null
}

function isContent(node: MdNode): boolean {
  return !['mdxjsEsm', 'yaml', 'toml', 'mdxFlowExpression'].includes(node.type)
}

/**
 * Lift MyST `(label)=` target lines onto the element that follows them (or onto
 * the page itself when they open the document) and note which headings carry an
 * explicit `[#id]`. Must run before Fumadocs' remarkHeading, which strips `[#id]`.
 */
export function remarkMystLabels() {
  return (tree: MdNode, file: XrefFile) => {
    const targets: XrefTargets = { labels: {}, ids: {} }
    // Exported by reference, so remarkMystTargets can still fill it in afterwards.
    file.data[XREF_EXPORT] = targets

    const walk = (parent: MdNode, isRoot: boolean) => {
      const children = parent.children
      if (!children) return
      let pending: string[] = []
      let seenContent = false
      const kept: MdNode[] = []
      for (const child of children) {
        const label = labelOf(child)
        if (label) {
          pending.push(label)
          continue
        }
        if (pending.length > 0) {
          if (isRoot && !seenContent) {
            for (const name of pending) targets.labels[name] = { id: '', title: '' }
          } else {
            child.data = { ...child.data, mystLabels: pending }
          }
          pending = []
        }
        if (child.type === 'heading') {
          const last = child.children?.[child.children.length - 1]
          if (last?.type === 'text' && HEADING_ID.test(last.value ?? '')) {
            child.data = { ...child.data, mystExplicitId: true }
          }
        }
        if (isContent(child)) seenContent = true
        walk(child, false)
        kept.push(child)
      }
      // A trailing label has nothing to name; keep it visible rather than drop it silently.
      for (const name of pending)
        kept.push({ type: 'paragraph', children: [{ type: 'text', value: `(${name})=` }] })
      parent.children = kept
    }
    walk(tree, true)
  }
}

/**
 * Record the targets remarkMystLabels found, now that Fumadocs' remarkHeading has
 * given every heading its id. Labelled non-heading elements get the label as id.
 */
export function remarkMystTargets() {
  return (tree: MdNode, file: XrefFile) => {
    const targets = file.data[XREF_EXPORT] as XrefTargets | undefined
    if (!targets) return

    const visit = (node: MdNode) => {
      const labels = node.data?.mystLabels
      const isHeading = node.type === 'heading'
      const headingId = isHeading ? node.data?.hProperties?.id : undefined
      if (typeof headingId === 'string' && node.data?.mystExplicitId) {
        targets.ids[headingId] = flatten(node)
      }
      if (labels) {
        let id = typeof headingId === 'string' ? headingId : elementId(node)
        if (!id) {
          id = labels[0]
          setElementId(node, id)
        }
        const title = isHeading ? flatten(node) : ''
        for (const name of labels) targets.labels[name] = { id, title }
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

function elementId(node: MdNode): string | undefined {
  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    const attr = node.attributes?.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'id')
    return typeof attr?.value === 'string' ? attr.value : undefined
  }
  const id = node.data?.hProperties?.id
  return typeof id === 'string' ? id : undefined
}

function setElementId(node: MdNode, id: string) {
  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    node.attributes = [
      ...(node.attributes ?? []),
      { type: 'mdxJsxAttribute', name: 'id', value: id },
    ]
  } else {
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } }
  }
}
