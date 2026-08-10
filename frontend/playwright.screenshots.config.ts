import { defineConfig } from '@playwright/test'

/**
 * Standalone screenshot pass for the dashboard width work.
 *
 * Boots the REAL stack (like the main e2e config) plus the ADMIN app:
 *   1. Backend  — `npm run start:browser-test` on port 4001 (mock providers,
 *                 throwaway Mongo DB) with SUPER_ADMIN_EMAIL/PASSWORD set so
 *                 the admin dashboard can be logged into.
 *   2. Frontend — the Vite dev server on port 5199 proxying /api to :4001.
 *   3. Admin    — the admin Vite dev server on port 5174 proxying /api to
 *                 :4001 (VITE_PROXY_TARGET, see admin/vite.config.ts).
 *
 * Captures full-page PNGs of every user + admin dashboard route into
 * frontend/shots/ at a 1920x1080 viewport, asserting the
 * readable-width / full-width layout choices hold (no horizontal overflow,
 * centered max-w-3xl columns, full-width tables).
 *
 * Run:  npx playwright test --config=playwright.screenshots.config.ts -w frontend
 */
export default defineConfig({
  testDir: './e2e-screenshots',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1920, height: 1080 },
    channel: process.env.CI ? undefined : 'chrome', // system Chrome locally
    trace: 'off',
    screenshot: 'off',
  },
  webServer: [
    {
      // Test backend with a seeded super admin for the admin screenshots.
      command: 'npm run start:browser-test',
      cwd: '../backend',
      env: {
        ...process.env,
        SUPER_ADMIN_EMAIL: 'admin@screenshot.test',
        SUPER_ADMIN_PASSWORD: 'screenshot-pass-123',
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
      // Admin dev server proxying /api to the same test backend.
      command: 'npm run dev -- --strictPort',
      cwd: '../admin',
      env: { ...process.env, VITE_PROXY_TARGET: 'http://localhost:4001' },
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
