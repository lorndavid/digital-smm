import 'dotenv/config'
import { z } from 'zod'

/**
 * Centralised environment configuration.
 * Every variable is validated at boot so misconfiguration fails fast
 * with a readable message instead of cryptic runtime errors.
 */

const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.url().optional(),
)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // MongoDB Atlas connection string
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required (MongoDB Atlas connection string)'),

  // Clerk JWT verification
  CLERK_JWKS_URL: z.url('CLERK_JWKS_URL must be a valid URL, e.g. https://<domain>/.well-known/jwks.json'),
  CLERK_ISSUER: optionalUrl,
  CLERK_ADMIN_ROLE: z.string().default('admin'),

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
  RATE_LIMIT_MAX: z.coerce.number().default(300),

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
