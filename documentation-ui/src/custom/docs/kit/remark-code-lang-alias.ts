interface MdNode {
  type: string
  lang?: string | null
  children?: MdNode[]
}

/**
 * Rename code-fence languages before Fumadocs' rehypeCode sees them. Replaces
 * Shiki's `langAlias` option, which makes rehypeCode build a fresh highlighter
 * for every MDX file instead of reusing its shared one.
 */
export function remarkCodeLangAlias(aliases: Record<string, string>) {
  function walk(node: MdNode) {
    if (
      node.type === 'code' &&
      node.lang &&
      Object.prototype.hasOwnProperty.call(aliases, node.lang)
    ) {
      node.lang = aliases[node.lang]
    }
    node.children?.forEach(walk)
  }

  return () => (tree: MdNode) => {
    walk(tree)
  }
}
