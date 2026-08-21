/**
 * Framework-agnostic helpers for Google Analytics (GA4) + Google Consent Mode v2.
 *
 * These contain no React or Next.js dependencies so they can be reused from
 * Next.js apps and plain-React/MPA contexts (e.g. the sphinx injection) alike.
 */

export type GoogleConsentState = 'granted' | 'denied'

export type GoogleConsentSettings = {
  ad_storage?: GoogleConsentState
  ad_user_data?: GoogleConsentState
  ad_personalization?: GoogleConsentState
  analytics_storage?: GoogleConsentState
  wait_for_update?: number
}

type GtagFn = (...args: unknown[]) => void

type AnalyticsWindow = Window & {
  dataLayer?: unknown[]
  gtag?: GtagFn
}

const GA_SCRIPT_ID = 'quantinuum-google-analytics'

/**
 * The default consent state: everything denied. In this state GA runs in
 * "cookieless ping" mode, recording anonymous, aggregate statistics (such as
 * pageview counts) without setting any tracking cookies or storing an
 * identifier.
 */
export const DEFAULT_GOOGLE_CONSENT: Required<Omit<GoogleConsentSettings, 'wait_for_update'>> = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
}

/** Returns whether the gtag.js script has already been injected. */
export function hasGoogleAnalyticsScript(): boolean {
  return typeof document !== 'undefined' && document.getElementById(GA_SCRIPT_ID) !== null
}

/** Ensures `window.dataLayer` / `window.gtag` exist and returns the gtag function. */
export function ensureGtag(): GtagFn | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const analyticsWindow = window as AnalyticsWindow
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || []
  analyticsWindow.gtag =
    analyticsWindow.gtag ||
    function gtag() {
      // GA's gtag.js only treats an entry as a command when it is a genuine
      // `arguments` object; pushing a plain array makes it ignore commands like
      // `config`/`consent`, so we intentionally forward `arguments` here.
      // eslint-disable-next-line prefer-rest-params
      analyticsWindow.dataLayer?.push(arguments)
    }

  return analyticsWindow.gtag
}

/**
 * Sets the Google Consent Mode v2 default. This MUST run before GA's `config`
 * call. Everything defaults to `denied` so GA sends anonymous cookieless pings
 * until the visitor consents; pass `overrides` to adjust individual signals.
 */
export function setGoogleConsentDefault(overrides: GoogleConsentSettings = {}): void {
  const gtag = ensureGtag()
  if (!gtag) {
    return
  }

  gtag('consent', 'default', {
    ...DEFAULT_GOOGLE_CONSENT,
    wait_for_update: 100,
    ...overrides,
  })
}

/** Updates the analytics consent state after the visitor makes a choice. */
export function updateAnalyticsConsent(granted: boolean): void {
  const gtag = ensureGtag()
  if (!gtag) {
    return
  }

  gtag('consent', 'update', {
    analytics_storage: granted ? 'granted' : 'denied',
  })
}

/**
 * Initialises GA (`gtag('js')` + `gtag('config')`) and injects the gtag.js
 * script tag. Safe to call more than once: the script is only appended once.
 */
export function loadGoogleAnalytics(gaId: string): void {
  if (typeof document === 'undefined') {
    return
  }

  const gtag = ensureGtag()
  if (!gtag) {
    return
  }

  gtag('js', new Date())
  gtag('config', gaId)

  const scriptUrl = new URL('https://www.googletagmanager.com/gtag/js')
  scriptUrl.searchParams.set('id', gaId)

  const existingScript = document.getElementById(GA_SCRIPT_ID) as HTMLScriptElement | null
  if (existingScript) {
    if (existingScript.src !== scriptUrl.toString()) {
      existingScript.src = scriptUrl.toString()
    }
    return
  }

  const script = document.createElement('script')
  script.id = GA_SCRIPT_ID
  script.async = true
  script.src = scriptUrl.toString()
  document.head.appendChild(script)
}
