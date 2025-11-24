import { CookiePreferencesDialog } from './CookiePreferencesDialog'
import { render } from '@testing-library/react'

describe('CookiePreferencesDialog component', () => {
  it('should render as expected', () => {
    const mockProps = {
      isOpen: true,
      onClose: vi.fn(),
      acceptAll: vi.fn(),
      saveConsent: vi.fn(),
    }

    render(<CookiePreferencesDialog {...mockProps} />)

    const dialog = document.querySelector('[role="dialog"]') // We target like this because the Dialog component renders outside the main tree in a portal
    expect(dialog).toMatchSnapshot()
  })
})
