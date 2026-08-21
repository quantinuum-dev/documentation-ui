
import { bootstrapGoogleAnalytics, CookieConsentManager, CookieConsentProvider, DocsNavBar, GoogleAnalyticsWithConsent } from "@quantinuum/documentation-ui";
import { createRoot } from "react-dom/client";

const GA_ID = __NEXT_PUBLIC_GA_ID__;

const tailwindScopeClassName = 'use-tailwind';

const isTailwindDialogPortalElement = (element: Element): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false

  const { classList } = element
  return (
    classList.contains('fixed') &&
    classList.contains('z-50') &&
    (classList.contains('inset-0') || element.getAttribute('role') === 'dialog')
  )
}

const scopeTailwindDialogPortalElements = (root: ParentNode = document.body) => {
  const scopeElement = (element: Element) => {
    if (isTailwindDialogPortalElement(element)) {
      element.classList.add(tailwindScopeClassName)
    }
  }

  if (root instanceof Element) {
    scopeElement(root)
  }

  root.querySelectorAll('[class][data-state], [class][role="dialog"]').forEach(scopeElement)
}

const observeTailwindDialogPortalElements = () => {
  scopeTailwindDialogPortalElements()

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          scopeTailwindDialogPortalElements(node)
        }
      })
    })
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

(() => {
  const mountElement = document.querySelector('.nexus-nav')
  if (!mountElement) return

  const analyticsEnabled = mountElement.getAttribute('data-analytics-enabled') === 'true'

  // Bootstrap GA synchronously, before React mounts, so the first `page_view`
  // is dispatched without waiting for hydration and passive-effect scheduling.
  // The render below still includes GoogleAnalyticsWithConsent, whose bootstrap
  // is idempotent (a no-op once this call has run) and which handles subsequent
  // live consent changes.
  if (analyticsEnabled && GA_ID) {
    bootstrapGoogleAnalytics(GA_ID)
  }

  observeTailwindDialogPortalElements()

  const renderIn = document.createElement('div')
  mountElement.appendChild(renderIn)

  const root = createRoot(renderIn)

  root.render(
    <div className={tailwindScopeClassName}>
      <div className="antialiased" style={{ fontFamily: `Inter, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"` }}>
        <CookieConsentProvider version={1}>
          {analyticsEnabled && GA_ID && <GoogleAnalyticsWithConsent gaId={GA_ID} />}
          <DocsNavBar activePath="/" />
          <CookieConsentManager />
        </CookieConsentProvider>
      </div>
    </div>
  )
})()
