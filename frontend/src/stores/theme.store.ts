import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Theme = 'light' | 'dark'

const KEY = 'vidsmm:theme'

function initialTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'light'
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>(initialTheme())

  function apply(next: Theme): void {
    theme.value = next
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.style.colorScheme = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* storage may be unavailable (private mode) — theme still applies */
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    meta?.setAttribute('content', next === 'dark' ? '#050816' : '#f6f7fb')
  }

  /** Apply the persisted/system theme (safe to call on app boot). */
  function init(): void {
    apply(theme.value)
  }

  function toggle(): void {
    apply(theme.value === 'dark' ? 'light' : 'dark')
  }

  function setTheme(next: Theme): void {
    apply(next)
  }

  return { theme, init, toggle, setTheme }
})
