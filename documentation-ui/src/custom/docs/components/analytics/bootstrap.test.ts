import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CookieCategoryName, type CookieConsent } from '../gdpr/types'
import { retrieveConsentCategoriesFromCookies } from '../gdpr/service/cookie-consent-service'
import {
  hasGoogleAnalyticsScript,
  loadGoogleAnalytics,
  setGoogleConsentDefault,
} from './consent-mode'
import { bootstrapGoogleAnalytics } from './bootstrap'

vi.mock('./consent-mode', () => ({
  hasGoogleAnalyticsScript: vi.fn(() => false),
  loadGoogleAnalytics: vi.fn(),
  setGoogleConsentDefault: vi.fn(),
}))

vi.mock('../gdpr/service/cookie-consent-service', () => ({
  retrieveConsentCategoriesFromCookies: vi.fn(),
}))

const TEST_GA_ID = 'G-TEST12345'

const buildConsent = (analyticsGranted: boolean): CookieConsent => ({
  [CookieCategoryName.Essential]: true,
  [CookieCategoryName.Analytics]: analyticsGranted,
})

beforeEach(() => {
  vi.mocked(hasGoogleAnalyticsScript).mockReturnValue(false)
  vi.mocked(retrieveConsentCategoriesFromCookies).mockReturnValue(buildConsent(false))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('bootstrapGoogleAnalytics', () => {
  it('seeds a granted default before loading GA for an already-consented visitor', () => {
    vi.mocked(retrieveConsentCategoriesFromCookies).mockReturnValue(buildConsent(true))

    bootstrapGoogleAnalytics(TEST_GA_ID)

    expect(setGoogleConsentDefault).toHaveBeenCalledWith({ analytics_storage: 'granted' })
    expect(loadGoogleAnalytics).toHaveBeenCalledWith(TEST_GA_ID)

    const defaultOrder = vi.mocked(setGoogleConsentDefault).mock.invocationCallOrder[0]
    const loadOrder = vi.mocked(loadGoogleAnalytics).mock.invocationCallOrder[0]
    expect(defaultOrder).toBeLessThan(loadOrder)
  })

  it('seeds a denied default for a first-time or declining visitor', () => {
    vi.mocked(retrieveConsentCategoriesFromCookies).mockReturnValue(buildConsent(false))

    bootstrapGoogleAnalytics(TEST_GA_ID)

    expect(setGoogleConsentDefault).toHaveBeenCalledWith({ analytics_storage: 'denied' })
    expect(loadGoogleAnalytics).toHaveBeenCalledWith(TEST_GA_ID)
  })

  it('does nothing when no gaId is provided', () => {
    bootstrapGoogleAnalytics('')

    expect(retrieveConsentCategoriesFromCookies).not.toHaveBeenCalled()
    expect(setGoogleConsentDefault).not.toHaveBeenCalled()
    expect(loadGoogleAnalytics).not.toHaveBeenCalled()
  })

  it('is idempotent: does nothing when GA has already been injected', () => {
    vi.mocked(hasGoogleAnalyticsScript).mockReturnValue(true)

    bootstrapGoogleAnalytics(TEST_GA_ID)

    expect(retrieveConsentCategoriesFromCookies).not.toHaveBeenCalled()
    expect(setGoogleConsentDefault).not.toHaveBeenCalled()
    expect(loadGoogleAnalytics).not.toHaveBeenCalled()
  })
})
