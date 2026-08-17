/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL. */
  readonly VITE_API_BASE_URL?: string
  /** App environment tag: 'development' | 'staging' | 'production'. */
  readonly VITE_APP_ENV?: string
  /** GA4 Measurement ID (public). Empty disables analytics. */
  readonly VITE_GA_MEASUREMENT_ID?: string
  /** Sentry DSN for the customer frontend (public). Empty disables Sentry. */
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
