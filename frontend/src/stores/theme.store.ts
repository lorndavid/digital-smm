import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Theme = 'light' | 'dark'

const KEY = 'digitalsmm:theme'

function initialTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'light'
  const saved = localStorage.getItem(KEY)
  // Explicit user choice always wins. With no saved preference we default to
  // LIGHT mode — the OS dark preference is never auto-applied.
  if (saved === 'light' || saved === 'dark') return saved
  return 'light'
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>(initialTheme())

  function apply(next: Theme, persist: boolean): void {
    theme.value = next
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.style.colorScheme = next
    if (persist) {
      try {
        localStorage.setItem(KEY, next)
      } catch {
        /* storage may be unavailable (private mode) — theme still applies */
      }
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    meta?.setAttribute('content', next === 'dark' ? '#050816' : '#f6f7fb')
  }

  /** Apply the resolved theme on boot — never persists, so the light default
   *  stays light for first-time visitors (only explicit choices are saved). */
  function init(): void {
    apply(theme.value, false)
  }

  function toggle(): void {
    apply(theme.value === 'dark' ? 'light' : 'dark', true)
  }

  function setTheme(next: Theme): void {
    apply(next, true)
  }

  return { theme, init, toggle, setTheme }
})
