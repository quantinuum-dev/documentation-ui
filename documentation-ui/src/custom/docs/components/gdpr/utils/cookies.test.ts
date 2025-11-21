import { SameSite } from '../types'
import { serializeCookie, deserializeCookies, getCookie, setCookie } from './cookies'

describe('Cookie Utils', () => {
  describe('serializeCookie', () => {
    it('should serialize a cookie correctly', () => {
      const expires = new Date('2025-01-01T00:00:00Z')
      const cookie = serializeCookie({
        name: 'test',
        value: '12_34; =56', // Testing values with special characters
        path: '/abc',
        domain: 'example.com',
        expires: expires,
        sameSite: SameSite.Strict,
      })

      expect(cookie).toContain('test=12_34%3B%20%3D56')
      expect(cookie).toContain('Path=/abc')
      expect(cookie).toContain('Domain=example.com')
      expect(cookie).toContain(`Expires=${expires.toUTCString()}`)
      expect(cookie).toContain('SameSite=strict')
    })

    it('should throw an error if name is missing', () => {
      expect(() => serializeCookie({ name: '' })).toThrow('Cookie name is required')
    })
  })

  describe('deserializeCookies', () => {
    it('should return an empty Map for empty string', () => {
      expect(deserializeCookies('').size).toBe(0)
    })

    it('should parse a single cookie', () => {
      const cookies = deserializeCookies('foo=bar')

      expect(cookies.get('foo')).toBe('bar')
    })

    it('should parse multiple cookies', () => {
      const cookies = deserializeCookies('foo=bar; john=doe; lorem=ipsum;')
      expect(cookies.get('foo')).toBe('bar')
      expect(cookies.get('john')).toBe('doe')
      expect(cookies.get('lorem')).toBe('ipsum')
    })

    it('should deserialize correctly cookies with special characters', () => {
      const cookies = deserializeCookies('foo=a%3Db%3Bc%20d')
      expect(cookies.get('foo')).toBe('a=b;c d')
    })

    it('should return an empty string for cookies without value', () => {
      const cookies = deserializeCookies('justname=')
      expect(cookies.get('justname')).toBe('')
    })
  })

  describe('getCookie', () => {
    beforeEach(() => {
      Object.defineProperty(global.document, 'cookie', {
        writable: true,
        value: 'foo=bar',
      })
    })

    it('should retrieve correctly the value of the cookie', () => {
      expect(getCookie('foo')).toBe('bar')
    })
  })

  describe('setCookie', () => {
    beforeEach(() => {
      Object.defineProperty(global.document, 'cookie', {
        writable: true,
        value: '', // Here we empty the cookie string
      })
    })

    it('should set correctly a cookie', () => {
      setCookie({ name: 'foo', value: 'bar' })
      expect(document.cookie).toBe('foo=bar; Path=/; SameSite=lax')
    })
  })
})
