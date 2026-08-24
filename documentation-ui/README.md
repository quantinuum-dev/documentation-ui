# @quantinuum/documentation-ui

Quantinuum design tokens and React components.

Based on [shadcn](https://ui.shadcn.com/), an opinionated tailwind theme and radix-ui component generator. Shadcn components have been generated into this repo using the `components.json` definition and re-exported as a new library.

### Development

#### Basic commands

```bash
pnpm run storybook # Run storybook application to view components.
pnpm run build-storybook # Build storybook application as static HTML.
pnpm run build # Build component library with rollup.
```

### Design Tokens

CSS variables are declared in `src/tokens.css`. Dark mode is enabled when using the attribute `data-theme="dark"` higher up in the DOM tree. See `src/tokens.css` for more details.

### Google Analytics

Render `GoogleAnalyticsHead` in the initial server-rendered document `<head>`. It applies the valid stored Consent Mode v2 state before starting `gtag.js`, so the first automatic `page_view` is queued without waiting for React hydration. Render `GoogleAnalyticsWithConsent` inside `CookieConsentProvider` to forward consent changes made after page load.

In a Next.js App Router project, add both components to the root server layout:

```tsx
import {
  CookieConsentManager,
  CookieConsentProvider,
  GoogleAnalyticsHead,
  GoogleAnalyticsWithConsent,
} from '@quantinuum/documentation-ui'

const GA_ID = process.env.NEXT_PUBLIC_GA_ID

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>{GA_ID && <GoogleAnalyticsHead gaId={GA_ID} />}</head>
      <body>
        {children}
        <CookieConsentProvider version={1}>
          {GA_ID && <GoogleAnalyticsWithConsent gaId={GA_ID} />}
          <CookieConsentManager />
        </CookieConsentProvider>
      </body>
    </html>
  )
}
```

`GoogleAnalyticsWithConsent` retains the same consent sequence as a client-side loading fallback, but `GoogleAnalyticsHead` starts initialization earlier because it does not wait for hydration. GA4 may batch network transmission for about five seconds; `tfd` measures transmission time, not when `config` queued the page view. Pass `nonce` to `GoogleAnalyticsHead` when the page uses a nonce-based Content Security Policy.

Upgrade the consuming project to a package release that exports `GoogleAnalyticsHead` before adding this import.

### Semantic release

This package uses semantic-release for creating releases. So that the version numbers are incremented appropriately, commits should conform to the Angular Commit Message Conventions.

A pre-commit hook that enforces this can be installed by running:

```bash
pipx install prek
prek install --hook-type commit-msg
```
