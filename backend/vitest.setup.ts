/**
 * Vitest global setup — runs before EVERY test file.
 *
 * env.ts validates required variables at import time and calls
 * process.exit(1) when they are missing. Several test files import src
 * modules that transitively import env.ts (e.g. events.bus, the distributed
 * rate-limit store → redis.client), so without this the suite only passes on
 * machines that happen to have a backend/.env. Seeding the required vars
 * here makes `npm test` hermetic anywhere — local clone or CI runner.
 *
 * `??=` keeps any value the runner already set (CI job env, dotenv, etc.).
 * Keep the list in sync with the REQUIRED fields in src/config/env.ts.
 */
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/digitalsmm_test'
process.env.CUSTOMER_JWT_SECRET ??= 'test-customer-jwt-secret-0123456789'
process.env.ADMIN_JWT_SECRET ??= 'test-admin-jwt-secret-0123456789'
