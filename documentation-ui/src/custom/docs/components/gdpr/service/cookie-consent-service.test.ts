import { COOKIES_CONSENT_COOKIE_NAME } from '../cookies-consent.config'
import { CookieCategoryName } from '../types'
import { getCookie, setCookie } from '../utils/cookies'
import {
  retrieveConsent,
  isConsentSetInCookies,
  saveConsentInCookies,
  acceptAllCookies,
  rejectNonEssentialCookies,
} from './cookie-consent-service'

vi.mock('../utils/cookies', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
}))

describe('Cookie consent service', () => {
  const defaultConsent = {
    Essential: true,
    Analytics: false,
  }

  const frozenDate = new Date('2025-11-19T12:00:00.000Z')
  const expectedExpiryDate = new Date('2026-11-19T12:00:00.000Z') // One year later

  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(frozenDate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('retrieveConsent', () => {
    it('should return the default consent when no cookie exists', () => {
      vi.mocked(getCookie).mockReturnValue(undefined)

      expect(retrieveConsent()).toEqual(defaultConsent)
      expect(getCookie).toHaveBeenCalledTimes(1)
    })

    it('should return the parsed cookie when cookie exists', () => {
      const savedConsent = { Essential: true, Analytics: true }
      vi.mocked(getCookie).mockReturnValue(JSON.stringify(savedConsent))

      expect(retrieveConsent()).toEqual(savedConsent)
    })

    it('should throw an error when cookie contains invalid JSON', () => {
      vi.mocked(getCookie).mockReturnValue('invalid-json')

      expect(() => retrieveConsent()).toThrow('Invalid cookie consent data')
    })
  })

  describe('isConsentSetInCookies', () => {
    it('should return true when the cookie exists', () => {
      vi.mocked(getCookie).mockReturnValue('some-value')

      expect(isConsentSetInCookies()).toBe(true)
      expect(getCookie).toHaveBeenCalledTimes(1)
    })

    it('should return false when the cookie does not exist', () => {
      vi.mocked(getCookie).mockReturnValue(undefined)

      expect(isConsentSetInCookies()).toBe(false)
    })
  })

  describe('saveConsentInCookies', () => {
    it('should call setCookie with the correct cookie data AND the expected expiry date', () => {
      const consent = { Essential: true, Analytics: true }

      saveConsentInCookies(consent)

      expect(setCookie).toHaveBeenCalledTimes(1)
      expect(setCookie).toHaveBeenCalledWith(
        expect.objectContaining({
          name: COOKIES_CONSENT_COOKIE_NAME,
          value: JSON.stringify(consent),
          path: '/',
          sameSite: 'lax',
          expires: expectedExpiryDate,
        })
      )
    })
  })

  describe('acceptAllCookies', () => {
    it('should set all cookie categories to true', () => {
      acceptAllCookies()

      const expectedConsent = Object.fromEntries(Object.values(CookieCategoryName).map((category) => [category, true]))

      expect(setCookie).toHaveBeenCalledWith(
        expect.objectContaining({
          name: COOKIES_CONSENT_COOKIE_NAME,
          value: JSON.stringify(expectedConsent),
          path: '/',
          sameSite: 'lax',
          expires: expectedExpiryDate,
        })
      )
      expect(setCookie).toHaveBeenCalledTimes(1)
    })
  })

  describe('rejectNonEssentialCookies', () => {
    it('should set a cookie with only the "Essential" category as true', () => {
      rejectNonEssentialCookies()

      const expectedConsent = Object.fromEntries(
        Object.values(CookieCategoryName).map((category) => [
          category,
          category === CookieCategoryName.Essential, // Will be true only for Essential
        ])
      )

      expect(setCookie).toHaveBeenCalledWith(
        expect.objectContaining({
          name: COOKIES_CONSENT_COOKIE_NAME,
          value: JSON.stringify(expectedConsent),
          path: '/',
          sameSite: 'lax',
          expires: expectedExpiryDate,
        })
      )
      expect(setCookie).toHaveBeenCalledTimes(1)
    })
  })
})
