<script setup lang="ts">
import { CheckCircle2, Landmark, QrCode, Smartphone, Wallet } from '@lucide/vue'
import type { Component } from 'vue'

/** Real integrated payment rails — KHQR via CutLuy, ABA via AbaPayway. */
const methods = [
  {
    name: 'KHQR',
    detail: 'Bakong · ACLEDA · Wing',
    icon: Smartphone,
  },
  {
    name: 'ABA',
    detail: 'Mobile app scan',
    icon: Landmark,
  },
  {
    name: 'Wallet balance',
    detail: 'Instant credits',
    icon: Wallet,
  },
]

interface Step {
  icon: Component
  title: string
  description: string
}

const steps: Step[] = [
  { icon: QrCode, title: 'Generate KHQR', description: 'One tap creates a unique QR for your top-up.' },
  { icon: Smartphone, title: 'Scan & pay', description: 'Scan with Bakong, ABA, ACLEDA or Wing.' },
  { icon: CheckCircle2, title: 'Payment confirmed', description: 'Your wallet is credited instantly.' },
]
</script>

<template>
  <section class="bg-muted/40 py-14 sm:py-18">
    <div class="container-page grid items-center gap-10 lg:grid-cols-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-primary">Payments</p>
        <h2 class="font-display mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Pay the way <span class="text-gradient">that suits you</span>
        </h2>
        <p class="mt-2 max-w-md text-sm text-muted-foreground">
          Top up your wallet in seconds with the payment methods Cambodia already trusts —
          then order from your balance without ever leaving the site.
        </p>

        <div class="mt-6 space-y-2.5">
          <div
            v-for="(method, index) in methods"
            :key="method.name"
            v-motion
            :initial="{ opacity: 0, x: -16 }"
            :visible="{ opacity: 1, x: 0, transition: { duration: 0.45, delay: index * 0.08 } }"
            class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
          >
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary">
              <component :is="method.icon" class="h-4 w-4" />
            </span>
            <div>
              <p class="text-sm font-semibold text-foreground">{{ method.name }}</p>
              <p class="text-xs text-muted-foreground">{{ method.detail }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Scan-to-pay flow visual -->
      <div class="relative">
        <div
          v-motion
          :initial="{ opacity: 0, scale: 0.95 }"
          :visible="{ opacity: 1, scale: 1, transition: { duration: 0.55, delay: 0.1 } }"
          class="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
        >
          <div class="flex items-center justify-between">
            <p class="font-display text-lg font-semibold text-foreground">Wallet top-up</p>
            <span class="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              $5.00 USD
            </span>
          </div>

          <!-- QR mockup -->
          <div class="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-xl border border-border bg-white p-2.5 shadow-sm dark:bg-foreground">
            <div class="grid h-full w-full grid-cols-5 grid-rows-5 gap-0.5">
              <template v-for="n in 25" :key="n">
                <div
                  class="rounded-[2px]"
                  :class="[n % 3 === 0 ? 'bg-foreground' : n % 4 === 0 ? 'bg-primary/60' : 'bg-transparent']"
                />
              </template>
            </div>
          </div>

          <div class="mt-5 space-y-2">
            <div
              v-for="(step, index) in steps"
              :key="step.title"
              class="flex items-center gap-3 text-sm"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                :class="index === steps.length - 1 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 text-primary'"
              >
                <component :is="step.icon" class="h-3.5 w-3.5" />
              </span>
              <div>
                <p class="font-medium text-foreground">{{ step.title }}</p>
                <p class="text-xs text-muted-foreground">{{ step.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Ambient glow blobs clipped to the container so they can never
             overflow the viewport on small screens. -->
        <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div class="absolute -bottom-8 -right-8 h-36 w-36 rounded-full bg-secondary-500/10 blur-3xl" />
          <div class="absolute -left-8 -top-8 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
        </div>
      </div>
    </div>
  </section>
</template>
