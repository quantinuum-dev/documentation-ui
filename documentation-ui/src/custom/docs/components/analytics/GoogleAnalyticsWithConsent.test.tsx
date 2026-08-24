import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CookieCategoryName, type CookieConsent } from '../gdpr/types'
import { bootstrapGoogleAnalytics } from './bootstrap'
import { updateAnalyticsConsent } from './consent-mode'
import { GoogleAnalyticsWithConsent } from './GoogleAnalyticsWithConsent'
import { useCookieConsent } from '../gdpr/contexts/useCookieConsent'
import type { CookieConsentContextType } from '../gdpr/contexts/CookieConsentShared'

vi.mock('./bootstrap', () => ({
  bootstrapGoogleAnalytics: vi.fn(),
}))

vi.mock('./consent-mode', () => ({
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

  it('bootstraps GA once on mount', () => {
    mockConsent(false)

    render(<GoogleAnalyticsWithConsent gaId={TEST_GA_ID} />)

    expect(bootstrapGoogleAnalytics).toHaveBeenCalledTimes(1)
    expect(bootstrapGoogleAnalytics).toHaveBeenCalledWith(TEST_GA_ID)
  })

  it('sends initial denied consent', () => {
    mockConsent(false)

    render(<GoogleAnalyticsWithConsent gaId={TEST_GA_ID} />)

    expect(updateAnalyticsConsent).toHaveBeenCalledWith(false)
  })

  it('sends an initial stored grant', () => {
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
    // GA is bootstrapped once; only the consent signal changes afterwards.
    expect(bootstrapGoogleAnalytics).toHaveBeenCalledTimes(1)
  })

  it('does not bootstrap when no gaId is provided', () => {
    mockConsent(false)

    render(<GoogleAnalyticsWithConsent gaId="" />)

    expect(bootstrapGoogleAnalytics).not.toHaveBeenCalled()
  })
})
