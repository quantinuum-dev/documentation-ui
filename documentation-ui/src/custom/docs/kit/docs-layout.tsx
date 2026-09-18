import type { SharedProps } from 'fumadocs-ui/contexts/search'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { RootProvider } from 'fumadocs-ui/provider/next'
import { cloneElement, isValidElement } from 'react'
import type { ComponentProps, ComponentType, CSSProperties, ReactNode } from 'react'

import { NavBar as DocsNavBar } from '../components/navmenu/index'
import { CiteTargetHighlighter } from './cite-target-highlighter'

/**
 * Height of the sticky site navbar (`h-12` plus its 1px bottom border). The
 * Fumadocs chrome nests *below* it, so both the sticky sidebar/TOC offset and
 * the layout frame height have to account for it.
 */
export const DOCS_NAV_HEIGHT = 'calc(3rem + 1px)'

/**
 * Frame height for the docs grid. Fumadocs defaults to `100dvh`, which — sitting
 * below the navbar — overflows the viewport and pushes the prev/next footer
 * off-screen on short pages. Kept off `--fd-docs-height` so the sidebar's own
 * height calculation stays correct.
 */
export const DOCS_MIN_HEIGHT = 'calc(100dvh - 3rem - 1px)'

export interface QuantinuumDocsLayoutProps {
  /** Page tree from the module's Fumadocs source loader. */
  tree: ComponentProps<typeof DocsLayout>['tree']
  /** Route prefix used to highlight the active entry in the site navbar. */
  activePath: string
  children: ReactNode
  /** Top-of-sidebar slot, normally the product logo linking to the docs root. */
  banner?: ReactNode
  /**
   * Bridges Fumadocs' sidebar search trigger to the host's search UI. Omit to
   * leave the trigger inert (e.g. the standalone preview harness, which has no
   * Pagefind index).
   */
  SearchDialog?: ComponentType<SharedProps>
  /** Extra classes on the theme scope element, e.g. font variables. */
  className?: string
  /** Mirror CSS `:target` for bibliography anchors across client-side nav. */
  highlightCiteTargets?: boolean
  /** Render the site navbar above the docs chrome. */
  showNavBar?: boolean
}

/**
 * The shared Quantinuum documentation shell: site navbar + Fumadocs docs layout,
 * scoped by the `quantinuum-docs` class the docs theme styles. Used by both the
 * central site and the standalone per-repo preview harness so the two render
 * identically.
 */
export function QuantinuumDocsLayout({
  tree,
  activePath,
  children,
  banner,
  SearchDialog,
  className,
  highlightCiteTargets = false,
  showNavBar = true,
}: QuantinuumDocsLayoutProps) {
  // Fumadocs renders `banner` inside a children array, and React warns about a
  // missing key for elements created by another component — so key it here
  // rather than relying on every consumer remembering to.
  const keyedBanner = isValidElement(banner)
    ? cloneElement(banner, { key: 'sidebar-banner' })
    : banner
  return (
    <div className={['quantinuum-docs', className].filter(Boolean).join(' ')}>
      {highlightCiteTargets ? <CiteTargetHighlighter /> : null}
      {showNavBar ? <DocsNavBar activePath={activePath} /> : null}
      {/* theme.enabled=false: the host has no next-themes provider, and a nested
          RootProvider would re-render next-themes' inline <script> on client
          navigation (React warns it can't execute). Docs follow the site theme. */}
      <RootProvider
        theme={{ enabled: false }}
        // Disable Fumadocs' own hotkey with a never-matching key: an empty array
        // makes its `hotKey.every(...)` vacuously true and swallows every
        // keystroke, and a predicate function can't cross the server/client
        // boundary — so use a sentinel string `event.key` never equals.
        // With no dialog injected there is nothing to search (the preview
        // harness has no Pagefind index), so hide the trigger entirely.
        search={
          SearchDialog
            ? { SearchDialog, hotKey: [{ display: '⌘K', key: '__disabled__' }] }
            : { enabled: false }
        }
      >
        <DocsLayout
          tree={tree}
          nav={{ enabled: false }}
          sidebar={{ banner: keyedBanner }}
          containerProps={{
            style: {
              '--fd-docs-row-1': showNavBar ? DOCS_NAV_HEIGHT : '0px',
              minHeight: showNavBar ? DOCS_MIN_HEIGHT : '100dvh',
            } as CSSProperties,
          }}
        >
          {children}
        </DocsLayout>
      </RootProvider>
    </div>
  )
}
