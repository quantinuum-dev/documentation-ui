import { CookieBanner } from './CookieBanner'
import { render } from '@testing-library/react'
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest'

vi.mock('@quantinuum/quantinuum-ui', () => ({
  Button: (props: any) => (
    <button aria-label="button" {...props}>
      {props.children}
    </button>
  ),
  Dialog: (props: any) => <div aria-label="dialog">{props.children}</div>,
  DialogContent: (props: any) => <div aria-label="dialog-content">{props.children}</div>,
}))

const defaultProps = {
  isOpen: true,
  onAccept: vi.fn(),
  onReject: vi.fn(),
  onSettings: vi.fn(),
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Cookie Banner Component', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query.includes('max-width: 767px'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  describe('mobile', () => {
    beforeEach(() => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query.includes('max-width: 767px'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    })

    it('should render as expected', () => {
      const { asFragment } = render(<CookieBanner {...defaultProps} />)
      expect(asFragment()).toMatchSnapshot()
    })
  })

  describe('desktop', () => {
    beforeEach(() => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    })

    it('should render as expected', () => {
      const { asFragment } = render(<CookieBanner {...defaultProps} />)
      expect(asFragment()).toMatchSnapshot()
    })
  })
})
