import { Accordion, Accordions } from 'fumadocs-ui/components/accordion'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { ComponentProps } from 'react'
import type { MDXComponents } from 'mdx/types'

const DefaultLink = defaultMdxComponents.a

/** In-page `#anchor` links stay native: routed through next/link with
 * `trailingSlash`, they re-navigate instead of scrolling to the heading. */
function MdxLink(props: ComponentProps<'a'>) {
  if (props.href?.startsWith('#')) return <a {...props} />
  return <DefaultLink {...props} />
}

/**
 * MDX components every converted docs page needs. Fumadocs' defaults cover
 * `Callout`/`Card`/`Cards`, but the converter also emits `<Tabs>` (sphinx-tabs)
 * and `<Accordions>` (the custom `faq` directive), which must be registered
 * explicitly or they render as inert unknown elements.
 */
export function getDocsMdxComponents(extra: MDXComponents = {}): MDXComponents {
  return { ...defaultMdxComponents, a: MdxLink, Tab, Tabs, Accordion, Accordions, ...extra }
}
