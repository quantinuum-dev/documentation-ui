'use client'

import type { SharedProps } from 'fumadocs-ui/contexts/search'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

import { openSearch } from './search-events'

/**
 * Bridges Fumadocs' sidebar search trigger to a host-provided Pagefind dialog,
 * pre-scoped to the current docs module (the first URL segment, e.g. `/nexus/…`
 * → "nexus"), mirroring how the old Sphinx sidebar search boxes drove the shared
 * UI. When Fumadocs opens this dialog we hand off via `OPEN_SEARCH_EVENT` and
 * immediately release Fumadocs' own open state. A single client component (not a
 * per-module factory) so it stays a valid server→client boundary reference.
 *
 * Hosts without a global search listener (e.g. the standalone preview harness)
 * should simply not pass this dialog to {@link QuantinuumDocsLayout}.
 */
export function PagefindSearchDialog({ open, onOpenChange }: SharedProps) {
  const pathname = usePathname()
  useEffect(() => {
    if (!open) return
    const module = pathname.split('/').filter(Boolean)[0]
    openSearch(module ? { module } : {})
    onOpenChange(false)
  }, [open, onOpenChange, pathname])
  return null
}
