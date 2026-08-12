<script setup lang="ts">
import { Headphones, Rocket, ShieldCheck, Zap } from '@lucide/vue'
import type { Component } from 'vue'

interface TrustItem {
  icon: Component
  title: string
  description: string
}

/** Real platform capabilities — no invented statistics. */
const items: TrustItem[] = [
  {
    icon: ShieldCheck,
    title: 'Secure payment',
    description: 'Top up with KHQR through Bakong, ABA, ACLEDA or Wing.',
  },
  {
    icon: Zap,
    title: 'Fast processing',
    description: 'Orders start within minutes of being placed.',
  },
  {
    icon: Headphones,
    title: '24/7 support',
    description: 'Our Cambodia-based team is always available.',
  },
  {
    icon: Rocket,
    title: 'Instant delivery',
    description: 'Delivery begins automatically after payment.',
  },
]
</script>

<template>
  <section class="border-y border-border bg-muted/40">
    <div class="container-page grid grid-cols-1 gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="(item, index) in items"
        :key="item.title"
        v-motion
        :initial="{ opacity: 0, y: 20 }"
        :visible="{ opacity: 1, y: 0, transition: { duration: 0.45, delay: index * 0.06 } }"
        class="flex items-start gap-3 bg-background px-5 py-6"
      >
        <span
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary"
        >
          <component :is="item.icon" class="h-4 w-4" />
        </span>
        <div>
          <h3 class="text-[13px] font-semibold text-foreground">{{ item.title }}</h3>
          <p class="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{{ item.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
