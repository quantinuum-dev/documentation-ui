import { type Cookie, SameSite, type CookieMap } from '../types'

// Cookies values cannot contain certain characters (;,=, whitespace), so we must encode(serialize) before storing the information in them.
export function serializeCookie({
  name,
  value = '',
  path = '/', // By default "/" will make the cookie available for all paths in the domain
  domain,
  expires,
  sameSite = SameSite.Lax,
}: Cookie): string {
  if (!name) {
    throw new Error('Cookie name is required')
  }

  const parts: string[] = []

  parts.push(`${name}=${encodeURIComponent(value)}`)

  if (path) {
    parts.push(`Path=${path}`)
  }

  if (domain) {
    parts.push(`Domain=${domain}`)
  }

  if (expires) {
    parts.push(`Expires=${expires.toUTCString()}`)
  }

  if (sameSite) {
    parts.push(`SameSite=${sameSite}`)
  }

  return parts.join('; ')
}

function isCookieStringEmpty(cookieString: string): boolean {
  return !cookieString.trim()
}

function splitCookies(cookieString: string): string[] {
  return cookieString.split(/;\s*/) // Cookies are separated by semicolons and optional whitespace, so every time we see one we split the string
}

function cookieName(pair: string): string {
  const separatorIndex = pair.indexOf('=')
  if (separatorIndex >= 0) {
    return pair.slice(0, separatorIndex).trim() // If there is an equal sign, return the part BEFORE it as the name
  }

  return pair.trim() // If no equal sign, the whole string is the name
}

function cookieValue(pair: string): string {
  const separatorIndex = pair.indexOf('=')

  if (separatorIndex >= 0) {
    return decodeURIComponent(pair.slice(separatorIndex + 1).trim()) // If there is an equal sign, return the part AFTER it as the value
  }

  return ''
}

export function deserializeCookies(cookieString: string): CookieMap {
  if (isCookieStringEmpty(cookieString)) {
    return new Map() // Returning an empty Map so we will not crash when there are no cookies
  }

  const cookiePairs: [string, string][] = splitCookies(cookieString).map((pair) => {
    return [cookieName(pair), cookieValue(pair)]
  })

  return new Map(cookiePairs)
}

export function getCookie(name: string): string | undefined {
  const cookies = deserializeCookies(document.cookie)
  const value = cookies.get(name)

  return value || undefined
}

export function setCookie(cookie: Cookie) {
  document.cookie = serializeCookie(cookie)
}
