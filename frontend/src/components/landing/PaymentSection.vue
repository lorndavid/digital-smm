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

/**
 * Cambodia bank / wallet logos, self-hosted from CutLuy's public CDN so the
 * marquee is fast and works offline. Two rows scroll in opposite directions.
 */
const bankRows: Array<Array<{ src: string; alt: string }>> = [
  [
    { src: '/banks/1.png', alt: 'Sathapana Bank' },
    { src: '/banks/2.png', alt: 'Vattanac Bank' },
    { src: '/banks/3.png', alt: 'ACLEDA Bank' },
    { src: '/banks/4.png', alt: 'Foreign Trade Bank of Cambodia' },
    { src: '/banks/6.png', alt: 'Cambodia Post Bank' },
    { src: '/banks/7.png', alt: 'KB Prasac Bank' },
    { src: '/banks/8.png', alt: 'AMK Microfinance' },
    { src: '/banks/9.png', alt: 'Prince Bank' },
    { src: '/banks/10.png', alt: 'AEON Specialized Bank' },
    { src: '/banks/aba.png', alt: 'ABA Bank' },
    { src: '/banks/aeon.png', alt: 'AEON' },
    { src: '/banks/alpha.png', alt: 'Alpha Bank' },
    { src: '/banks/amret.png', alt: 'Amret' },
    { src: '/banks/ardb.png', alt: 'Agricultural and Rural Development Bank' },
    { src: '/banks/apd.png', alt: 'APD Bank' },
    { src: '/banks/asiaweiluy.png', alt: 'Asia Wei Luy' },
    { src: '/banks/bic.png', alt: 'BIC Bank' },
    { src: '/banks/bidc.png', alt: 'Bank for Investment and Development of Cambodia' },
    { src: '/banks/boc.png', alt: 'Bank of China' },
    { src: '/banks/bongloy.png', alt: 'Bongloy' },
    { src: '/banks/booyoung.png', alt: 'Booyoung Khmer Bank' },
    { src: '/banks/bred.png', alt: 'BRED Bank' },
    { src: '/banks/bridge.png', alt: 'Bridge Bank' },
    { src: '/banks/cab.png', alt: 'Cambodia Asia Bank' },
    { src: '/banks/campu.png', alt: 'Cambodian Public Bank (Campu)' },
    { src: '/banks/canadia.png', alt: 'Canadia Bank' },
    { src: '/banks/cathay.png', alt: 'Cathay United Bank' },
    { src: '/banks/ccu.png', alt: 'Cambodian Community Union' },
    { src: '/banks/chief.png', alt: 'Chief Bank' },
    { src: '/banks/chipmong.png', alt: 'Chip Mong Bank' },
    { src: '/banks/cimb.png', alt: 'CIMB Bank' },
    { src: '/banks/coolcash.png', alt: 'CoolCash' },
  ],
  [
    { src: '/banks/darasakor.png', alt: 'Dara Sakor' },
    { src: '/banks/dgb.png', alt: 'DGB Bank' },
    { src: '/banks/emoney.png', alt: 'E-Money' },
    { src: '/banks/first.png', alt: 'First Commercial Bank' },
    { src: '/banks/hattha.png', alt: 'Hattha Bank' },
    { src: '/banks/hengfeng.png', alt: 'Hengfeng Bank' },
    { src: '/banks/hongleong.png', alt: 'Hong Leong Bank' },
    { src: '/banks/ibk.png', alt: 'IBK Bank' },
    { src: '/banks/icbc.png', alt: 'ICBC' },
    { src: '/banks/ipay88.png', alt: 'iPay88' },
    { src: '/banks/jtrust.png', alt: 'J Trust Royal Bank' },
    { src: '/banks/kess.png', alt: 'Kess' },
    { src: '/banks/lanton.png', alt: 'Lanton' },
    { src: '/banks/lolc.png', alt: 'LOLC' },
    { src: '/banks/lyhour.png', alt: 'Ly Hour Pay Pro' },
    { src: '/banks/maybank.png', alt: 'Maybank' },
    { src: '/banks/mb.png', alt: 'MB Bank' },
    { src: '/banks/moha.png', alt: 'Moha' },
    { src: '/banks/oriental.png', alt: 'Oriental Bank' },
    { src: '/banks/panda.png', alt: 'Panda' },
    { src: '/banks/phillip.png', alt: 'Phillip Bank' },
    { src: '/banks/pipay.png', alt: 'Pi Pay' },
    { src: '/banks/ppcb.png', alt: 'Phnom Penh Commercial Bank' },
    { src: '/banks/rhb.png', alt: 'RHB Bank' },
    { src: '/banks/sacom.png', alt: 'Sacombank' },
    { src: '/banks/sbilyhour.png', alt: 'SBI Ly Hour Bank' },
    { src: '/banks/shinhan.png', alt: 'Shinhan Bank' },
    { src: '/banks/truemoney.png', alt: 'TrueMoney' },
    { src: '/banks/ucb.png', alt: 'Union Commercial Bank' },
    { src: '/banks/upay.png', alt: 'uPay' },
    { src: '/banks/wb.png', alt: 'Woori Bank' },
    { src: '/banks/wing.png', alt: 'Wing Bank' },
  ],
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

    <!-- Cambodia bank logos — two opposing infinite marquee rows in their real
         brand colors, constrained to the page container (never full-bleed). -->
    <div class="container-page mt-14 sm:mt-16">
      <p class="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Accepted across Cambodia's leading banks
      </p>
      <div
        class="group mt-6 flex flex-col gap-8 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
      >
        <div v-for="(row, rowIndex) in bankRows" :key="rowIndex" class="flex">
          <template v-for="copy in 2" :key="copy">
            <div
              class="animate-marquee flex w-max shrink-0 items-center gap-10 pr-10"
              :class="copy === 2 ? 'duplicate-copy' : ''"
              :style="{ '--marquee-direction': rowIndex === 0 ? 'normal' : 'reverse' }"
              :aria-hidden="copy === 2 || undefined"
            >
              <img
                v-for="bank in row"
                :key="bank.src"
                :src="bank.src"
                :alt="bank.alt"
                :title="bank.alt"
                loading="eager"
                decoding="async"
                class="h-9 w-auto shrink-0 transition-opacity duration-300 group-hover:opacity-70 hover:opacity-100"
              />
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
