'use client'

import { useEffect } from 'react'
import { useCookieConsent } from '../gdpr/contexts/useCookieConsent'
import { CookieCategoryName } from '../gdpr/types'
import { bootstrapGoogleAnalytics } from './bootstrap'
import { updateAnalyticsConsent } from './consent-mode'

export type GoogleAnalyticsWithConsentProps = {
  gaId: string
}

/**
 * Loads Google Analytics (GA4) and drives it with Google Consent Mode v2.
 *
 * GA is always loaded. Bootstrapping is delegated to `bootstrapGoogleAnalytics`,
 * which seeds the consent *default* from the visitor's stored decision: a
 * first-time or declining visitor defaults to `denied` (anonymous cookieless
 * pings, no tracking cookies), while a returning, already-consented visitor
 * defaults to `granted` so their very first `page_view` is measured with
 * consent. When consent changes during the session, a `consent update`
 * upgrades or downgrades GA accordingly.
 *
 * The bootstrap is idempotent: in the sphinx injection it is invoked
 * synchronously before React mounts (avoiding post-hydration delay), so this
 * effect becomes a no-op there; in contexts without that injection (e.g.
 * Next.js) this effect performs the bootstrap itself.
 *
 * This is framework-agnostic (no `next/script`), so it works in Next.js apps
 * and in the plain-React sphinx injection alike. Render it inside a
 * `CookieConsentProvider`.
 */
export function GoogleAnalyticsWithConsent({ gaId }: GoogleAnalyticsWithConsentProps) {
  const { consent } = useCookieConsent()
  const analyticsGranted = consent[CookieCategoryName.Analytics]

  useEffect(() => {
    if (!gaId) {
      return
    }

    bootstrapGoogleAnalytics(gaId)
  }, [gaId])

  useEffect(() => {
    updateAnalyticsConsent(analyticsGranted)
  }, [analyticsGranted])

  return null
}
