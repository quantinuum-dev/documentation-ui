import { useContext } from 'react'
import { CookieConsentContext, type CookieConsentContextType } from './CookieConsentShared'

export const useCookieConsent = (): CookieConsentContextType => {
  const ctx = useContext(CookieConsentContext)

  if (!ctx) {
    throw new Error('"useCookieConsent" hook was called outside of CookieConsentProvider')
  }

  return ctx
}
