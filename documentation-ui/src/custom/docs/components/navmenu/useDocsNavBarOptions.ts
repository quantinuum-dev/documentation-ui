'use client'

import { createContext, useContext } from 'react'
import type { DocsNavBarOptions } from './NavBarOptions'

export const DocsNavBarOptionsContext = createContext<DocsNavBarOptions>({})

export function useDocsNavBarOptions(): DocsNavBarOptions {
  return useContext(DocsNavBarOptionsContext)
}
