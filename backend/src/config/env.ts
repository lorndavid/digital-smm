import 'dotenv/config'
import { z } from 'zod'

/**
 * Centralised environment configuration.
 * Every variable is validated at boot so misconfiguration fails fast
 * with a readable message instead of cryptic runtime errors.
 */

/** Treat an empty string as an unset optional value. */
const optionalString = <T extends z.ZodTypeAny>(schema: T): z.ZodOptional<T> =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    schema.optional(),
  ) as unknown as z.ZodOptional<T>

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // MongoDB Atlas connection string
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required (MongoDB Atlas connection string)'),

  // Optional explicit DNS servers (comma-separated, e.g. '1.1.1.1,8.8.8.8').
  // On some Windows/ISP setups Node's resolver (c-ares) fails SRV lookups with
  // `querySrv ECONNREFUSED` even though the OS resolves fine — pinning DNS here
  // fixes that. Leave empty to use the system resolver.
  DNS_SERVERS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .refine(
      (servers) => servers.every((s) => /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:]+)$/.test(s)),
      {
        message:
          'DNS_SERVERS must be a comma-separated list of valid IP addresses (e.g. 1.1.1.1,8.8.8.8)',
      },
    ),

  // Customer auth — Google OAuth 2.0 (Authorization Code + PKCE)
  // Create credentials at https://console.cloud.google.com/apis/credentials
  // (OAuth client ID → Web application). Add `${FRONTEND_URL}/auth/callback`
  // as an Authorized redirect URI and enable the Google+ / People API scopes
  // openid, email, profile.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Public Google endpoints (defaults are fine for production).
  GOOGLE_OAUTH_URL: z.url().default('https://accounts.google.com/o/oauth2/v2/auth'),
  GOOGLE_TOKEN_URL: z.url().default('https://oauth2.googleapis.com/token'),
  GOOGLE_CERTS_URL: z.url().default('https://www.googleapis.com/oauth2/v3/certs'),
  // Frontend origin — Google redirects the customer back to
  // `${FRONTEND_URL}/auth/callback` after consent.
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  // Customer session JWT (HS256, signed with this secret).
  CUSTOMER_JWT_SECRET: z.string().min(16, 'CUSTOMER_JWT_SECRET must be at least 16 characters'),
  CUSTOMER_JWT_EXPIRES_IN: z.string().default('7d'),
  // OAuth `state` tokens expire after 10 minutes.
  OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  // Admin auth (email + password, stored in MongoDB)
  // Secret used to sign/verify admin session JWTs (HS256).
  ADMIN_JWT_SECRET: z.string().min(16, 'ADMIN_JWT_SECRET must be at least 16 characters'),

  ADMIN_JWT_EXPIRES_IN: z.string().default('12h'),
  // Optional: auto-create the first super admin on boot when no admin exists.
  SUPER_ADMIN_EMAIL: optionalString(z.string().email('SUPER_ADMIN_EMAIL must be a valid email')),
  SUPER_ADMIN_PASSWORD: optionalString(
    z.string().min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters'),
  ),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),

  // SMM provider: 'smmwiz' (real API) or 'mock' (local, no key)
  SMM_PROVIDER: z.enum(['smmwiz', 'mock']).default('smmwiz'),
  // The live API domain is wizsmm.com — smmwiz.com is a dead/legacy domain
  // whose API rejects the current key (HTTP 401).
  SMMWIZ_API_URL: z.url().default('https://wizsmm.com/api/v2'),
  SMMWIZ_API_KEY: z.string().optional(),

  // Payment provider: 'mock' (no key), 'cutluy' (real Bakong KHQR) or 'abapayway'
  PAYMENT_PROVIDER: z.enum(['mock', 'cutluy', 'abapayway']).default('mock'),
  CUTLUY_API_URL: z.url().default('https://cutluy.com/v1'),
  CUTLUY_API_KEY: z.string().optional(),
  CUTLUY_WEBHOOK_SECRET: z.string().optional(),
  ABAPAYWAY_API_URL: z
    .url()
    .default('https://checkout.payway.com.kh/api/payment-gateway/v1/payments'),
  ABAPAYWAY_MERCHANT_ID: z.string().optional(),
  ABAPAYWAY_API_KEY: z.string().optional(),
  ABAPAYWAY_RETURN_URL: z.string().default('http://localhost:5173/dashboard/wallet'),

  // Sentry error monitoring (optional — leave DSN empty to disable).
  SENTRY_DSN: optionalString(z.url()),
  SENTRY_ENVIRONMENT: z.string().default(process.env.NODE_ENV ?? 'development'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(3000),
  // Storefront catalogue reads (categories / services / announcements) get
  // their OWN budget — browsing must never be throttled by the stricter
  // global quota that also covers writes and admin traffic.
  RATE_LIMIT_CATALOGUE_MAX: z.coerce.number().default(10000),

  // Optional Redis — enables cross-instance SSE delivery, distributed rate
  // limiting AND caching for analytics/catalog. Leave empty for in-memory
  // only (single instance / local dev).
  REDIS_URL: optionalString(z.url()),
  // Redis password — only needed when REDIS_URL doesn't include auth.
  REDIS_PASSWORD: optionalString(z.string().min(1)),

  // Background jobs
  ENABLE_ORDER_SYNC_JOB: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ORDER_SYNC_INTERVAL_MS: z.coerce.number().default(60_000),

  // --- Deployment identity (baked into the image at build time) ---
  // Safe to expose publicly: version/commit/build_time are not secrets.
  APP_VERSION: z.string().default('1.0.0'),
  APP_COMMIT: z.string().default(''),
  APP_BUILD_TIME: z.string().default(''),
  // Set by the CI/CD deploy workflow so logs/incidents/deployments correlate.
  DEPLOYMENT_ID: z.string().default(''),

  // --- Telegram operational alerts (OPTIONAL — the app must start without) ---
  // 1. Create a bot via @BotFather and copy its token.
  // 2. Send any message to the target chat/group, then run:
  //    curl https://api.telegram.org/bot<TOKEN>/getUpdates
  //    and copy the numeric `chat.id`.
  // Alerts are deduplicated (spike + cooldown) so one repeated failure sends
  // one aggregated message, not hundreds. See modules/notifications.
  TELEGRAM_BOT_TOKEN: optionalString(z.string().min(10)),
  TELEGRAM_CHAT_ID: optionalString(z.string().min(1)),
  TELEGRAM_ALERTS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  TELEGRAM_MIN_ALERT_LEVEL: z
    .enum(['info', 'warning', 'error', 'critical'])
    .default('warning'),
  // Aggregation window for identical alerts before a new message is sent.
  TELEGRAM_ALERT_COOLDOWN_MS: z.coerce.number().default(15 * 60 * 1000),

  // --- Daily operational report (Telegram, Asia/Phnom_Penh) ---
  DAILY_REPORT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Local wall-clock time in DAILY_REPORT_TZ, e.g. '22:00'.
  DAILY_REPORT_TIME: z.string().default('22:00'),
  DAILY_REPORT_TZ: z.string().default('Asia/Phnom_Penh'),

  // --- Admin Integrations: encrypted API credentials ---
  // Master key for AES-256-GCM encryption of provider credentials stored in
  // MongoDB (Telegram bot tokens, SMM API keys, ...). NEVER committed to git,
  // never stored in the database — only in backend/.env on the VPS. Any
  // string is accepted (hashed to a 32-byte key); prefer 64 hex chars.
  // REQUIRED in production: without it the server refuses to boot. In
  // development/test a random ephemeral key is generated (credentials do not
  // survive a restart — fine for local work).
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(8).optional(),

  // Background health checks for configured integrations (Telegram getMe,
  // SMM balance) — every INTEGRATION_HEALTH_INTERVAL_MS, guarded by a Mongo
  // distributed lock so one replica owns the check.
  ENABLE_INTEGRATION_HEALTH_JOB: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  INTEGRATION_HEALTH_INTERVAL_MS: z.coerce.number().default(30 * 60 * 1000),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`)
    .join('\n')
  // eslint-disable-next-line no-console
  console.error('[env] Invalid environment variables:\n' + issues)
  process.exit(1)
}

export const env = parsed.data

/** Parsed list of allowed CORS origins. */
export const corsOrigins: string[] = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean)
