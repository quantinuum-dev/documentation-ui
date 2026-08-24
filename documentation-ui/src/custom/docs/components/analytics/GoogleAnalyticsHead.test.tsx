import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GoogleAnalyticsHead } from './GoogleAnalyticsHead'

const TEST_GA_ID = 'G-TEST12345'

describe('GoogleAnalyticsHead', () => {
  it('renders nothing without a measurement id', () => {
    expect(renderToStaticMarkup(<GoogleAnalyticsHead gaId="" />)).toBe('')
  })

  it('renders an ordered parser-time bootstrap', () => {
    const markup = renderToStaticMarkup(<GoogleAnalyticsHead gaId={TEST_GA_ID} />)

    const consentDefaultIndex = markup.indexOf("gtag('consent', 'default'")
    const configIndex = markup.indexOf("gtag('config', gaId)")
    const consentUpdateIndex = markup.indexOf("gtag('consent', 'update'")
    const loaderIndex = markup.indexOf("document.createElement('script')")
    const appendIndex = markup.indexOf('document.head.appendChild(script)')

    expect(consentDefaultIndex).toBeGreaterThanOrEqual(0)
    expect(configIndex).toBeGreaterThan(consentDefaultIndex)
    expect(consentUpdateIndex).toBeGreaterThan(configIndex)
    expect(loaderIndex).toBeGreaterThan(consentUpdateIndex)
    expect(appendIndex).toBeGreaterThan(loaderIndex)
    expect(markup).toContain(`data-measurement-id="${TEST_GA_ID}"`)
    expect(markup).toContain('https://www.googletagmanager.com/gtag/js?id=')
    expect(markup).not.toContain('wait_for_update')
  })

  it('applies a CSP nonce to every script', () => {
    const markup = renderToStaticMarkup(
      <GoogleAnalyticsHead gaId={TEST_GA_ID} nonce="test-nonce" />
    )

    expect(markup.match(/nonce="test-nonce"/g)).toHaveLength(1)
    expect(markup).toContain('script.nonce = bootstrap.nonce')
  })
})
