'use client'

import {
  acceptAllCookies,
  isConsentSetInCookies,
  rejectNonEssentialCookies,
  retrieveConsentCategoriesFromCookies,
  saveConsentInCookies,
} from '../service/cookie-consent-service'
import { type CookieConsent } from '../types'
import { useFeaturesQuery } from 'app/(dashboard)/_root_layout/Features'
import { createContext, useContext, useReducer } from 'react'

type CookieConsentContextType = {
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

type CookieState = {
  isCookieBannerVisible: boolean
  isCookieSettingsDialogVisible: boolean
  isConsentSet: boolean
  consent: CookieConsent
}

type CookieAction =
  | { type: 'ACCEPT_ALL'; version: number }
  | { type: 'REJECT_NON_ESSENTIAL'; version: number }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'SAVE_CONSENT'; consent: CookieConsent; version: number }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'INITIALIZE'; version: number }

function cookieStateReducer(state: CookieState, action: CookieAction): CookieState {
  switch (action.type) {
    case 'ACCEPT_ALL':
      acceptAllCookies(action.version)
      return {
        ...state,
        consent: retrieveConsentCategoriesFromCookies(),
        isCookieBannerVisible: false,
        isCookieSettingsDialogVisible: false,
        isConsentSet: true,
      }
    case 'REJECT_NON_ESSENTIAL':
      rejectNonEssentialCookies(action.version)
      return {
        ...state,
        consent: retrieveConsentCategoriesFromCookies(),
        isCookieBannerVisible: false,
        isConsentSet: true,
      }
    case 'OPEN_SETTINGS':
      return {
        ...state,
        isCookieBannerVisible: false,
        isCookieSettingsDialogVisible: true,
      }
    case 'SAVE_CONSENT':
      saveConsentInCookies(action.consent, action.version)
      return {
        ...state,
        consent: retrieveConsentCategoriesFromCookies(),
        isCookieSettingsDialogVisible: false,
        isConsentSet: true,
      }
    case 'CLOSE_SETTINGS':
      return {
        ...state,
        isCookieSettingsDialogVisible: false,
        isCookieBannerVisible: !state.isConsentSet,
      }
    case 'INITIALIZE':
      return {
        ...state,
        isConsentSet: isConsentSetInCookies(action.version),
        isCookieBannerVisible: !isConsentSetInCookies(action.version),
      }
    default:
      return state
  }
}

const CookieConsentProviderInner = ({ children, version }: { children: React.ReactNode; version: number }) => {
  const [state, dispatch] = useReducer(cookieStateReducer, {
    isCookieBannerVisible: !isConsentSetInCookies(version),
    isCookieSettingsDialogVisible: false,
    isConsentSet: isConsentSetInCookies(version),
    consent: retrieveConsentCategoriesFromCookies(),
  })

  function acceptAll() {
    dispatch({ type: 'ACCEPT_ALL', version })
  }

  function rejectNonEssential() {
    dispatch({ type: 'REJECT_NON_ESSENTIAL', version })
  }

  function openSettings() {
    dispatch({ type: 'OPEN_SETTINGS' })
  }

  function saveConsent(consent: CookieConsent) {
    dispatch({ type: 'SAVE_CONSENT', consent, version })
  }

  function closeCookieSettingsDialog() {
    dispatch({ type: 'CLOSE_SETTINGS' })
  }

  return (
    <CookieConsentContext.Provider
      value={{
        isCookieBannerVisible: state.isCookieBannerVisible,
        isCookieSettingsDialogVisible: state.isCookieSettingsDialogVisible,
        isConsentSet: state.isConsentSet,
        consent: state.consent,
        acceptAll,
        rejectNonEssential,
        openSettings,
        saveConsent,
        closeCookieSettingsDialog,
      }}
    >
      {children}
    </CookieConsentContext.Provider>
  )
}

export const CookieConsentProvider = ({ children }: { children: React.ReactNode }) => {
  const featuresQuery = useFeaturesQuery()

  if (!featuresQuery.data?.cookies_consent_manager.version) {
    return null
  }

  return (
    <CookieConsentProviderInner version={featuresQuery.data.cookies_consent_manager.version}>
      {children}
    </CookieConsentProviderInner>
  )
}

export const useCookieConsent = (): CookieConsentContextType => {
  const ctx = useContext(CookieConsentContext)

  if (!ctx) {
    throw new Error('"useCookieConsent" hook was called outside of CookieConsentProvider')
  }

  return ctx
}
