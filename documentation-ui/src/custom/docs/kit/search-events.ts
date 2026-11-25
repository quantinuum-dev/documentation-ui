/**
 * Shared contract for the custom event that opens a host application's
 * documentation search dialog. It lets plain-DOM code (and the Fumadocs sidebar
 * search trigger) drive the host's React search UI without a direct import
 * across that boundary.
 */

/** Name of the `window` CustomEvent that opens the search dialog. */
export const OPEN_SEARCH_EVENT = 'docsearch:open'

export interface OpenSearchDetail {
  /** Initial query to seed the search box with. */
  query?: string
  /**
   * When set, scope the search to this module (matches the `module` filter in
   * the Pagefind index). Omit for a site-wide search.
   */
  module?: string
}

/** Dispatch the open-search event with the given detail. */
export function openSearch(detail: OpenSearchDetail = {}): void {
  window.dispatchEvent(new CustomEvent<OpenSearchDetail>(OPEN_SEARCH_EVENT, { detail }))
}
