'use client'

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export interface DocsNavBarOptions {
  /** Show a site-wide search trigger; the host must listen for `OPEN_SEARCH_EVENT`. */
  search?: boolean
  /** Theme control rendered in the navbar; needs a theme provider in the host. */
  themeToggle?: ReactNode
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
