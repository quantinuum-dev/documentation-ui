
import {createRoot} from "react-dom/client" 
import { DocsNavBar, CookieCategoryName, CookieConsentProvider, CookieConsentManager, CookieConditional } from "@quantinuum/documentation-ui";
import { GoogleAnalytics } from '@next/third-parties/google';
import { ComponentProps } from "react"; // do not remove

const GA_ID = __NEXT_PUBLIC_GA_ID__;

  (() => {
    const mountElement = document.querySelector('.nexus-nav')
    if (!mountElement) return
    const renderIn = document.createElement('div')
    mountElement.appendChild(renderIn)
  
    const root = createRoot(renderIn)

    root.render(
      <div className="use-tailwind">
        <div className="antialiased" style={{fontFamily: `Inter, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`}}>
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
