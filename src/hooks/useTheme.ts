import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

/** Must match --bg in global.scss for each theme. */
const STATUS_BAR_COLOR = {
  light: '#f4faf7',
  dark: '#0e1714',
} as const

export function useTheme() {
  const theme = useAppStore((state) => state.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    // Keeps the Android/desktop PWA status bar in step with the in-app toggle,
    // which a static meta tag cannot do.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = STATUS_BAR_COLOR[theme]
  }, [theme])

  return theme
}
