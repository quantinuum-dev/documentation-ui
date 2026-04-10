import { COOKIES_CONSENT_COOKIE_NAME } from '../cookies-consent.config'
import { CookieCategoryName } from '../types'
import { getCookieValue, setCookie } from '../utils/cookies'
import {
  acceptAllCookies,
  isConsentSetInCookies,
  rejectNonEssentialCookies,
  retrieveConsentCategoriesFromCookies,
  saveConsentInCookies,
} from './cookie-consent-service'

vi.mock('../cookies-consent.config', async () => {
  const actual = await vi.importActual('../cookies-consent.config')
  return {
    ...actual,
    COOKIES_CONSENT_VERSION: 1,
  }
})

vi.mock('../utils/cookies', async () => {
  return {
    deleteCookie: vi.fn(),
    getCookieValue: vi.fn(),
    setCookie: vi.fn(),
  }
})

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

  describe('retrieveConsentCategoriesFromCookies', () => {
    it('should return the default consent when no cookie exists', () => {
      vi.mocked(getCookieValue).mockReturnValue(undefined)

      expect(retrieveConsentCategoriesFromCookies()).toEqual(defaultConsent)
      expect(getCookieValue).toHaveBeenCalledTimes(1)
    })

    it('should return the parsed cookie when cookie exists with valid schema', () => {
      const savedConsent = { Essential: true, Analytics: true }
      const validCookieValue = {
        consentVersion: 1,
        dateConsentWasGiven: '2025-11-19T12:00:00.000Z',
        consentCategories: savedConsent,
      }
      vi.mocked(getCookieValue).mockReturnValue(JSON.stringify(validCookieValue))

      expect(retrieveConsentCategoriesFromCookies()).toEqual(savedConsent)
    })

    it('should return the default consent when cookie contains invalid JSON', () => {
      vi.mocked(getCookieValue).mockReturnValue('invalid-json')

      expect(retrieveConsentCategoriesFromCookies()).toEqual(defaultConsent)
    })
  })

  describe('isConsentSetInCookies', () => {
    it('should return true when the cookie exists with valid version and schema', () => {
      const validCookieValue = {
        consentVersion: 1,
        dateConsentWasGiven: '2025-11-19T12:00:00.000Z',
        consentCategories: { Essential: true, Analytics: false },
      }
      vi.mocked(getCookieValue).mockReturnValue(JSON.stringify(validCookieValue))

      expect(isConsentSetInCookies(1)).toBe(true)
      expect(getCookieValue).toHaveBeenCalledTimes(1)
    })

    it('should return false when the cookie does not exist', () => {
      vi.mocked(getCookieValue).mockReturnValue(undefined)

      expect(isConsentSetInCookies(1)).toBe(false)
    })

    it('should return false when cookie has old version', () => {
      const cookieWithOutdatedVersion = {
        consentVersion: 2, // Above we always mock to version "1"
        dateConsentWasGiven: '2025-11-19T12:00:00.000Z',
        consentCategories: { Essential: true, Analytics: false },
      }
      vi.mocked(getCookieValue).mockReturnValue(JSON.stringify(cookieWithOutdatedVersion))

      expect(isConsentSetInCookies(1)).toBe(false)
    })

    it('should return false when cookie has invalid schema', () => {
      vi.mocked(getCookieValue).mockReturnValue(JSON.stringify({ invalid: 'data' }))

      expect(isConsentSetInCookies(1)).toBe(false)
    })
  })

  describe('saveConsentInCookies', () => {
    it('should call setCookie with the correct cookie data AND the expected expiry date', () => {
      const consent = { Essential: true, Analytics: true }

      saveConsentInCookies(consent, 1)

      expect(setCookie).toHaveBeenCalledTimes(1)
      expect(setCookie).toHaveBeenCalledWith(
        expect.objectContaining({
          name: COOKIES_CONSENT_COOKIE_NAME,
          value: JSON.stringify({
            consentVersion: 1,
            dateConsentWasGiven: frozenDate.toISOString(),
            consentCategories: consent,
          }),
          path: '/',
          sameSite: 'lax',
          expires: expectedExpiryDate,
        })
      )
    })
  })

  describe('acceptAllCookies', () => {
    it('should set all cookie categories to true', () => {
      acceptAllCookies(1)

      const expectedConsent = Object.fromEntries(
        Object.values(CookieCategoryName).map((category) => [category, true])
      )

      expect(setCookie).toHaveBeenCalledWith(
        expect.objectContaining({
          name: COOKIES_CONSENT_COOKIE_NAME,
          value: JSON.stringify({
            consentVersion: 1,
            dateConsentWasGiven: frozenDate.toISOString(),
            consentCategories: expectedConsent,
          }),
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
      rejectNonEssentialCookies(1)

      const expectedConsent = Object.fromEntries(
        Object.values(CookieCategoryName).map((category) => [
          category,
          category === CookieCategoryName.Essential, // Will be true only for Essential
        ])
      )

      expect(setCookie).toHaveBeenCalledWith(
        expect.objectContaining({
          name: COOKIES_CONSENT_COOKIE_NAME,
          value: JSON.stringify({
            consentVersion: 1,
            dateConsentWasGiven: frozenDate.toISOString(),
            consentCategories: expectedConsent,
          }),
          path: '/',
          sameSite: 'lax',
          expires: expectedExpiryDate,
        })
      )
      expect(setCookie).toHaveBeenCalledTimes(1)
    })
  })
})
