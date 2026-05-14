'use client'

import { type PropsWithChildren, type ReactNode } from 'react'
import { useCookieConsent } from '../../contexts/useCookieConsent'
import { type CookieCategoryName } from '../../types'

type CookieConditionalProps = PropsWithChildren<{
  category: CookieCategoryName
  fallback?: ReactNode
}>

export function CookieConditional({ category, fallback = null, children }: CookieConditionalProps) {
  const { consent } = useCookieConsent()

  if (!consent[category]) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
