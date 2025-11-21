import { COOKIES_CONSENT_COOKIE_NAME, COOKIES_CONSENT_EXPIRY_DAYS } from '../cookies-consent.config'
import { type Cookie, type CookieConsent, SameSite, CookieCategoryName } from '../types'
import { getCookie, setCookie } from '../utils/cookies'
import { mapValues } from 'remeda'
import { z } from 'zod'

const defaultConsent: CookieConsent = {
  Essential: true,
  Analytics: false,
}

// Auto-generated schema based on CookieCategoryName enum
export const CookieConsentSchema = z.object(mapValues(CookieCategoryName, () => z.boolean()))

export function isValidCookieConsent(data: unknown) {
  return CookieConsentSchema.safeParse(data).success
}

export function retrieveConsent(): CookieConsent {
  const cookieValue = getCookie(COOKIES_CONSENT_COOKIE_NAME)

  if (!cookieValue) {
    return defaultConsent
  }

  try {
    const parsedConsentCookieValue = JSON.parse(cookieValue)

    if (isValidCookieConsent(parsedConsentCookieValue)) {
      return parsedConsentCookieValue
    } else {
      throw new Error('Invalid cookie consent data')
    }
  } catch (error) {
    throw new Error('Invalid cookie consent data')
  }
}

export function isConsentSetInCookies(): boolean {
  return !!getCookie(COOKIES_CONSENT_COOKIE_NAME)
}

export function saveConsentInCookies(newConsent: CookieConsent) {
  const cookie: Cookie = {
    name: COOKIES_CONSENT_COOKIE_NAME,
    value: JSON.stringify(newConsent),
    path: '/', // "/" Will set the cookie for all routes WITHIN nexus.quantinuum.com and will not leak to other subdomains
    sameSite: SameSite.Lax,
    expires: new Date(Date.now() + COOKIES_CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  }

  setCookie(cookie)
}

export function acceptAllCookies() {
  const consent: Record<CookieCategoryName, true> = mapValues(CookieCategoryName, (_) => true as const)

  saveConsentInCookies(consent)
}

export function rejectNonEssentialCookies() {
  const consent: Record<CookieCategoryName, boolean> = mapValues(
    CookieCategoryName,
    (_, name) => name === CookieCategoryName.Essential
  )

  saveConsentInCookies(consent)
}

// The function/logic below on how we enable/disable scripts might change, is pending testing to see if this approach will work
export function isCookieCategoryEnabled(category: CookieCategoryName): boolean {
  const consent = retrieveConsent()
  return consent[category]
}

export function onGrantedConsent(category: CookieCategoryName, callback: () => void) {
  if (isCookieCategoryEnabled(category)) {
    callback()
  }
}
