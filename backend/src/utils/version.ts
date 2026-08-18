import { env } from '../config/env.js'

/**
 * Application version / deployment identity.
 *
 * Values are baked into the Docker image at build time (ARG → ENV) by the
 * CI/CD pipeline and are SAFE to expose publicly — they contain no secrets.
 * When running locally (no build args) they fall back to the package version
 * and empty commit/build fields.
 */

export interface AppVersion {
  application: string
  version: string
  commit: string
  environment: string
  buildTime: string
  deploymentId: string
  startedAt: string
}

const startedAt = new Date().toISOString()

export function getAppVersion(): AppVersion {
  return {
    application: 'digitalsmm-backend',
    version: env.APP_VERSION,
    commit: env.APP_COMMIT,
    environment: env.NODE_ENV,
    buildTime: env.APP_BUILD_TIME,
    deploymentId: env.DEPLOYMENT_ID,
    startedAt,
  }
}
