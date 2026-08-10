<script setup lang="ts">
import { Camera, MessageCircle, Play, Send, ThumbsUp } from '@lucide/vue'
import BrandLogo from '../layout/BrandLogo.vue'

const columns = [
  {
    title: 'Product',
    links: ['Explore Services', 'How It Works', 'Wallet & KHQR', 'API Access', 'Affiliates'],
  },
  {
    title: 'Company',
    links: ['About us', 'Careers', 'Partners', 'Blog', 'Press Kit'],
  },
  {
    title: 'Support',
    links: ['Help Center', 'FAQ', 'Contact us', 'Order Status', 'Refill Policy'],
  },
  {
    title: 'Legal',
    links: ['Terms of Service', 'Privacy Policy', 'Refund Policy', 'Cookies'],
  },
]

const socials = [
  { icon: MessageCircle, label: 'Telegram' },
  { icon: ThumbsUp, label: 'Facebook' },
  { icon: Camera, label: 'Instagram' },
  { icon: Play, label: 'YouTube' },
  { icon: Send, label: 'Telegram Channel' },
]
</script>

<template>
  <footer class="border-t border-ink/10 bg-card/40">
    <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div class="grid gap-10 lg:grid-cols-6">
        <div class="lg:col-span-2">
          <BrandLogo size="md" />
          <p class="mt-4 max-w-xs text-sm leading-relaxed text-ink/50">
            The #1 Cambodia Social Media Marketing Platform. Fast delivery, secure KHQR
            payments and 24/7 support.
          </p>
          <div class="mt-5 flex gap-3">
            <a
              v-for="social in socials"
              :key="social.label"
              :aria-label="social.label"
              href="#"
              class="flex h-9 w-9 items-center justify-center rounded-xl border border-ink/10 text-ink/50 transition-all hover:border-brand-400/50 hover:text-ink"
            >
              <component :is="social.icon" class="h-4 w-4" />
            </a>
          </div>
        </div>

        <div v-for="column in columns" :key="column.title" class="lg:col-span-1">
          <h4 class="text-sm font-semibold text-ink">{{ column.title }}</h4>
          <ul class="mt-4 space-y-2.5">
            <li v-for="link in column.links" :key="link">
              <a href="#" class="text-sm text-ink/50 transition-colors hover:text-ink">
                {{ link }}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div
        class="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ink/10 pt-6 sm:flex-row"
      >
        <p class="text-xs text-ink/40">
          © {{ new Date().getFullYear() }} VidSMM. All rights reserved.
        </p>
        <p class="text-xs text-ink/40">Made with ❤️ in Cambodia 🇰🇭</p>
      </div>
    </div>
  </footer>
</template>
