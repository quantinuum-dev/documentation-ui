/**
 * JSDOM doesn't implement PointerEvent so we need to mock our own implementation
 * Default to mouse left click interaction
 * https://github.com/radix-ui/primitives/issues/1822
 * https://github.com/jsdom/jsdom/pull/2666
 */
class MockPointerEvent extends Event {
  button: number
  ctrlKey: boolean
  pointerType: string

  constructor(type: string, props: PointerEventInit) {
    super(type, props)
    this.button = props.button || 0
    this.ctrlKey = props.ctrlKey || false
    this.pointerType = props.pointerType || 'mouse'
  }
}

if (typeof window !== 'undefined') {
  window.PointerEvent = MockPointerEvent as any
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  window.HTMLElement.prototype.releasePointerCapture = vi.fn()
  window.HTMLElement.prototype.hasPointerCapture = vi.fn()
  const ResizeObserverMock = vi.fn(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
  const MatchMediaMock = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

  // Stub the global ResizeObserver
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)

  // Stub the global matchMedia
  vi.stubGlobal('matchMedia', MatchMediaMock)
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => ({}),
  useSelectedLayoutSegment: () => {},
}))

vi.mock('next/router', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => ({}),
}))
vi.useFakeTimers({ shouldAdvanceTime: true })
