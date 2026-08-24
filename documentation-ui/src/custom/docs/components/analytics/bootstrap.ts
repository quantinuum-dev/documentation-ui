/**
 * One-time bootstrap for GA4 + Google Consent Mode v2, deliberately decoupled
 * from React.
 *
 * This is the client-side fallback used when the parser-time head integration
 * was not rendered. For prompt first-page measurement, render
 * `GoogleAnalyticsHead` in the initial server-rendered document head instead.
 */

import {
  isConsentSetInCookies,
  retrieveConsentCategoriesFromCookies,
} from '../gdpr/service/cookie-consent-service'
import { COOKIES_CONSENT_VERSION } from '../gdpr/cookies-consent.config'
import { CookieCategoryName } from '../gdpr/types'
import {
  hasGoogleAnalyticsScript,
  loadGoogleAnalytics,
  setGoogleConsentDefault,
  updateAnalyticsConsent,
} from './consent-mode'

/**
 * Initialises GA with a denied default, then sends the persisted choice as an
 * update after config is queued. This is the sequence Google documents for
 * consent choices restored on subsequent pages.
 *
 * Idempotent and safe to call after `GoogleAnalyticsHead`:
 * `GoogleAnalyticsWithConsent` invokes it from an effect as a compatibility
 * fallback, and it becomes a no-op when the head integration already loaded GA.
 */
export function bootstrapGoogleAnalytics(gaId: string): void {
  if (!gaId || typeof document === 'undefined' || hasGoogleAnalyticsScript(gaId)) {
    return
  }

  const analyticsGranted =
    isConsentSetInCookies(COOKIES_CONSENT_VERSION) &&
    retrieveConsentCategoriesFromCookies()[CookieCategoryName.Analytics]

  setGoogleConsentDefault()
  loadGoogleAnalytics(gaId)
  updateAnalyticsConsent(analyticsGranted)
}
