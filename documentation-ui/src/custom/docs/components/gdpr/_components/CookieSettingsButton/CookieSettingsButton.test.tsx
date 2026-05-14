import { CookieSettingsButton } from './CookieSettingsButton'
import { fireEvent, render, screen } from '@testing-library/react'

describe('CookieSettingsButton', () => {
  const mockOnClick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render as  expected', () => {
    const { container } = render(<CookieSettingsButton onCookiesSettingsButtonClick={mockOnClick} />)

    expect(container).toMatchSnapshot()
  })

  it('should call "onCookiesSettingsButtonClick" when button is clicked', () => {
    render(<CookieSettingsButton onCookiesSettingsButtonClick={mockOnClick} />)

    const button = screen.getByRole('button', { name: 'Cookie settings button' })
    fireEvent.click(button)

    expect(mockOnClick).toHaveBeenCalledTimes(1)
  })
})
