import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    // Seed the env vars env.ts requires so tests are hermetic without a
    // backend/.env (see vitest.setup.ts). Relative to the config's rootDir.
    setupFiles: ['./vitest.setup.ts'],
  },
})
