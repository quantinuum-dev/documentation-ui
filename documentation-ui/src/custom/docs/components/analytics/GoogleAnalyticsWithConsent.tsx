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
 * GA is always loaded. Bootstrapping seeds the default from the valid stored
 * decision. Later consent changes upgrade or downgrade GA accordingly.
 *
 * To queue first-page measurement before hydration, pair this component with
 * `GoogleAnalyticsHead` in the initial server-rendered document head. This
 * component's bootstrap is an idempotent client-side fallback.
 *
 * Render it inside a `CookieConsentProvider`.
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
