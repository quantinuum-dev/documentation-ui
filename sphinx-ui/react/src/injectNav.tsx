
import { CookieCategoryName, CookieConditional, CookieConsentManager, CookieConsentProvider, DocsNavBar } from "@quantinuum/documentation-ui";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";

const GA_ID = __NEXT_PUBLIC_GA_ID__;

const tailwindScopeClassName = 'use-tailwind';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][]
  gtag?: (...args: unknown[]) => void
}

const GoogleAnalytics = ({ gaId }: { gaId: string }) => {
  useEffect(() => {
    if (!gaId) return

    const analyticsWindow = window as AnalyticsWindow
    analyticsWindow.dataLayer = analyticsWindow.dataLayer || []
    analyticsWindow.gtag =
      analyticsWindow.gtag ||
      ((...args: unknown[]) => {
        analyticsWindow.dataLayer?.push(args)
      })

    analyticsWindow.gtag('js', new Date())
    analyticsWindow.gtag('config', gaId)

    const scriptId = 'quantinuum-google-analytics'
    const scriptUrl = new URL('https://www.googletagmanager.com/gtag/js')
    scriptUrl.searchParams.set('id', gaId)

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existingScript) {
      if (existingScript.src !== scriptUrl.toString()) {
        existingScript.src = scriptUrl.toString()
      }
      return
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.async = true
    script.src = scriptUrl.toString()
    document.head.appendChild(script)
  }, [gaId])

  return null
}

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

  observeTailwindDialogPortalElements()

  const renderIn = document.createElement('div')
  mountElement.appendChild(renderIn)

  const root = createRoot(renderIn)

  root.render(
    <div className={tailwindScopeClassName}>
      <div className="antialiased" style={{ fontFamily: `Inter, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"` }}>
        <CookieConsentProvider version={1}>
          <CookieConditional category={CookieCategoryName.Analytics} fallback={null}>
            {GA_ID && <GoogleAnalytics gaId={GA_ID} />}
          </CookieConditional>
          <DocsNavBar activePath="/" />
          <CookieConsentManager />
        </CookieConsentProvider>
      </div>
    </div>
  )
})()
