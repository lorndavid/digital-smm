<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { Copy, Cpu, Layers, Loader2, Play, ShieldAlert, Timer } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage } from '@/utils/format'
import type { LoadTestRunState, LoadTestStatusResponse, LoadTestType } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'

/**
 * Load Tests — re-run the 100-user KHQR payment load tests on demand and
 * render the full summary tables. Each test boots the REAL backend code
 * (mock provider, throwaway Mongo DB) in a child process on the server.
 *
 * POST /admin/load-tests/run returns immediately (202) and the page polls
 * /admin/load-tests/status every 1.5s while a run is in flight, so the
 * terminal panels stream in live.
 */

const toast = useToast()

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

const status = ref<LoadTestStatusResponse>({ current: idle, lastResults: {} })

interface TestConfig {
  type: LoadTestType
  title: string
  icon: typeof Cpu
  desc: string
  meta: string[]
}

const tests: TestConfig[] = [
  {
    type: 'single',
    title: 'Single-instance',
    icon: Cpu,
    desc: '100 concurrent users through the full KHQR flow — payment creation, TTL-capped status polls, SSE delivery to every stream, and exactly-once wallet crediting.',
    meta: ['100 users', 'Mock provider', 'Throwaway DB'],
  },
  {
    type: 'multi',
    title: 'Multi-instance',
    icon: Layers,
    desc: '100 users across 2 real backend processes — the Redis SSE relay (webhooks on A, streams on B) and cross-instance webhook dedupe. Requires local Docker Mongo + Redis on 27017 / 6379.',
    meta: ['100 users', '2 instances', 'Redis relay'],
  },
]

const current = computed(() => status.value.current)
const anyRunning = computed(() => current.value.status === 'running')

function lastOf(type: LoadTestType) {
  return status.value.lastResults[type] ?? null
}

function isRunning(type: LoadTestType): boolean {
  return current.value.status === 'running' && current.value.type === type
}

