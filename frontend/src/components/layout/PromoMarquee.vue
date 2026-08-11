<script setup lang="ts">
import { Gem, Headphones, Rocket, ShieldCheck, Sparkles, Zap } from '@lucide/vue'
import type { Component } from 'vue'
import logoUrl from '../../../asset/logo.png'

interface PromoItem {
  icon: Component
  text: string
}

/** Promotional phrases shown in the infinite header ticker. */
const items: PromoItem[] = [
  { icon: Zap, text: 'Fast Delivery' },
  { icon: ShieldCheck, text: 'Secure KHQR Payments' },
  { icon: Headphones, text: '24/7 Support' },
  { icon: Gem, text: 'Best Prices' },
  { icon: Rocket, text: 'Top-up & Order in Seconds' },
  { icon: Sparkles, text: 'TikTok · Facebook · Instagram · YouTube · Telegram' },
]
</script>

<template>
  <div
    class="group relative z-10 flex h-9 items-center overflow-hidden border-b border-white/10 bg-gradient-to-r from-brand-700 via-brand-600 to-secondary-700"
    role="region"
    aria-label="Promotions"
  >
    <!-- Track holds two identical copies so the loop is seamless. -->
    <div class="marquee-track flex shrink-0 items-center whitespace-nowrap">
      <template v-for="copy in 2" :key="copy">
        <div class="flex items-center" :aria-hidden="copy === 2 || undefined">
          <span
            class="mx-3 inline-flex shrink-0 items-center rounded-md bg-white p-0.5 shadow-sm"
          >
            <img :src="logoUrl" alt="DigitalSMM" class="block h-5 w-auto object-contain" />
          </span>
          <template v-for="(item, i) in items" :key="item.text">
            <span
              class="flex items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-white/95"
            >
              <component :is="item.icon" class="h-3.5 w-3.5 text-secondary-200" />
              {{ item.text }}
            </span>
            <span
              v-if="i < items.length - 1"
              class="h-1 w-1 shrink-0 rounded-full bg-white/40"
              aria-hidden="true"
            />
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.marquee-track {
  animation: marquee 36s linear infinite;
  will-change: transform;
}
.group:hover .marquee-track {
  animation-play-state: paused;
}
@keyframes marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .marquee-track {
    animation: none;
  }
  /* With the loop stopped, show a single copy instead of the duplicated pair. */
  .marquee-track > :nth-child(2) {
    display: none;
  }
}
</style>
