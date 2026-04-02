import dynamic from 'next/dynamic'
import { CookieSettingsButton } from 'src/custom/docs/components/gdpr/_components/CookieSettingsButton/CookieSettingsButton'
import { CookieSettingsDialog } from 'src/custom/docs/components/gdpr/_components/CookieSettingsDialog/CookieSettingsDialog'
import { useCookieConsent } from 'src/custom/docs/components/gdpr/contexts/useCookieConsent'

type CookieBannerProps = {
  isOpen: boolean
  onAccept(): void
  onReject(): void
  onSettings(): void
}

const CookieBanner = dynamic<CookieBannerProps>(
  () =>
    import('src/custom/docs/components/gdpr/_components/CookieBanner/CookieBanner').then((module) => module.CookieBanner),
  { ssr: false }
)

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
