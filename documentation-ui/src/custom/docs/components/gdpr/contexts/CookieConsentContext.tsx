'use client'

import {
  acceptAllCookies,
  isConsentSetInCookies,
  rejectNonEssentialCookies,
  retrieveConsentCategoriesFromCookies,
  saveConsentInCookies,
} from '../service/cookie-consent-service'
import { type CookieConsent } from '../types'
import { useReducer } from 'react'
import { CookieConsentContext } from './CookieConsentShared'

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
      const isConsentSet = isConsentSetInCookies(action.version)
      return {
        ...state,
        isConsentSet,
        isCookieBannerVisible: !isConsentSet,
      }
    default:
      return state
  }
}

function initCookieState(version: number): CookieState {
  const isConsentSet = isConsentSetInCookies(version)
  return {
    isCookieBannerVisible: !isConsentSet,
    isCookieSettingsDialogVisible: false,
    isConsentSet,
    consent: retrieveConsentCategoriesFromCookies(),
  }
}

export const CookieConsentProvider = ({
  children,
  version,
}: {
  children: React.ReactNode
  version: number
}) => {
  const [state, dispatch] = useReducer(cookieStateReducer, version, initCookieState)

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
