import { CookiePreferencesDialog } from './CookiePreferencesDialog'
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('CookiePreferencesDialog component', () => {
  it('should render as expected', () => {
    render(<CookiePreferencesDialog />)

    const dialog = document.querySelector('[role="dialog"]') // We target like this because the Dialog component renders outside the main tree in a portal
    expect(dialog).toMatchSnapshot()
  })
})
