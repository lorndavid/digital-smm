/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clerk publishable key (pk_test_... or pk_live_...). */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  /** Backend API base URL. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
