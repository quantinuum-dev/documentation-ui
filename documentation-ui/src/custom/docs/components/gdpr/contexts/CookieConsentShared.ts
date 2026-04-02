import { createContext } from 'react'
import { type CookieConsent } from '../types'

export type CookieConsentContextType = {
  acceptAll: () => void
  closeCookieSettingsDialog: () => void
  consent: CookieConsent
  isConsentSet: boolean
  isCookieBannerVisible: boolean
  isCookieSettingsDialogVisible: boolean
  openSettings: () => void
  rejectNonEssential: () => void
  saveConsent: (consent: CookieConsent) => void
}

export const CookieConsentContext = createContext<CookieConsentContextType | null>(null)
