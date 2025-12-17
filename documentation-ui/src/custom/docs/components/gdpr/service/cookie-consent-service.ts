import { COOKIES_CONSENT_COOKIE_NAME, COOKIES_CONSENT_EXPIRY_DAYS } from '../cookies-consent.config'
import { type Cookie, CookieCategoryName, type CookieConsent, type CookieValue, SameSite } from '../types'
import { deleteCookie, getCookieValue, setCookie } from '../utils/cookies'
import { mapValues } from 'remeda'
import { z } from 'zod'

const defaultConsent: CookieConsent = {
  Essential: true,
  Analytics: false,
}

// Auto-generated schema based on CookieCategoryName enum
export const CookieConsentSchema = z.object(mapValues(CookieCategoryName, () => z.boolean()))

export const CookieValueSchema = z.object({
  consentVersion: z.number(),
  dateConsentWasGiven: z.string().datetime(),
  consentCategories: CookieConsentSchema,
})

export function matchesConsentCookieSchema(parsedCookieValue: unknown): boolean {
  return CookieValueSchema.safeParse(parsedCookieValue).success
}

export function retrieveConsentCategoriesFromCookies(): CookieConsent {
  const cookieValue = getCookieValue(COOKIES_CONSENT_COOKIE_NAME)
  if (!cookieValue) {
    return defaultConsent
  }

  try {
    const parsedCookieValue = JSON.parse(cookieValue)

    if (matchesConsentCookieSchema(parsedCookieValue)) {
      return parsedCookieValue.consentCategories
    } else {
      // If the cookie does not match the expected schema
      // then we delete it to avoid keeping invalid data
      deleteCookie(COOKIES_CONSENT_COOKIE_NAME)
      throw new Error('Cookie does not match expected schema')
    }
  } catch (error) {
    deleteCookie(COOKIES_CONSENT_COOKIE_NAME)
    throw new Error('Cookie contains invalid JSON')
  }
}

export function hasCorrectConsentVersion(cookieValue: CookieValue, currentVersion: number): boolean {
  if (cookieValue.consentVersion === currentVersion) {
    return true
  }

  // If consent version is outdated, delete the cookie to prompt for new consent
  deleteCookie(COOKIES_CONSENT_COOKIE_NAME)
  return false
}

export function isConsentSetInCookies(currentVersion: number): boolean {
  // In order consent to be considered set:
  // 1. the cookie must exist
  // 2. the consent version must be the same as the one we have set in our config file
  // 3. the cookie must match the expected schema

  const cookieValue = getCookieValue(COOKIES_CONSENT_COOKIE_NAME)

  if (!cookieValue) {
    return false
  }

  const parsedCookieValue = JSON.parse(cookieValue)

  return hasCorrectConsentVersion(parsedCookieValue, currentVersion) && matchesConsentCookieSchema(parsedCookieValue)
}

export function constructConsentCookieValue(consent: CookieConsent, currentVersion: number): CookieValue {
  const cookieValue: CookieValue = {
    consentVersion: currentVersion,
    dateConsentWasGiven: new Date().toISOString(),
    consentCategories: consent,
  }

  return cookieValue
}

export function saveConsentInCookies(newConsent: CookieConsent, currentVersion: number) {
  const cookie: Cookie = {
    name: COOKIES_CONSENT_COOKIE_NAME,
    value: JSON.stringify(constructConsentCookieValue(newConsent, currentVersion)),
    path: '/', // "/" Will set the cookie for all routes WITHIN nexus.quantinuum.com and will not leak to other subdomains
    sameSite: SameSite.Lax,
    expires: new Date(Date.now() + COOKIES_CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
  }

  setCookie(cookie)
}

export function acceptAllCookies(currentVersion: number) {
  const consent: Record<CookieCategoryName, true> = mapValues(CookieCategoryName, (_) => true as const)

  saveConsentInCookies(consent, currentVersion)
}

export function rejectNonEssentialCookies(currentVersion: number) {
  const consent: Record<CookieCategoryName, boolean> = mapValues(
    CookieCategoryName,
    (_, name) => name === CookieCategoryName.Essential
  )

  saveConsentInCookies(consent, currentVersion)
}
