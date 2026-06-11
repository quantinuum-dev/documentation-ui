'use client'

import { type PropsWithChildren, type ReactNode } from 'react'
import { useCookieConsent } from '@/custom/docs/components/gdpr/contexts/useCookieConsent'
import { type CookieCategoryName } from '@/custom/docs/components/gdpr/types'

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
