import { MarkdownCopyButton } from 'fumadocs-ui/layouts/docs/page'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page'
import type { MDXComponents } from 'mdx/types'
import type { ComponentProps, ComponentType } from 'react'

import { getDocsMdxComponents } from './mdx-components'

export interface QuantinuumDocsPageProps {
  /** Compiled MDX body from the page's Fumadocs source data. */
  body: ComponentType<{ components?: MDXComponents }>
  title?: string
  description?: string
  toc?: ComponentProps<typeof DocsPage>['toc']
  /** Additional or overriding MDX components for this module. */
  components?: MDXComponents
  /** URL of the page's Markdown version; adds a "Copy Markdown" button. */
  markdownUrl?: string
}

/**
 * Renders one converted documentation page with the shared MDX component set,
 * so the central site and the standalone preview harness produce identical
 * output.
 */
export function QuantinuumDocsPage({
  body: MDX,
  title,
  description,
  toc,
  components,
  markdownUrl,
}: QuantinuumDocsPageProps) {
  return (
    <DocsPage toc={toc}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <DocsTitle>{title}</DocsTitle>
        {markdownUrl && <MarkdownCopyButton markdownUrl={markdownUrl} className="shrink-0" />}
      </div>
      <DocsDescription>{description}</DocsDescription>
      <DocsBody>
        <MDX components={getDocsMdxComponents(components)} />
      </DocsBody>
    </DocsPage>
  )
}
