'use client'

import { lazy, Suspense, useEffect, useState } from 'react'
import { CookieSettingsButton } from 'src/custom/docs/components/gdpr/_components/CookieSettingsButton/CookieSettingsButton'
import { CookieSettingsDialog } from 'src/custom/docs/components/gdpr/_components/CookieSettingsDialog/CookieSettingsDialog'
import { useCookieConsent } from 'src/custom/docs/components/gdpr/contexts/useCookieConsent'

const CookieBanner = lazy(() =>
  import('src/custom/docs/components/gdpr/_components/CookieBanner/CookieBanner').then(
    (module) => ({ default: module.CookieBanner })
  )
)

export function CookieConsentManager() {
  // Guard against SSR: only render the lazy-loaded banner after client mount.
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const {
    isCookieBannerVisible,
    isCookieSettingsDialogVisible,
    acceptAll,
    rejectNonEssential,
    openSettings,
    saveConsent,
    closeCookieSettingsDialog,
    isConsentSet,
  } = useCookieConsent()

  if (isCookieSettingsDialogVisible) {
    return (
      <CookieSettingsDialog
        isOpen
        acceptAll={acceptAll}
        saveConsent={saveConsent}
        onClose={closeCookieSettingsDialog}
      />
    )
  }

  if (isConsentSet) {
    return <CookieSettingsButton onCookiesSettingsButtonClick={openSettings} />
  }

  if (isCookieBannerVisible) {
    if (!isMounted) {
      return null
    }
    return (
      <Suspense fallback={null}>
        <CookieBanner
          isOpen
          onAccept={acceptAll}
          onReject={rejectNonEssential}
          onSettings={openSettings}
        />
      </Suspense>
    )
  }

  return null
}
