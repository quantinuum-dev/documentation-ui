import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CookieCategoryName, type CookieConsent } from '../gdpr/types'
import {
  loadGoogleAnalytics,
  setGoogleConsentDefault,
  updateAnalyticsConsent,
} from './consent-mode'
import { GoogleAnalyticsWithConsent } from './GoogleAnalyticsWithConsent'
import { useCookieConsent } from '../gdpr/contexts/useCookieConsent'
import type { CookieConsentContextType } from '../gdpr/contexts/CookieConsentShared'

vi.mock('./consent-mode', () => ({
  setGoogleConsentDefault: vi.fn(),
  loadGoogleAnalytics: vi.fn(),
  updateAnalyticsConsent: vi.fn(),
}))

vi.mock('../gdpr/contexts/useCookieConsent', () => ({
  useCookieConsent: vi.fn(),
}))

const TEST_GA_ID = 'G-TEST12345'

const buildConsent = (analyticsGranted: boolean): CookieConsent => ({
  [CookieCategoryName.Essential]: true,
  [CookieCategoryName.Analytics]: analyticsGranted,
})

const mockConsent = (analyticsGranted: boolean) => {
  vi.mocked(useCookieConsent).mockReturnValue({
    consent: buildConsent(analyticsGranted),
  } as CookieConsentContextType)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('GoogleAnalyticsWithConsent', () => {
  it('renders nothing', () => {
    mockConsent(false)

    const { container } = render(<GoogleAnalyticsWithConsent gaId={TEST_GA_ID} />)

    expect(container.childNodes).toHaveLength(0)
  })

  it('sets the denied consent default before loading GA on mount', () => {
    mockConsent(false)

    render(<GoogleAnalyticsWithConsent gaId={TEST_GA_ID} />)

    expect(setGoogleConsentDefault).toHaveBeenCalledTimes(1)
    expect(loadGoogleAnalytics).toHaveBeenCalledWith(TEST_GA_ID)

    // The default must be set before GA is configured.
    const defaultOrder = vi.mocked(setGoogleConsentDefault).mock.invocationCallOrder[0]
    const loadOrder = vi.mocked(loadGoogleAnalytics).mock.invocationCallOrder[0]
    expect(defaultOrder).toBeLessThan(loadOrder)
  })

  it('keeps analytics denied while the visitor has not consented', () => {
    mockConsent(false)

    render(<GoogleAnalyticsWithConsent gaId={TEST_GA_ID} />)

    expect(updateAnalyticsConsent).toHaveBeenCalledWith(false)
  })

  it('grants analytics consent when the visitor has consented', () => {
    mockConsent(true)

    render(<GoogleAnalyticsWithConsent gaId={TEST_GA_ID} />)

    expect(updateAnalyticsConsent).toHaveBeenCalledWith(true)
  })

  it('upgrades consent when the visitor accepts after mounting', () => {
    mockConsent(false)

    const { rerender } = render(<GoogleAnalyticsWithConsent gaId={TEST_GA_ID} />)
    expect(updateAnalyticsConsent).toHaveBeenLastCalledWith(false)

    mockConsent(true)
    rerender(<GoogleAnalyticsWithConsent gaId={TEST_GA_ID} />)

    expect(updateAnalyticsConsent).toHaveBeenLastCalledWith(true)
    // GA is loaded once; only the consent signal changes.
    expect(setGoogleConsentDefault).toHaveBeenCalledTimes(1)
    expect(loadGoogleAnalytics).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no gaId is provided', () => {
    mockConsent(false)

    render(<GoogleAnalyticsWithConsent gaId="" />)

    expect(setGoogleConsentDefault).not.toHaveBeenCalled()
    expect(loadGoogleAnalytics).not.toHaveBeenCalled()
  })
})
