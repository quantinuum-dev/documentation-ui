import { type CookieCategory, CookieCategoryName } from '../gdpr/types'

// Update the following value every time you change the categories or cookies.
// Bumping the version will invalidate previous consents stored in users' browsers and prompt them to review and accept the updated cookie settings.
export const isGDPRCookiesFlagEnabled = false // This value typically should come from feature flag or configuration for now will be hardcoded here.
export const COOKIES_CONSENT_VERSION: number = 1.0
export const COOKIES_CONSENT_COOKIE_NAME: string = 'cookies_consent'
export const COOKIES_CONSENT_EXPIRY_DAYS: number = 365 // EU recommends 1 year according to this document https://www.edpb.europa.eu/system/files/2023-12/edpb_letter_out20230098_feedback_on_cookie_pledge_draft_principles_en.pdf.

export const CookieCategories: CookieCategory[] = [
  {
    alwaysOn: true,
    name: CookieCategoryName.Essential,
    description:
      'Required for core functionality and security. Examples: sign-in and session management, fraud prevention, storing your cookie settings and basic preferences.',
    cookies: [
      {
        name: 'myqos_id',
        description: "Stores a JSON Web Token (JWT) used to identify and authenticate the user's session securely.",
        expiry: 'Session',
      },
      {
        name: 'myqos_oat',
        description:
          'A longer-lived token used to obtain new access tokens (a refresh mechanism). It may also store extra OAuth-related session data, like authorization scope or tenant info.',
        expiry: '1 month',
      },
    ],
  },
  {
    alwaysOn: false,
    name: CookieCategoryName.Analytics,
    description:
      'Helps us understand how the site is used so we can improve content and performance. Data: pages visited, navigation events, device and browser details.',
    cookies: [
      {
        name: '_ga',
        description:
          'A first-party cookie set by Google Analytics to uniquely identify users on a website and track their activity anonymously for site analytics reports.',
        expiry: '2 years',
      },
      {
        name: '_ga_<container-id>',
        description:
          'Used to persist session state for a specific website container, distinguishing users within a single visit and maintaining information across requests.',
        expiry: '2 years',
      },
    ],
  },
]
