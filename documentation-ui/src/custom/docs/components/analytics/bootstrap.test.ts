import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CookieCategoryName, type CookieConsent } from '../gdpr/types'
import {
  isConsentSetInCookies,
  retrieveConsentCategoriesFromCookies,
} from '../gdpr/service/cookie-consent-service'
import {
  hasGoogleAnalyticsScript,
  loadGoogleAnalytics,
  setGoogleConsentDefault,
  updateAnalyticsConsent,
} from './consent-mode'
import { bootstrapGoogleAnalytics } from './bootstrap'

vi.mock('./consent-mode', () => ({
  hasGoogleAnalyticsScript: vi.fn(() => false),
  loadGoogleAnalytics: vi.fn(),
  setGoogleConsentDefault: vi.fn(),
  updateAnalyticsConsent: vi.fn(),
}))

vi.mock('../gdpr/service/cookie-consent-service', () => ({
  isConsentSetInCookies: vi.fn(() => true),
  retrieveConsentCategoriesFromCookies: vi.fn(),
}))

const TEST_GA_ID = 'G-TEST12345'

const buildConsent = (analyticsGranted: boolean): CookieConsent => ({
  [CookieCategoryName.Essential]: true,
  [CookieCategoryName.Analytics]: analyticsGranted,
})

beforeEach(() => {
  vi.mocked(hasGoogleAnalyticsScript).mockReturnValue(false)
  vi.mocked(isConsentSetInCookies).mockReturnValue(true)
  vi.mocked(retrieveConsentCategoriesFromCookies).mockReturnValue(buildConsent(false))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('bootstrapGoogleAnalytics', () => {
  it('applies a stored grant before loading GA', () => {
    vi.mocked(retrieveConsentCategoriesFromCookies).mockReturnValue(buildConsent(true))

    bootstrapGoogleAnalytics(TEST_GA_ID)

    expect(setGoogleConsentDefault).toHaveBeenCalledWith()
    expect(loadGoogleAnalytics).toHaveBeenCalledWith(TEST_GA_ID)
    expect(updateAnalyticsConsent).toHaveBeenCalledWith(true)

    const defaultOrder = vi.mocked(setGoogleConsentDefault).mock.invocationCallOrder[0]
    const updateOrder = vi.mocked(updateAnalyticsConsent).mock.invocationCallOrder[0]
    const loadOrder = vi.mocked(loadGoogleAnalytics).mock.invocationCallOrder[0]
    expect(defaultOrder).toBeLessThan(updateOrder)
    expect(updateOrder).toBeLessThan(loadOrder)
  })

  it('seeds a denied default for a first-time or declining visitor', () => {
    vi.mocked(retrieveConsentCategoriesFromCookies).mockReturnValue(buildConsent(false))

    bootstrapGoogleAnalytics(TEST_GA_ID)

    expect(setGoogleConsentDefault).toHaveBeenCalledWith()
    expect(loadGoogleAnalytics).toHaveBeenCalledWith(TEST_GA_ID)
    expect(updateAnalyticsConsent).toHaveBeenCalledWith(false)
  })

  it('does not grant analytics from an obsolete consent cookie', () => {
    vi.mocked(isConsentSetInCookies).mockReturnValue(false)
    vi.mocked(retrieveConsentCategoriesFromCookies).mockReturnValue(buildConsent(true))

    bootstrapGoogleAnalytics(TEST_GA_ID)

    expect(setGoogleConsentDefault).toHaveBeenCalledWith()
    expect(retrieveConsentCategoriesFromCookies).not.toHaveBeenCalled()
    expect(updateAnalyticsConsent).toHaveBeenCalledWith(false)
  })

  it('does nothing when no gaId is provided', () => {
    bootstrapGoogleAnalytics('')

    expect(retrieveConsentCategoriesFromCookies).not.toHaveBeenCalled()
    expect(setGoogleConsentDefault).not.toHaveBeenCalled()
    expect(loadGoogleAnalytics).not.toHaveBeenCalled()
  })

  it('is idempotent: does nothing when GA for the same gaId is already injected', () => {
    vi.mocked(hasGoogleAnalyticsScript).mockReturnValue(true)

    bootstrapGoogleAnalytics(TEST_GA_ID)

    expect(hasGoogleAnalyticsScript).toHaveBeenCalledWith(TEST_GA_ID)
    expect(retrieveConsentCategoriesFromCookies).not.toHaveBeenCalled()
    expect(setGoogleConsentDefault).not.toHaveBeenCalled()
    expect(loadGoogleAnalytics).not.toHaveBeenCalled()
  })

  it('re-initialises when only a script for a different gaId is present', () => {
    // hasGoogleAnalyticsScript(gaId) reports false when the injected script
    // targets a different measurement ID, so the bootstrap should proceed and
    // let loadGoogleAnalytics update it.
    vi.mocked(hasGoogleAnalyticsScript).mockReturnValue(false)

    bootstrapGoogleAnalytics(TEST_GA_ID)

    expect(hasGoogleAnalyticsScript).toHaveBeenCalledWith(TEST_GA_ID)
    expect(loadGoogleAnalytics).toHaveBeenCalledWith(TEST_GA_ID)
  })
})
