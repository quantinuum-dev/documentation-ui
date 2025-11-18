import { CookiePreferences } from './CookiePreferences'
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('Cookie Preferences Component', () => {
  it('should render as expected', () => {
    render(<CookiePreferences />)

    const dialog = document.querySelector('[role="dialog"]') // We target like this because the Dialog component renders outside the main tree in a portal
    expect(dialog).toMatchSnapshot()
  })
})
