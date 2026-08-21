import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GOOGLE_CONSENT,
  ensureGtag,
  hasGoogleAnalyticsScript,
  loadGoogleAnalytics,
  setGoogleConsentDefault,
  updateAnalyticsConsent,
} from './consent-mode'

type AnalyticsWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

const GA_SCRIPT_ID = 'quantinuum-google-analytics'
const TEST_GA_ID = 'G-TEST12345'

const analyticsWindow = window as AnalyticsWindow

/** Returns the recorded gtag command tuples pushed onto the dataLayer. */
const commands = (): unknown[][] =>
  (analyticsWindow.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))

/** Finds the first recorded command matching the given leading arguments. */
const findCommand = (...prefix: unknown[]): unknown[] | undefined =>
  commands().find((entry) => prefix.every((value, index) => entry[index] === value))

beforeEach(() => {
  // Each test starts from a pristine analytics environment.
  delete analyticsWindow.dataLayer
  delete analyticsWindow.gtag
  document.getElementById(GA_SCRIPT_ID)?.remove()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ensureGtag', () => {
  it('creates the dataLayer and a gtag function that records commands', () => {
    const gtag = ensureGtag()

    expect(gtag).toBeTypeOf('function')
    expect(analyticsWindow.dataLayer).toEqual([])

    gtag?.('event', 'page_view')

    expect(Object.prototype.toString.call(analyticsWindow.dataLayer?.[0])).toBe(
      '[object Arguments]'
    )
    expect(commands()).toEqual([['event', 'page_view']])
  })

  it('is idempotent and preserves an existing dataLayer and gtag', () => {
    const first = ensureGtag()
    first?.('js', 'seed')

    const second = ensureGtag()

    expect(second).toBe(first)
    expect(commands()).toEqual([['js', 'seed']])
  })
})

describe('setGoogleConsentDefault', () => {
  it('defaults every signal to denied so GA runs in cookieless ping mode', () => {
    setGoogleConsentDefault()

    const consentDefault = findCommand('consent', 'default')
    expect(consentDefault).toBeDefined()

    const settings = consentDefault?.[2] as Record<string, unknown>
    expect(settings).toMatchObject({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 100,
    })
  })

  it('emits exactly the DEFAULT_GOOGLE_CONSENT signals plus wait_for_update', () => {
    setGoogleConsentDefault()

    const settings = findCommand('consent', 'default')?.[2] as Record<string, unknown>
    expect(settings).toEqual({
      ...DEFAULT_GOOGLE_CONSENT,
      wait_for_update: 100,
    })
  })

  it('runs before any analytics config so the default applies to the first ping', () => {
    setGoogleConsentDefault()
    loadGoogleAnalytics(TEST_GA_ID)

    const layer = commands()
    const consentIndex = layer.findIndex(
      (entry) => entry[0] === 'consent' && entry[1] === 'default'
    )
    const configIndex = layer.findIndex((entry) => entry[0] === 'config')

    expect(consentIndex).toBeGreaterThanOrEqual(0)
    expect(configIndex).toBeGreaterThan(consentIndex)
  })

  it('allows individual signals to be overridden', () => {
    setGoogleConsentDefault({ analytics_storage: 'granted' })

    const settings = findCommand('consent', 'default')?.[2] as Record<string, unknown>
    expect(settings.analytics_storage).toBe('granted')
    // Non-overridden signals remain denied.
    expect(settings.ad_storage).toBe('denied')
  })
})

describe('updateAnalyticsConsent', () => {
  it('upgrades analytics_storage to granted when the visitor consents', () => {
    updateAnalyticsConsent(true)

    expect(findCommand('consent', 'update')?.[2]).toEqual({
      analytics_storage: 'granted',
    })
  })

  it('keeps analytics_storage denied when the visitor withholds consent', () => {
    updateAnalyticsConsent(false)

    expect(findCommand('consent', 'update')?.[2]).toEqual({
      analytics_storage: 'denied',
    })
  })

  it('does not touch advertising signals', () => {
    updateAnalyticsConsent(true)

    const settings = findCommand('consent', 'update')?.[2] as Record<string, unknown>
    expect(settings).not.toHaveProperty('ad_storage')
    expect(settings).not.toHaveProperty('ad_user_data')
    expect(settings).not.toHaveProperty('ad_personalization')
  })
})

describe('loadGoogleAnalytics', () => {
  it('initialises GA and injects a single async gtag.js script', () => {
    loadGoogleAnalytics(TEST_GA_ID)

    expect(findCommand('js')).toBeDefined()
    expect(findCommand('config', TEST_GA_ID)).toBeDefined()

    const script = document.getElementById(GA_SCRIPT_ID) as HTMLScriptElement | null
    expect(script).not.toBeNull()
    expect(script?.async).toBe(true)
    expect(script?.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${TEST_GA_ID}`)
  })

  it('does not append a second script when called repeatedly', () => {
    loadGoogleAnalytics(TEST_GA_ID)
    loadGoogleAnalytics(TEST_GA_ID)

    expect(document.querySelectorAll(`#${GA_SCRIPT_ID}`)).toHaveLength(1)
  })

  it('updates the script src when the GA id changes', () => {
    const otherGaId = 'G-OTHER67890'
    loadGoogleAnalytics(TEST_GA_ID)
    loadGoogleAnalytics(otherGaId)

    const script = document.getElementById(GA_SCRIPT_ID) as HTMLScriptElement | null
    expect(document.querySelectorAll(`#${GA_SCRIPT_ID}`)).toHaveLength(1)
    expect(script?.src).toBe(`https://www.googletagmanager.com/gtag/js?id=${otherGaId}`)
  })
})

describe('hasGoogleAnalyticsScript', () => {
  it('is false before any script is injected', () => {
    expect(hasGoogleAnalyticsScript()).toBe(false)
    expect(hasGoogleAnalyticsScript(TEST_GA_ID)).toBe(false)
  })

  it('is true once a script is present when no gaId is supplied', () => {
    loadGoogleAnalytics(TEST_GA_ID)

    expect(hasGoogleAnalyticsScript()).toBe(true)
  })

  it('matches only the gaId the injected script targets', () => {
    loadGoogleAnalytics(TEST_GA_ID)

    expect(hasGoogleAnalyticsScript(TEST_GA_ID)).toBe(true)
    // A script left over from a different ID must not count as present, so the
    // bootstrap re-runs and updates it.
    expect(hasGoogleAnalyticsScript('G-OTHER67890')).toBe(false)
  })
})
