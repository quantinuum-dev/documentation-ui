import { Accordion, Accordions } from 'fumadocs-ui/components/accordion'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'

/**
 * MDX components every converted docs page needs. Fumadocs' defaults cover
 * `Callout`/`Card`/`Cards`, but the converter also emits `<Tabs>` (sphinx-tabs)
 * and `<Accordions>` (the custom `faq` directive), which must be registered
 * explicitly or they render as inert unknown elements.
 */
export function getDocsMdxComponents(extra: MDXComponents = {}): MDXComponents {
  return { ...defaultMdxComponents, Tab, Tabs, Accordion, Accordions, ...extra }
}
