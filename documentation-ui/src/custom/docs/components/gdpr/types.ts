export type CookieMap = ReadonlyMap<string, string>

export enum SameSite {
  Lax = 'lax',
  Strict = 'strict',
  None = 'none',
}

export type Cookie = {
  name: string
  value?: string
  path?: string
  domain?: string
  expires?: Date
  sameSite?: SameSite
}

export type SettingsOverlayCookie = {
  name: string
  description: string
  expiry: string
}

// Cookie Categories can be extended in the future with more values i.e "Performance", "Advertising", "Other" etc.
export enum CookieCategoryName {
  Essential = 'Essential',
  Analytics = 'Analytics',
}

export type CookieCategory = {
  alwaysOn: boolean
  name: CookieCategoryName
  description: string
  cookies: SettingsOverlayCookie[]
}

export type CookieConsent = {
  [key in CookieCategoryName]: boolean
}
