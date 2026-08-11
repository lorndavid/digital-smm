import { defineConfig } from '@playwright/test'

/**
 * Playwright browser tests for the DigitalSMM customer app.
 *
 * The `webServer` array boots the REAL stack before any test runs:
 *   1. Backend  — `npm run start:browser-test` (backend/scripts/start-browser-test.ts):
 *                 mock providers, frozen mock, webhook secret, throwaway Mongo
 *                 DB, port 4001.
 *   2. Frontend — the Vite dev server on port 5199 with its /api proxy pointed
 *                 at the test backend (VITE_PROXY_TARGET).
 *
 * Browsers:
 *   - Local:   uses your installed Google Chrome (channel: 'chrome') — no
 *              Playwright browser download needed.
 *   - CI:      uses Playwright's bundled Chromium (installed via
 *              `npx playwright install --with-deps chromium`).
 *
 * Run:  npm run test:e2e -w frontend
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5199',
    channel: process.env.CI ? undefined : 'chrome', // system Chrome locally
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Test backend (mock provider, frozen mock, webhook secret, port 4001).
      // SUPER_ADMIN_* seeds an admin account (seedSuperAdmin) so the admin
      // dashboard can be exercised end-to-end too.
      command: 'npm run start:browser-test',
      cwd: '../backend',
      env: {
        ...process.env,
        SUPER_ADMIN_EMAIL: 'superadmin@digitalsmm.test',
        SUPER_ADMIN_PASSWORD: 'SuperAdminTest!2026',
      },
      url: 'http://localhost:4001/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Frontend dev server proxying /api to the test backend.
      command: 'npm run dev -- --port 5199 --strictPort',
      cwd: '.',
      env: { ...process.env, VITE_PROXY_TARGET: 'http://localhost:4001' },
      url: 'http://localhost:5199',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Admin dev server proxying /api to the SAME test backend.
      command: 'npm run dev -- --port 5198 --strictPort',
      cwd: '../admin',
      env: { ...process.env, VITE_PROXY_TARGET: 'http://localhost:4001' },
      url: 'http://localhost:5198',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
