'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Next's client-side navigation updates the URL hash via history.pushState,
 * which does NOT re-evaluate the CSS `:target` pseudo-class — so a citation link
 * to the bibliography scrolls to the entry but never highlights it (only a full
 * reload does). This mirrors `:target` with a `.cite-target` class the docs theme
 * styles identically, applied on load, hash change, and route change.
 */
export function CiteTargetHighlighter() {
  const pathname = usePathname()
  useEffect(() => {
    const apply = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      const current = document.querySelector('a.cite-target')
      const target = id ? document.getElementById(id) : null
      const match = target?.matches('a[id^="bib-"]') ? target : null
      if (current === match) return
      current?.classList.remove('cite-target')
      match?.classList.add('cite-target')
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [pathname])
  return null
}
