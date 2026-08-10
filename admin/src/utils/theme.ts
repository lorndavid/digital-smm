/**
 * Admin panel theme manager.
 * Default is LIGHT (white background, black text); dark mode is persisted
 * per browser via localStorage.
 */
const KEY = 'digitalsmm-admin-theme'

export type Theme = 'light' | 'dark'

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    return saved === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('light', theme === 'light')
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

/** Applies the persisted theme on app start. */
export function initTheme(): void {
  applyTheme(getTheme())
}

/** Flips the theme, persists it and returns the new value. */
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
  applyTheme(next)
  return next
}
