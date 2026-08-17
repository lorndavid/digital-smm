import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Vitest config for the customer frontend.
 *
 * Covers pure-logic modules (SEO, analytics sanitization, schema builders)
 * in the Node environment — no browser needed. Run with:
 *   npm test -w frontend
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
})
