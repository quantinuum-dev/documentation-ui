import { CookieSettingsDialog } from './CookieSettingsDialog'
import { render } from '@testing-library/react'

describe('CookieSettingsDialog component', () => {
  it('should render as expected', () => {
    const mockProps = {
      isOpen: true,
      onClose: vi.fn(),
      acceptAll: vi.fn(),
      saveConsent: vi.fn(),
    }

    render(<CookieSettingsDialog {...mockProps} />)

    const dialog = document.querySelector('[role="dialog"]') // We target like this because the Dialog component renders outside the main tree in a portal
    expect(dialog).toMatchSnapshot()
  })
})
