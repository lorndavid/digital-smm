import { asyncHandler } from '../utils/async-handler.js'
import {
  getLoadTestStatus,
  isLoadTestRunning,
  runLoadTest,
  type LoadTestType,
} from '../services/admin/load-test.runner.js'

/**
 * Admin load-test endpoints — re-run the 100-user KHQR load tests on demand
 * and stream the full summary tables to the admin Load Tests page.
 *
 * POST /api/admin/load-tests/run   { type: 'single' | 'multi' } → 202 or 409
 * GET  /api/admin/load-tests/status → { current, lastResults }
 *
 * Guarded by requireSuperAdmin (spawning child processes + 100 concurrent
 * users is a privileged diagnostic action).
 */
export const loadTestController = {
  /** GET /status — the in-flight run (if any) + the last result per type. */
  status: asyncHandler(async (_req, res) => {
    res.json(getLoadTestStatus())
  }),

  /** POST /run — starts a run; the page polls /status for progress. */
  run: asyncHandler(async (req, res) => {
    const { type } = req.body as { type: LoadTestType }
    if (isLoadTestRunning()) {
      res.status(409).json({
        error: 'A load test is already running — wait for it to finish before starting another.',
      })
      return
    }
    runLoadTest(type)
    res.status(202).json({ status: 'running', type })
  }),
}
