import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

/**
 * On-demand load-test runner for the admin panel.
 *
 * Spawns the REAL load-test scripts (scripts/loadtest-payment.ts and
 * scripts/loadtest-multi-instance.ts) as child processes and accumulates
 * their stdout — the full phase verdicts + summary tables — so the admin
 * Load Tests page can render them and re-run either test on demand.
 *
 * Safety / constraints:
 *   - Runs are serialized (one at a time per backend process); a second
 *     request while one is in flight gets a 409 from the controller.
 *   - Both scripts force PAYMENT_PROVIDER=mock / SMM_PROVIDER=mock and run
 *     against a THROWAWAY Mongo database that they drop on exit — no real
 *     CutLuy/SMMWiz calls, no quota spent, no data left behind.
 *   - A hard timeout kills a hung run so an admin request can never hang.
 *   - Status is served via GET /admin/load-tests/status; the page polls it
 *     while a run is in progress (no long-lived HTTP request).
 */

export type LoadTestType = 'single' | 'multi'

export interface LoadTestRunState {
  status: 'idle' | 'running' | 'done'
  type: LoadTestType | null
  /** Full accumulated stdout of the run (capped) — includes the summary tables. */
  output: string
  startedAt: string | null
  finishedAt: string | null
  exitCode: number | null
  durationMs: number | null
  /** True when the script exited 0 (the scripts fail loudly otherwise). */
  ok: boolean | null
}

/** Cap per-run captured output so a chatty child can't grow memory unbounded. */
const MAX_OUTPUT = 300_000
/**
 * Morgan access-log lines from the child's full app boot
 * (":method :url :status :response-time ms - …") carry no signal for the
 * summary view — the admin terminal should show the load-test tables, not
 * the HTTP access log. morgan's 'dev' format colours its output even when
 * piped, so ANSI codes are stripped before matching.
 */
const MORGAN_LINE = /^[A-Z]+\s+\/\S+\s+\d{3}\s+[\d.]+\s*ms\s+-\s+\S*\s*$/

/** Strips ANSI/SGR escape sequences (morgan colours, terminal emulation). */
const stripAnsi = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '')
/** Hard per-type timeouts (ms) — the tests normally finish in 10–40s. */
const TIMEOUTS: Record<LoadTestType, number> = { single: 180_000, multi: 360_000 }
const SCRIPTS: Record<LoadTestType, string> = {
  single: 'scripts/loadtest-payment.ts',
  multi: 'scripts/loadtest-multi-instance.ts',
}

/** backend/src/services/admin → backend/ */
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const idle: LoadTestRunState = {
  status: 'idle',
  type: null,
  output: '',
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  durationMs: null,
  ok: null,
}

let currentRun: LoadTestRunState = { ...idle }
const lastResults: Partial<Record<LoadTestType, LoadTestRunState>> = {}

export function getLoadTestStatus(): {
  current: LoadTestRunState
  lastResults: Partial<Record<LoadTestType, LoadTestRunState>>
} {
  return { current: { ...currentRun }, lastResults: { ...lastResults } }
}

export function isLoadTestRunning(): boolean {
  return currentRun.status === 'running'
}

/**
 * Resolves the tsx CLI entry so the child can run a .ts script without a
 * global install. Falls back to `npx tsx` when tsx isn't resolvable (it is
 * a devDependency, so the fallback is only a safety net).
 */
function resolveTsxCli(): string | null {
  try {
    const require = createRequire(import.meta.url)
    return path.join(path.dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs')
  } catch {
    return null
  }
}

/** Starts a run. The controller must have already confirmed one isn't running. */
export function runLoadTest(type: LoadTestType): void {
  // Capture the run state per invocation: append/finish write to THIS object,
  // never the module-level `currentRun`, so a still-dying child from a
  // timed-out run can never bleed output into a newer run.
  const run: LoadTestRunState = {
    status: 'running',
    type,
    output: '',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    durationMs: null,
    ok: null,
  }
  currentRun = run

  const started = performance.now()
  // Line-buffered append: morgan access-log lines are dropped one line at a
  // time, so a chunk that mixes a log line with a summary line never loses
  // the summary line (stdout chunks are not guaranteed line-aligned).
  let pending = ''
  const flushPending = (): void => {
    const clean = stripAnsi(pending)
    if (clean && !MORGAN_LINE.test(clean)) run.output += clean
    pending = ''
    if (run.output.length > MAX_OUTPUT) {
      run.output = run.output.slice(-MAX_OUTPUT)
    }
  }
  const append = (chunk: Buffer): void => {
    pending += chunk.toString()
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      const clean = stripAnsi(line)
      if (!MORGAN_LINE.test(clean)) run.output += clean + '\n'
    }
    if (run.output.length > MAX_OUTPUT) {
      run.output = run.output.slice(-MAX_OUTPUT)
    }
  }
  const finish = (exitCode: number | null, timedOut: boolean): void => {
    flushPending()
    run.status = 'done'
    run.exitCode = exitCode
    run.ok = exitCode === 0
    run.finishedAt = new Date().toISOString()
    run.durationMs = Math.round(performance.now() - started)
    if (timedOut) {
      run.output += `\n[load-test runner] timed out after ${TIMEOUTS[type] / 1000}s — process killed\n`
    }
    lastResults[type] = { ...run }
  }

  const tsxCli = resolveTsxCli()
  const child = spawn(
    process.execPath,
    tsxCli ? [tsxCli, SCRIPTS[type]] : ['npx', '--yes', 'tsx', SCRIPTS[type]],
    { cwd: BACKEND_ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  )

  child.stdout?.on('data', append)
  child.stderr?.on('data', append)

  let killTimer: ReturnType<typeof setTimeout> | null = null
  const timer = setTimeout(() => {
    child.kill('SIGTERM')
    // Grace period, then force-kill.
    killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, 5_000)
    finish(null, true)
  }, TIMEOUTS[type])

  const cleanup = (): void => {
    clearTimeout(timer)
    if (killTimer) {
      clearTimeout(killTimer)
      killTimer = null
    }
  }

  child.on('error', (err) => {
    cleanup()
    currentRun.output += `\n[load-test runner] failed to start child process: ${err.message}\n`
    finish(null, false)
  })

  child.on('close', (code) => {
    cleanup()
    // The timeout path already finalised this run — don't let the child's
    // late 'close' event overwrite the timed-out verdict.
    if (currentRun.status !== 'running') return
    finish(code, false)
  })
}
