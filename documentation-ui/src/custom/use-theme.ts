'use client'

import React from 'react'
import { getTheme, setTheme, subscribeToTheme } from 'src/utils/darkMode'

export const useTheme = () => {
  const [theme, setLocalTheme] = React.useState(
    typeof window !== 'undefined' ? getTheme() : { mode: 'dark' as const, isDark: true }
  )

  React.useEffect(() => {
    return subscribeToTheme((nextTheme) => setLocalTheme(nextTheme))
  }, [])

  return {
    theme,
    setMode: (mode: typeof theme.mode) => setTheme(mode),
  }
}