/** Pass/fail chips extracted from the run's own verdict lines. */
function verdictCounts(type: LoadTestType): { pass: number; fail: number } {
  const out = lastOf(type)?.output ?? ''
  const pass = (out.match(/[✓✅]/g) ?? []).length
  const fail = (out.match(/[✗❌⚠️]/g) ?? []).length
  return { pass, fail }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

let pollTimer: number | null = null

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

async function refresh(): Promise<void> {
  try {
    status.value = await adminApi.loadTestStatus()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load load-test status'))
  }
}

function startPolling(): void {
  stopPolling()
  pollTimer = window.setInterval(() => void refresh(), 1500)
}

/** True between the moment a run flips to 'done' and the next render — lets
 * the terminal auto-scroll one last time to show the final summary lines. */
const justFinished = ref(false)

watch(
  () => current.value.status,
  (s) => {
    if (s === 'running') {
      startPolling()
      return
    }
    stopPolling()
    if (s === 'done') justFinished.value = true
  },
)

async function run(type: LoadTestType): Promise<void> {
  if (anyRunning.value) return
  try {
    await adminApi.runLoadTest(type)
    await refresh()
  } catch (err) {
    toast.error(errorMessage(err, 'Could not start the load test'))
  }
}

async function copyOutput(type: LoadTestType): Promise<void> {
  const out = lastOf(type)?.output
  if (!out) return
  try {
    await navigator.clipboard.writeText(out)
    toast.success('Summary tables copied')
  } catch {
    toast.error('Could not copy — select the text manually')
  }
}

// ---------------------------------------------------------------------------
// Live terminal: auto-scroll while a run streams output
// ---------------------------------------------------------------------------

const termRefs = ref<Record<string, HTMLElement | null>>({})

function setTermRef(type: LoadTestType) {
  return (el: Element | ComponentPublicInstance | null): void => {
    if (el instanceof Element) termRefs.value[type] = el as HTMLElement
  }
}

watch(
  () => status.value.lastResults,
  async () => {
    const finished = justFinished.value
    if (finished) justFinished.value = false
    if (current.value.status !== 'running' && !finished) return
    await nextTick()
    const el = termRefs.value[current.value.type ?? '']
    if (el) el.scrollTop = el.scrollHeight
  },
  { deep: true },
)

onMounted(() => void refresh())
onUnmounted(() => stopPolling())
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-(--a-text)">Load Tests</h1>
        <p class="mt-1 max-w-2xl text-sm text-(--a-muted)">
          Re-run the 100-user KHQR payment load tests and view the full summary tables. Runs on the
          server against the mock provider with a throwaway database — no real charges, no data left
          behind. Results stream in live.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <BaseBadge v-if="anyRunning" tone="warning" dot>Running — {{ current.type }}</BaseBadge>
        <BaseBadge v-else-if="current.status === 'done'" :tone="current.ok ? 'success' : 'danger'" dot>
          Last run {{ current.ok ? 'passed' : 'failed' }}
        </BaseBadge>
        <BaseBadge v-else tone="neutral" dot>Idle</BaseBadge>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-2">
      <div v-for="test in tests" :key="test.type" class="space-y-3">
        <!-- Card -->
        <div class="glass rounded-2xl p-5 shadow-card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/20 to-secondary-500/15 text-brand-300 ring-1 ring-brand-400/20"
              >
                <component :is="test.icon" class="h-5 w-5" />
              </div>
              <div>
                <h2 class="font-display text-lg font-bold text-(--a-text)">{{ test.title }}</h2>
                <p class="mt-1 text-sm leading-relaxed text-(--a-muted)">{{ test.desc }}</p>
              </div>
            </div>
            <BaseBadge
              v-if="isRunning(test.type)"
              tone="warning"
              dot
            >Running</BaseBadge>
            <BaseBadge
              v-else-if="lastOf(test.type)?.ok === true"
              tone="success"
              dot
            >Passed</BaseBadge>
            <BaseBadge
              v-else-if="lastOf(test.type)?.ok === false"
              tone="danger"
              dot
            >Failed</BaseBadge>
            <BaseBadge v-else tone="neutral">Idle</BaseBadge>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <span
              v-for="m in test.meta"
              :key="m"
              class="rounded-lg bg-(--a-soft) px-2 py-1 text-[11px] font-semibold text-(--a-muted)"
            >
              {{ m }}
            </span>
          </div>

          <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-(--a-border) pt-4">
            <div class="flex items-center gap-2 text-xs text-(--a-muted)">
              <Timer v-if="lastOf(test.type)?.durationMs != null" class="h-3.5 w-3.5" />
              <span v-if="lastOf(test.type)?.durationMs != null">
                {{ formatDuration(lastOf(test.type)?.durationMs) }}
              </span>
              <span v-if="lastOf(test.type)?.exitCode != null" class="font-mono">
                · exit {{ lastOf(test.type)?.exitCode }}
              </span>
              <ShieldAlert
                v-if="test.type === 'multi'"
                class="ml-1 h-3.5 w-3.5 text-amber-400/70"
                :title="'Multi-instance needs Docker Mongo + Redis on localhost'"
              />
            </div>
            <BaseButton
              size="sm"
              :loading="isRunning(test.type)"
              :disabled="anyRunning && !isRunning(test.type)"
              @click="run(test.type)"
            >
              <Play v-if="!isRunning(test.type)" class="h-3.5 w-3.5" />
              {{ isRunning(test.type) ? 'Running…' : 'Run test' }}
            </BaseButton>
          </div>
        </div>

        <!-- Terminal: the full summary tables -->
        <div class="overflow-hidden rounded-2xl border border-(--a-border) bg-[#0a0f1e] shadow-card">
          <div class="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
            <div class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
              <span class="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span class="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
              <span class="ml-2 font-mono text-[11px] text-white/45">
                loadtest-{{ test.type }} — summary
              </span>
            </div>
            <button
              class="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
              :disabled="!lastOf(test.type)?.output"
              @click="copyOutput(test.type)"
            >
              <Copy class="h-3 w-3" /> Copy
            </button>
          </div>
          <pre
            :ref="setTermRef(test.type)"
            class="max-h-[480px] overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-emerald-300/80"
          >
{{ lastOf(test.type)?.output || '— no run yet — hit “Run test” to generate the summary tables —' }}
          </pre>
        </div>

        <!-- Verdict chips -->
        <div v-if="lastOf(test.type)" class="flex items-center gap-2 pl-1">
          <Loader2
            v-if="isRunning(test.type)"
            class="h-3.5 w-3.5 animate-spin text-secondary-300"
          />
          <template v-else>
            <BaseBadge tone="success" dot>{{ verdictCounts(test.type).pass }} checks passed</BaseBadge>
            <BaseBadge
              v-if="verdictCounts(test.type).fail > 0"
              tone="danger"
              dot
            >{{ verdictCounts(test.type).fail }} failed</BaseBadge>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
