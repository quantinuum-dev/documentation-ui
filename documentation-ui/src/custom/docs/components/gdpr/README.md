# GDPR Component - A lightweight cookie management solution

This component manages user consent for cookies in compliance with GDPR regulations.
It provides a user interface for users to accept or reject different categories of cookies and stores their settings on the client side in a cookie called `cookies_consent`.

## Architecture

The GDPR component is organized into several directories within this folder:

- **`_components/`** - Contains UI components used to build the GDPR interface (e.g., `CookieBanner`, `CookieSettingsDialog`)
- **`service/`** - Contains the core business logic for consent management (checking if consent is set, if specific categories are accepted, etc.)
- **`contexts/`** - Manages UI state (whether the banner or dialog is open, etc.)
- **`utils/`** - Utility functions for cookie manipulation and serialization

## Configuration

The GDPR component is configured through `cookies-consent.config.ts`, which defines:

### Global Settings

- **`COOKIES_CONSENT_VERSION`** - Version number that invalidates previous consents when changed (currently `1.0`)
- **`COOKIES_CONSENT_COOKIE_NAME`** - Name of the cookie storing user settings (`'cookies_consent'`)
- **`COOKIES_CONSENT_EXPIRY_DAYS`** - Cookie expiration period in days (`365` days, following EU recommendations)

### Cookie Categories

The component supports at the moment two main categories:

- **Essential Cookies** - Required for core functionality and cannot be disabled by users.
- **Analytics Cookies** - Optional cookies that users can accept or reject.

The above can be extended in the future as needed. To do so, just:

1. Expand the `CookieCategories` object in the configuration file with the new category details.
2. Update the `CookieCategoryName` enum in the types file accordingly.

> **Important:** When adding new cookies or modifying existing ones, remember to increment `COOKIES_CONSENT_VERSION` to prompt existing users to review the updated cookie notice.

## Usage

To integrate the GDPR component into your application:

1. **Wrap your component tree** with `CookieConsentProvider` where you want to use the GDPR functionality
2. **Import the `CookieConsentManager` component** in a component that renders on every page (e.g., root layout):
3. **Conditionally load scripts** by importing the `useCookieConsent` function from the service and wrapping any scripts that should only run with user consent

### Example

```tsx
// In the root layout file
import { CookieConsentManager } from './_components/CookieConsentManager/CookieConsentManager'
import { CookieConsentProvider } from './contexts/CookieConsentContext'

export function Layout({ children }) {
  return (
    <CookieConsentProvider>
      <AppComponents />
      {children}
    </CookieConsentProvider>
  )
}

function AppComponents() {
  return (
    <>
      <CookieConsentManager />
      {/* Other app components */}
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
