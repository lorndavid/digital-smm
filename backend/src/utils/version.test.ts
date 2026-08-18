import { describe, expect, it, vi } from 'vitest'

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'production',
    APP_VERSION: '2.5.0',
    APP_COMMIT: 'abc123def456',
    APP_BUILD_TIME: '2026-08-18T00:00:00.000Z',
    DEPLOYMENT_ID: 'deploy-42',
  },
  corsOrigins: [],
}))

import { getAppVersion } from './version.js'

describe('getAppVersion', () => {
  it('returns the deployment identity baked into the image', () => {
    const v = getAppVersion()
    expect(v.application).toBe('digitalsmm-backend')
    expect(v.version).toBe('2.5.0')
    expect(v.commit).toBe('abc123def456')
    expect(v.environment).toBe('production')
    expect(v.buildTime).toBe('2026-08-18T00:00:00.000Z')
    expect(v.deploymentId).toBe('deploy-42')
  })

  it('never contains secrets', () => {
    const v = getAppVersion()
    const json = JSON.stringify(v)
    expect(json).not.toMatch(/secret|password|token|mongodb(\+srv)?:\/\//i)
  })
})
