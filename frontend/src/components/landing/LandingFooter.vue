<script setup lang="ts">
import { Camera, MessageCircle, Play, ThumbsUp } from '@lucide/vue'
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
]
</script>

<template>
  <footer class="border-t border-border bg-muted/40">
    <div class="container-page py-10">
      <div class="grid gap-8 lg:grid-cols-6">
        <div class="lg:col-span-2">
          <BrandLogo size="sm" />
          <p class="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            Fast delivery, secure KHQR payments and 24/7 support.
          </p>
          <div class="mt-4 flex gap-2.5">
            <a
              v-for="social in socials"
              :key="social.label"
              :aria-label="social.label"
              :href="social.href"
              :title="social.label"
              target="_blank"
              rel="noopener noreferrer"
              class="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground"
            >
              <component :is="social.icon" class="h-4 w-4" />
            </a>
          </div>
        </div>

        <div v-for="column in columns" :key="column.title" class="lg:col-span-1">
          <h4 class="text-[13px] font-semibold text-foreground">{{ column.title }}</h4>
          <ul class="mt-3 space-y-2">
            <li v-for="link in column.links" :key="link.label">
              <RouterLink
                v-if="link.to && link.to.startsWith('/')"
                :to="link.to"
                class="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {{ link.label }}
              </RouterLink>
              <a
                v-else
                :href="link.to ?? '#'"
                class="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {{ link.label }}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div class="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-5 sm:flex-row">
        <p class="text-xs text-muted-foreground">
          © {{ new Date().getFullYear() }} DigitalSMM. All rights reserved.
        </p>
        <p class="text-xs text-muted-foreground">Made with ❤️ in Cambodia 🇰🇭</p>
      </div>
    </div>
  </footer>
</template>
