import { CookieConsentManager } from './CookieConsentManager'
import { render, screen } from '@testing-library/react'
import * as CookieContext from 'src/custom/docs/components/gdpr/contexts/CookieConsentContext'
import { CookieCategoryName } from 'src/custom/docs/components/gdpr/types'
import { vi } from 'vitest'

vi.mock('../CookieBanner/CookieBanner', () => ({ CookieBanner: () => <div data-testid="cookie-banner" /> }))
vi.mock('../CookieSettingsDialog/CookieSettingsDialog', () => ({
  CookieSettingsDialog: () => <div data-testid="cookie-settings-dialog" />,
}))
vi.mock('../CookieSettingsButton/CookieSettingsButton', () => ({
  CookieSettingsButton: () => <div data-testid="settings-button-persistent" />,
}))

describe('CookieConsentManager', () => {
  const mockUseCookieConsent = vi.spyOn(CookieContext, 'useCookieConsent')
  const defaultMockActions = {
    acceptAll: vi.fn(),
    rejectNonEssential: vi.fn(),
    openSettings: vi.fn(),
    saveConsent: vi.fn(),
    closeCookieSettingsDialog: vi.fn(),
    consent: { [CookieCategoryName.Essential]: true, [CookieCategoryName.Analytics]: false },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render cookie banner when banner is visible', async () => {
    mockUseCookieConsent.mockReturnValue({
      ...defaultMockActions,
      isCookieBannerVisible: true,
      isCookieSettingsDialogVisible: false,
      isConsentSet: false,
    })

    render(<CookieConsentManager />)

    expect(await screen.findByTestId('cookie-banner')).toBeDefined()
    expect(screen.queryByTestId('cookie-settings-dialog')).toBe(null)
    expect(screen.queryByTestId('settings-button-persistent')).toBe(null)
  })

  it('should render settings dialog when dialog is visible', () => {
    mockUseCookieConsent.mockReturnValue({
      ...defaultMockActions,
      isCookieBannerVisible: false,
      isCookieSettingsDialogVisible: true,
      isConsentSet: false,
    })

    render(<CookieConsentManager />)

    expect(screen.getByTestId('cookie-settings-dialog')).toBeDefined()
    expect(screen.queryByTestId('cookie-banner')).toBe(null)
    expect(screen.queryByTestId('settings-button-persistent')).toBe(null)
  })

  it('should render settings button when consent is set', () => {
    mockUseCookieConsent.mockReturnValue({
      ...defaultMockActions,
      isCookieBannerVisible: false,
      isCookieSettingsDialogVisible: false,
      isConsentSet: true,
    })

    render(<CookieConsentManager />)

    expect(screen.getByTestId('settings-button-persistent')).toBeDefined()
    expect(screen.queryByTestId('cookie-banner')).toBe(null)
    expect(screen.queryByTestId('cookie-settings-dialog')).toBe(null)
  })
})
