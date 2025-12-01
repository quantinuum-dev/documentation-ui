import { CookieBanner } from 'app/_components/gdpr/_components/CookieBanner/CookieBanner'
import { CookieSettingsButton } from 'app/_components/gdpr/_components/CookieSettingsButton/CookieSettingsButton'
import { CookieSettingsDialog } from 'app/_components/gdpr/_components/CookieSettingsDialog/CookieSettingsDialog'
import { useCookieConsent } from 'app/_components/gdpr/contexts/CookieConsentContext'

export function CookieConsentManager() {
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
    return <CookieBanner isOpen onAccept={acceptAll} onReject={rejectNonEssential} onSettings={openSettings} />
  }

  return null
}
