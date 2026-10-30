'use client'

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export interface NavBarLink {
  title: string
  href: string
  /** Second line under the title. */
  description?: string
  /** Right-aligned code label, e.g. a package name. */
  detail?: string
}

export interface NavBarLinkGroup {
  title?: string
  /** Colour of the dot before the group title. */
  accent?: string
  links: NavBarLink[]
}

export interface NavBarMenu {
  /** Matched against the navbar's `activeMenu`. */
  id: string
  title: string
  /** Highlighted cards shown before the groups, each labelled `featuredLabel`. */
  featured?: NavBarLink[]
  featuredLabel?: string
  groups: NavBarLinkGroup[]
  /** Links in the panel's footer bar. */
  footer?: NavBarLink[]
}

export interface DocsNavBarOptions {
  /** Show a site-wide search trigger; the host must listen for `OPEN_SEARCH_EVENT`. */
  search?: boolean
  /** Theme control rendered in the navbar; needs a theme provider in the host. */
  themeToggle?: ReactNode
  /** Dropdown menus, in order. A product's own preview can pass just its subset. */
  menus?: NavBarMenu[]
  /** Prominent external link at the end of the bar, e.g. the Nexus portal. */
  cta?: NavBarLink
}

const DocsNavBarOptionsContext = createContext<DocsNavBarOptions>({})

/**
 * Site-wide navbar options, so every `DocsNavBar` (landing pages and the docs
 * layout's) gets the host's search and theme controls without per-page props.
 */
export function DocsNavBarProvider({
  children,
  ...options
}: DocsNavBarOptions & { children: ReactNode }) {
  return (
    <DocsNavBarOptionsContext.Provider value={options}>
      {children}
    </DocsNavBarOptionsContext.Provider>
  )
}

export function useDocsNavBarOptions(): DocsNavBarOptions {
  return useContext(DocsNavBarOptionsContext)
}
