import {
  COOKIES_CONSENT_COOKIE_NAME,
  COOKIES_CONSENT_VERSION,
} from '../gdpr/cookies-consent.config'
import { CookieCategoryName } from '../gdpr/types'
import { DEFAULT_GOOGLE_CONSENT, GOOGLE_ANALYTICS_SCRIPT_ID } from './consent-mode'

export type GoogleAnalyticsHeadProps = {
  gaId: string
  nonce?: string
}

function bootstrapScript(): string {
  const consentCookieName = JSON.stringify(COOKIES_CONSENT_COOKIE_NAME)
  const analyticsCategoryName = JSON.stringify(CookieCategoryName.Analytics)
  const consentVersion = JSON.stringify(COOKIES_CONSENT_VERSION)
  const deniedConsent = JSON.stringify(DEFAULT_GOOGLE_CONSENT)

  return `
(function () {
  var bootstrap = document.currentScript;
  var gaId = bootstrap && bootstrap.getAttribute('data-measurement-id');
  if (!gaId) return;

  var analyticsGranted = false;
  try {
    var cookieName = ${consentCookieName};
    var cookie = document.cookie.split(';').find(function (part) {
      return part.trim().indexOf(cookieName + '=') === 0;
    });
    if (cookie) {
      var value = cookie.trim().slice(cookieName.length + 1);
      var storedConsent = JSON.parse(decodeURIComponent(value));
      var consentDate = storedConsent && storedConsent.dateConsentWasGiven;
      var consentCategories = storedConsent && storedConsent.consentCategories;
      analyticsGranted = storedConsent !== null
        && typeof storedConsent === 'object'
        && storedConsent.consentVersion === ${consentVersion}
        && typeof consentDate === 'string'
        && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(consentDate)
        && !Number.isNaN(Date.parse(consentDate))
        && consentCategories !== null
        && typeof consentCategories === 'object'
        && typeof consentCategories.Essential === 'boolean'
        && typeof consentCategories[${analyticsCategoryName}] === 'boolean'
        && storedConsent.consentCategories[${analyticsCategoryName}] === true;
    }
  } catch (_) {}

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', ${deniedConsent});
  window.gtag('consent', 'update', {
    analytics_storage: analyticsGranted ? 'granted' : 'denied'
  });
  window.gtag('js', new Date());
  window.gtag('config', gaId);

  var script = document.createElement('script');
  script.id = '${GOOGLE_ANALYTICS_SCRIPT_ID}';
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
  if (bootstrap.nonce) script.nonce = bootstrap.nonce;
  document.head.appendChild(script);
})();`.trim()
}

/**
 * Renders the Google tag in parser order for use in an SSR document `<head>`.
 * Pair it with `GoogleAnalyticsWithConsent` inside the consent provider so
 * consent changes made after page load are forwarded to Google.
 */
export function GoogleAnalyticsHead({ gaId, nonce }: GoogleAnalyticsHeadProps) {
  if (!gaId) {
    return null
  }

  return (
    <script
      data-measurement-id={gaId}
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: bootstrapScript() }}
    />
  )
}
