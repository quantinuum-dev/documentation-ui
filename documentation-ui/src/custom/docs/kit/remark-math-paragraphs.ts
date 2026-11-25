interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: { hProperties?: Record<string, unknown> }
}

export const MATH_PARAGRAPH_CLASS = 'quantinuum-math-paragraph'

const isBlankText = (node: MdNode) => node.type === 'text' && !node.value?.trim()

/**
 * Tag paragraphs whose only content is one inline-math span (single-line
 * `$$…$$` display equations, notebook `text/latex` outputs) so `docs-theme.css`
 * can centre them. CSS alone can't: `:only-child` ignores text nodes, so it
 * would also match prose with a single inline formula.
 */
export function remarkMathParagraphs() {
  function walk(node: MdNode) {
    if (node.type === 'paragraph') {
      const content = node.children?.filter((child) => !isBlankText(child)) ?? []
      if (content.length === 1 && content[0].type === 'inlineMath') {
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, className: [MATH_PARAGRAPH_CLASS] },
        }
      }
      return
    }
    node.children?.forEach(walk)
  }

  return (tree: MdNode) => {
    walk(tree)
  }
}
