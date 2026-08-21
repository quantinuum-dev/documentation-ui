/**
 * One-time bootstrap for GA4 + Google Consent Mode v2, deliberately decoupled
 * from React.
 *
 * Running the bootstrap from a React `useEffect` means GA is not initialised
 * until after the tree has rendered, committed and flushed its passive effects,
 * which on a heavy page delays the first `page_view` by hundreds of
 * milliseconds. Because this helper (and the primitives it composes) have no
 * React dependency, it can instead be invoked synchronously from a plain-JS
 * entry point — e.g. the sphinx injection script, before the React root is
 * mounted — so GA starts as early as the page's JavaScript can run.
 */

import { retrieveConsentCategoriesFromCookies } from '../gdpr/service/cookie-consent-service'
import { CookieCategoryName } from '../gdpr/types'
import {
  hasGoogleAnalyticsScript,
  loadGoogleAnalytics,
  setGoogleConsentDefault,
} from './consent-mode'

/**
 * Initialises GA once, seeding the consent default from the visitor's stored
 * decision so a returning, already-consented visitor's first `page_view` is
 * sent with consent granted (rather than going out cookieless and relying on a
 * later `consent update`).
 *
 * Idempotent and safe to call from multiple entry points: the sphinx injection
 * can call it synchronously before mounting React, and `GoogleAnalyticsWithConsent`
 * calls it from an effect as a fallback for contexts without that injection
 * (e.g. Next.js). Whichever runs first wins; subsequent calls are no-ops.
 */
export function bootstrapGoogleAnalytics(gaId: string): void {
  if (!gaId || typeof document === 'undefined' || hasGoogleAnalyticsScript()) {
    return
  }

  const analyticsGranted = retrieveConsentCategoriesFromCookies()[CookieCategoryName.Analytics]

  // The consent default must be set before GA's config call.
  setGoogleConsentDefault({ analytics_storage: analyticsGranted ? 'granted' : 'denied' })
  loadGoogleAnalytics(gaId)
}
