# GDPR Component - A lightweight cookie management solution

This component manages user consent for cookies in compliance with GDPR regulations.
It provides a user interface for users to accept or reject different categories of cookies and stores their preferences on the client side in a cookie called `cookie_consent`.

## Architecture

The GDPR component is organized into several directories within this folder:

- **`_components/`** - Contains UI components used to build the GDPR interface (e.g., `CookieBanner`, `CookiePreferencesDialog`)
- **`service/`** - Contains the core business logic for consent management (checking if consent is set, if specific categories are accepted, etc.)
- **`contexts/`** - Manages UI state (whether the banner or dialog is open, etc.)
- **`utils/`** - Utility functions for cookie manipulation and serialization

## Configuration

The GDPR component is configured through `cookies-consent.config.ts`, which defines:

### Global Settings

- **`COOKIES_CONSENT_VERSION`** - Version number that invalidates previous consents when changed (currently `1.0`)
- **`COOKIES_CONSENT_COOKIE_NAME`** - Name of the cookie storing user preferences (`'cookies_consent'`)
- **`COOKIES_CONSENT_EXPIRY_DAYS`** - Cookie expiration period in days (`365` days, following EU recommendations)

### Cookie Categories

The component supports at the moment two main categories:

- **Essential Cookies** - Required for core functionality and cannot be disabled by users.
- **Analytics Cookies** - Optional cookies that users can accept or reject.

The above can be extended in the future as needed. To do so, just:

1. Expand the `CookieCategories` object in the configuration file with the new category details.
2. Update the `CookieCategoryName` enum in the types file accordingly.

> **Important:** When adding new cookies or modifying existing ones, remember to increment `COOKIES_CONSENT_VERSION` to prompt existing users to review the updated cookie policy.

## Usage

To integrate the GDPR component into your application:

1. **Wrap your component tree** with `CookieConsentProvider` where you want to use the GDPR functionality
2. **Enable the isGDPRCookiesBannerEnabled flag** to true in the `CookieConsentContext` (this can be later extended to come from a feature flag or configuration)
3. **Import the UI components** in a component that renders on every page (e.g., root layout):
   - `CookieBanner`
   - `CookiePreferencesDialog`
4. **Connect the components** by passing the necessary props from the `useCookieConsent` hook
5. **Conditionally load scripts** by importing the `onGrantedConsent` function from the service and wrapping any scripts that should only run with user consent

### Example

```tsx
// In the root layout file
import { CookieBanner } from './_components/CookieBanner/CookieBanner'
import { CookiePreferencesDialog } from './_components/CookiePreferencesDialog/CookiePreferencesDialog'
import { CookieConsentProvider } from './contexts/CookieConsentContext'
import { useCookieConsent } from './contexts/CookieConsentContext'

export function Layout({ children }) {
  return (
    <CookieConsentProvider>
      <AppComponents />
      {children}
    </CookieConsentProvider>
  )
}

function AppComponents() {
  const {
    isCookieBannerVisible,
    isCookiePreferencesDialogVisible,
    acceptAll,
    rejectNonEssential,
    openSettings,
    saveConsent,
    closeCookiePreferencesDialog,
  } = useCookieConsent()

  return (
    <>
      <CookieBanner
        isOpen={isCookieBannerVisible}
        onAccept={acceptAll}
        onReject={rejectNonEssential}
        onSettings={openSettings}
      />
      <CookiePreferencesDialog
        isOpen={isCookiePreferencesDialogVisible}
        acceptAll={acceptAll}
        saveConsent={saveConsent}
        onClose={closeCookiePreferencesDialog}
      />
    </>
  )
}
```

```tsx
// For conditional script loading
import { onGrantedConsent } from './service/cookie-consent-service'
import { CookieCategoryName } from './types'

// Only load analytics when user has consented for the specific category
onGrantedConsent(CookieCategoryName.Analytics, () => {
  // Insert here the Analytics script
  loadGoogleAnalytics()
})
```
