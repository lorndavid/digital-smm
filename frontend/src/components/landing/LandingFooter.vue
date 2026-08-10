<script setup lang="ts">
import { Camera, MessageCircle, Play, Send, ThumbsUp } from '@lucide/vue'
import BrandLogo from '../layout/BrandLogo.vue'

interface FooterLink {
  label: string
  /** Real destination: route path ('/dashboard/…'), in-page anchor ('#faq'), or undefined for placeholder links. */
  to?: string
}

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Explore Services', to: '/dashboard/services' },
      { label: 'How It Works', to: '#how-it-works' },
      { label: 'Wallet & KHQR', to: '/dashboard/wallet' },
      { label: 'API Access' },
      { label: 'Affiliates' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About us' },
      { label: 'Careers' },
      { label: 'Partners' },
      { label: 'Blog' },
      { label: 'Press Kit' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help Center', to: '#faq' },
      { label: 'FAQ', to: '#faq' },
      { label: 'Contact us', to: '#contact' },
      { label: 'Order Status', to: '/dashboard/orders' },
      { label: 'Refill Policy', to: '#faq' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Refund Policy', to: '/refund-policy' },
      { label: 'Cookies', to: '/cookies' },
    ],
  },
]

// Social account links — swap these for the real handles whenever you have
// them (one place to update, used by the icon row below).
const socials = [
  { icon: MessageCircle, label: 'Telegram', href: 'https://t.me/digitalsmm' },
  { icon: ThumbsUp, label: 'Facebook', href: 'https://facebook.com/digitalsmm' },
  { icon: Camera, label: 'Instagram', href: 'https://instagram.com/digitalsmm' },
  { icon: Play, label: 'YouTube', href: 'https://youtube.com/@digitalsmm' },
  { icon: Send, label: 'Telegram Channel', href: 'https://t.me/digitalsmm_channel' },
]
</script>

<template>
  <footer class="border-t border-ink/10 bg-card/40">
    <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div class="grid gap-10 lg:grid-cols-6">
        <div class="lg:col-span-2">
          <BrandLogo size="md" />
          <p class="mt-4 max-w-xs text-sm leading-relaxed text-ink/50">
            Fast delivery, secure KHQR payments and 24/7 support.
          </p>
          <div class="mt-5 flex gap-3">
            <a
              v-for="social in socials"
              :key="social.label"
              :aria-label="social.label"
              :href="social.href"
              :title="social.label"
              target="_blank"
              rel="noopener noreferrer"
              class="flex h-9 w-9 items-center justify-center rounded-xl border border-ink/10 text-ink/50 transition-all hover:border-brand-400/50 hover:text-ink"
            >
              <component :is="social.icon" class="h-4 w-4" />
            </a>
          </div>
        </div>

        <div v-for="column in columns" :key="column.title" class="lg:col-span-1">
          <h4 class="text-sm font-semibold text-ink">{{ column.title }}</h4>
          <ul class="mt-4 space-y-2.5">
            <li v-for="link in column.links" :key="link.label">
              <RouterLink
                v-if="link.to && link.to.startsWith('/')"
                :to="link.to"
                class="text-sm text-ink/50 transition-colors hover:text-ink"
              >
                {{ link.label }}
              </RouterLink>
              <a
                v-else
                :href="link.to ?? '#'"
                class="text-sm text-ink/50 transition-colors hover:text-ink"
              >
                {{ link.label }}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div
        class="mt-12 flex flex-col items-center justify-between gap-4 border-t border-ink/10 pt-6 sm:flex-row"
      >
        <p class="text-xs text-ink/40">
          © {{ new Date().getFullYear() }} DigitalSMM. All rights reserved.
        </p>
        <p class="text-xs text-ink/40">Made with ❤️ in Cambodia 🇰🇭</p>
      </div>
    </div>
  </footer>
</template>
