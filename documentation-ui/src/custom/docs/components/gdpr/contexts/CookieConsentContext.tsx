'use client'

import {
  acceptAllCookies,
  isConsentSetInCookies,
  rejectNonEssentialCookies,
  saveConsentInCookies,
} from '../service/cookie-consent-service'
import { type CookieConsent } from '../types'
import { isGDPRCookiesFlagEnabled } from 'app/_components/gdpr/cookies-consent.config'
import { createContext, useContext, useEffect, useState } from 'react'

type CookieConsentContextType = {
  acceptAll: () => void
  closeCookiePreferencesDialog: () => void
  isConsentSet: boolean
  isCookieBannerVisible: boolean
  isCookiePreferencesDialogVisible: boolean
  openSettings: () => void
  rejectNonEssential: () => void
  saveConsent: (consent: CookieConsent) => void
}

export const CookieConsentContext = createContext<CookieConsentContextType | null>(null)

export const CookieConsentProvider = ({ children }: { children: React.ReactNode }) => {
  const [isCookieBannerVisible, setIsCookieBannerVisible] = useState(false)
  const [isCookiePreferencesDialogVisible, setIsCookiePreferencesDialogVisible] = useState(false)
  const [isConsentSet, setIsConsentSet] = useState(false)

  function acceptAll() {
    acceptAllCookies()
    setIsCookieBannerVisible(false)
    setIsCookiePreferencesDialogVisible(false)
    setIsConsentSet(true && isGDPRCookiesFlagEnabled) // Consent cannot be true if isGDPRCookiesFlagEnabled is false. If for whatever reason the banner is disabled then all non-non optional scripts should be off as well
  }

  function rejectNonEssential() {
    rejectNonEssentialCookies()
    setIsCookieBannerVisible(false)
    setIsConsentSet(true && isGDPRCookiesFlagEnabled)
  }

  function openSettings() {
    setIsCookieBannerVisible(false)
    setIsCookiePreferencesDialogVisible(true && isGDPRCookiesFlagEnabled) // Dialog should not open if banner is disabled
  }

  function saveConsent(consent: CookieConsent) {
    saveConsentInCookies(consent)
    setIsCookiePreferencesDialogVisible(false)
    setIsConsentSet(true && isGDPRCookiesFlagEnabled)
  }

  function closeCookiePreferencesDialog() {
    setIsCookiePreferencesDialogVisible(false)
    setIsCookieBannerVisible(true && isGDPRCookiesFlagEnabled)
  }

  useEffect(() => {
    if (isConsentSetInCookies()) {
      setIsConsentSet(true && isGDPRCookiesFlagEnabled)
    } else {
      setIsCookieBannerVisible(true && isGDPRCookiesFlagEnabled)
    }
  }, [])

  return (
    <CookieConsentContext.Provider
      value={{
        isCookieBannerVisible,
        isCookiePreferencesDialogVisible,
        isConsentSet,
        acceptAll,
        rejectNonEssential,
        openSettings,
        saveConsent,
        closeCookiePreferencesDialog,
      }}
    >
      {children}
    </CookieConsentContext.Provider>
  )
}

export const useCookieConsent = (): CookieConsentContextType => {
  const ctx = useContext(CookieConsentContext)

  if (!ctx) {
    throw new Error('"useCookieConsent" hook was called outside of CookieConsentProvider')
  }

  return ctx
}
