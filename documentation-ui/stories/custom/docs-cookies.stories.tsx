import { Meta, StoryObj } from '@storybook/react'
import { CookieConsentManager, CookieConsentProvider } from 'src'

export function DocsCookiesDemo() {
  return (
    <CookieConsentProvider version={1}>
      <CookieConsentManager />
    </CookieConsentProvider>
  )
}

const meta: Meta<typeof DocsCookiesDemo> = {
  component: DocsCookiesDemo,
}

export default meta

export const Default: StoryObj<typeof DocsCookiesDemo> = {
  args: {},
}
