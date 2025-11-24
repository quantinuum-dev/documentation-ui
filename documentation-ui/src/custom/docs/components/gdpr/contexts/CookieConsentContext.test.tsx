import {
  acceptAllCookies,
  isConsentSetInCookies,
  rejectNonEssentialCookies,
  saveConsentInCookies,
} from '../service/cookie-consent-service'
import { CookieConsentProvider, useCookieConsent } from './CookieConsentContext'
import { act, renderHook } from '@testing-library/react'
import React from 'react'

vi.mock('../service/cookie-consent-service', () => ({
  isConsentSetInCookies: vi.fn(),
  saveConsentInCookies: vi.fn(),
  acceptAllCookies: vi.fn(),
  rejectNonEssentialCookies: vi.fn(),
}))

vi.mock('../cookies-consent.config', () => ({
  isGDPRCookiesFlagEnabled: true,
}))

const setup = () =>
  renderHook(() => useCookieConsent(), {
    wrapper: ({ children }: { children: React.ReactNode }) => <CookieConsentProvider>{children}</CookieConsentProvider>,
  })

describe('CookieConsentContext', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('isCookieBannerVisible state', () => {
    it('should have "isCookieBannerVisible" to be true when consent is not set', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(false)

      const { result } = setup()

      expect(result.current.isCookieBannerVisible).toBe(true)
    })

    it('should have "isCookieBannerVisible" to be false when consent is already set', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(true)

      const { result } = setup()

      expect(result.current.isCookieBannerVisible).toBe(false)
    })
  })

  describe('isCookieSettingsDialogVisible state', () => {
    it('should have "isCookieSettingsDialogVisible" to be false initially', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(false)
      const { result } = setup()

      expect(result.current.isCookieSettingsDialogVisible).toBe(false)
    })

    it('should open the cookie settings dialog when openSettings is called', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(false)
      const { result } = setup()
      expect(result.current.isCookieSettingsDialogVisible).toBe(false)

      act(() => {
        result.current.openSettings()
      })

      expect(result.current.isCookieSettingsDialogVisible).toBe(true)
    })

    it('should close the cookie settings dialog when closeCookieSettingsDialog is called', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(false)
      const { result } = setup()

      act(() => {
        result.current.openSettings()
      })
      expect(result.current.isCookieSettingsDialogVisible).toBe(true)

      act(() => {
        result.current.closeCookieSettingsDialog()
      })

      expect(result.current.isCookieSettingsDialogVisible).toBe(false)
    })
  })

  describe('isConsentSet state', () => {
    it('should have "isConsentSet" to be false when cookies consent is not set', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(false)
      const { result } = setup()

      expect(result.current.isConsentSet).toBe(false)
    })

    it('should have "isConsentSet" to be true when cookies consent is already set', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(true)
      const { result } = setup()

      expect(result.current.isConsentSet).toBe(true)
    })

    it('should have "isConsentSet" to be true when "acceptAll" is called', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(false)
      const { result } = setup()

      expect(result.current.isConsentSet).toBe(false)

      act(() => {
        result.current.acceptAll()
      })

      expect(vi.mocked(acceptAllCookies)).toHaveBeenCalledTimes(1)
      expect(result.current.isConsentSet).toBe(true)
    })

    it('should have "isConsentSet" to be true when "rejectNonEssential" is called', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(false)
      const { result } = setup()

      expect(result.current.isConsentSet).toBe(false)

      act(() => {
        result.current.rejectNonEssential()
      })

      expect(vi.mocked(rejectNonEssentialCookies)).toHaveBeenCalledTimes(1)
      expect(result.current.isConsentSet).toBe(true)
    })

    it('should have "isConsentSet" to be true when "saveConsent" is called', () => {
      vi.mocked(isConsentSetInCookies).mockReturnValue(false)
      const { result } = setup()
      const mockConsent = { Essential: true, Analytics: false }

      expect(result.current.isConsentSet).toBe(false)

      act(() => {
        result.current.saveConsent(mockConsent)
      })

      expect(vi.mocked(saveConsentInCookies)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(saveConsentInCookies)).toHaveBeenCalledWith(mockConsent)
      expect(result.current.isConsentSet).toBe(true)
    })
  })

  describe('CookieConsentContext hook error handling', () => {
    it('should throw an error when "useCookieConsent" is used outside of CookieConsentProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => renderHook(() => useCookieConsent())).toThrow(
        '"useCookieConsent" hook was called outside of CookieConsentProvider'
      )

      consoleSpy.mockRestore()
    })
  })
})
