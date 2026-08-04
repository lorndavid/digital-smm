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

  // SMM provider
  SMM_PROVIDER: z.enum(['smmwiz', 'mock']).default('smmwiz'),
  SMMWIZ_API_URL: z.url().default('https://smmwiz.com/api/v2'),
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

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(3000),

  // Background jobs
  ENABLE_ORDER_SYNC_JOB: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ORDER_SYNC_INTERVAL_MS: z.coerce.number().default(60_000),
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
