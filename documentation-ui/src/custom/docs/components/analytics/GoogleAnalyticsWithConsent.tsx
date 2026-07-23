'use client'

import { useEffect } from 'react'
import { useCookieConsent } from '../gdpr/contexts/useCookieConsent'
import { CookieCategoryName } from '../gdpr/types'
import {
  loadGoogleAnalytics,
  setGoogleConsentDefault,
  updateAnalyticsConsent,
} from './consent-mode'

export type GoogleAnalyticsWithConsentProps = {
  gaId: string
}

/**
 * Loads Google Analytics (GA4) and drives it with Google Consent Mode v2.
 *
 * GA is always loaded, but consent defaults to `denied`, so GA sends anonymous
 * cookieless pings (aggregate pageview counts, no tracking cookies) until the
 * visitor grants the Analytics cookie category. When consent changes, a
 * `consent update` upgrades or downgrades GA accordingly.
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

    // The consent default must be set before GA's config call.
    setGoogleConsentDefault()
    loadGoogleAnalytics(gaId)
  }, [gaId])

  useEffect(() => {
    updateAnalyticsConsent(analyticsGranted)
  }, [analyticsGranted])

  return null
}
