import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { ComponentProps, ComponentType, ReactNode } from 'react'

import type { XrefOrigin, XrefResolver } from './xref'

type LinkProps = ComponentProps<'a'>

const warned = new Set<string>()

function isEmpty(children: ReactNode): boolean {
  return (
    children === undefined ||
    children === null ||
    children === '' ||
    (Array.isArray(children) && children.length === 0)
  )
}

/**
 * An MDX `a` component that resolves MyST cross-references (`#label`,
 * `./page.mdx#x`, `inv:key:domain:type#name`) against `resolver`, filling in
 * empty link text. Unresolved references are logged once and left as written.
 */
export function createXrefLink(
  resolver: XrefResolver,
  from: XrefOrigin,
  Link: ComponentType<LinkProps> = defaultMdxComponents.a as ComponentType<LinkProps>
) {
  return function XrefLink({ href, children, ...props }: LinkProps) {
    const resolved = href ? resolver.resolve(href, from) : undefined
    if (resolved === undefined)
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      )
    if (resolved === null) {
      // A `#id` with its own text may target a raw HTML id the index can't see.
      if (href?.startsWith('#') && !isEmpty(children))
        return (
          <Link href={href} {...props}>
            {children}
          </Link>
        )
      const key = `${from.page} -> ${href}`
      if (!warned.has(key)) {
        warned.add(key)
        console.warn(`[xref] unresolved cross-reference on ${key}`)
      }
      return (
        <Link href={href} {...props}>
          {isEmpty(children) ? href : children}
        </Link>
      )
    }
    const text = resolved.code ? <code>{resolved.text}</code> : resolved.text
    return (
      <Link href={resolved.url} {...props}>
        {isEmpty(children) ? text : children}
      </Link>
    )
  }
}
