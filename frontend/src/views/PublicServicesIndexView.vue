<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight } from '@lucide/vue'
import { useSeo, canonicalUrl, breadcrumbs, organizationSchema, websiteSchema } from '@/seo'
import { SEO_ORIGIN } from '@/seo'
import LandingNavbar from '@/components/landing/LandingNavbar.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
import SeoHero from '@/components/seo/SeoHero.vue'
import SeoBreadcrumbs from '@/components/seo/SeoBreadcrumbs.vue'
import ServiceBenefits from '@/components/seo/ServiceBenefits.vue'
import ServiceFAQ from '@/components/seo/ServiceFAQ.vue'
import ServiceCTA from '@/components/seo/ServiceCTA.vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import type { Platform } from '@/types/models'

const seo = useSeo()

const seoMeta = computed(() => {
  const canonical = canonicalUrl('/services')
  const crumbs = [
    { name: 'Home', url: `${SEO_ORIGIN}/` },
    { name: 'Services' },
  ]
  const description =
    'Browse social media growth services for TikTok, Facebook, Instagram, YouTube and Telegram — instant delivery, real-time tracking and secure KHQR payments.'
  return {
    title: 'Social Media Growth Services — DigitalSMM',
    description,
    canonical,
    ogTitle: 'Social Media Growth Services — DigitalSMM',
    ogDescription: description,
    ogUrl: canonical,
    ogType: 'website',
    schemas: [
      organizationSchema(),
      websiteSchema(),
      breadcrumbs(crumbs as { name: string; url?: string }[]),
    ],
  }
})

seo.applyFrom(seoMeta)

const platforms: Array<{ slug: Platform; label: string; blurb: string }> = [
  { slug: 'tiktok', label: 'TikTok', blurb: 'Followers, views, likes, comments and live-stream growth.' },
  { slug: 'facebook', label: 'Facebook', blurb: 'Page likes, post reactions, video views and live-stream viewers.' },
  { slug: 'instagram', label: 'Instagram', blurb: 'Followers, reels plays, likes, comments and story views.' },
  { slug: 'youtube', label: 'YouTube', blurb: 'Subscribers, views, likes, comments and watch-time growth.' },
  { slug: 'telegram', label: 'Telegram', blurb: 'Channel members, post views and reactions.' },
]

const faqItems = [
  {
    question: 'How do I order?',
    answer: 'Sign in with Google, top up your wallet with Bakong KHQR, pick a service, enter your link and quantity, and confirm. Orders start automatically once payment is verified.',
  },
  {
    question: 'Are these real followers and views?',
    answer: 'We work with vetted SMM providers. Real-time tracking on your dashboard shows live order status and delivery progress for every order.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'Bakong KHQR — scan the QR with any supported Cambodian banking app. No card required.',
  },
  {
    question: 'Do you offer refunds?',
    answer: 'Orders that cannot be delivered are refunded per our Refund Policy. Request a refill for drops on eligible services from your orders page.',
  },
]
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <LandingNavbar />
    <main class="pt-24">
      <div class="container-page">
        <SeoBreadcrumbs :items="[{ label: 'Services' }]" />
      </div>

      <SeoHero
        eyebrow="Growth services"
        title="Social media growth services"
        description="Followers, views, likes and more for the platforms that matter — transparent pricing, instant delivery and real-time tracking."
        cta-to="/dashboard/services"
        cta-label="Browse all services"
      />

      <section class="py-8">
        <div class="container-page">
          <h2 class="font-display text-xl font-bold text-ink sm:text-2xl">Choose a platform</h2>
          <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RouterLink
              v-for="platform in platforms"
              :key="platform.slug"
              :to="`/services/${platform.slug}`"
              class="glass group rounded-2xl p-5 shadow-card transition-all hover:border-brand-400/50"
            >
              <div class="flex items-center gap-3">
                <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-ink/5 text-ink/70">
                  <PlatformIcon :platform="platform.slug" size="md" />
                </span>
                <div>
                  <h3 class="font-display font-bold text-ink">{{ platform.label }}</h3>
                  <p class="text-xs text-ink/50">Growth services</p>
                </div>
              </div>
              <p class="mt-3 text-[13px] leading-relaxed text-ink/60">{{ platform.blurb }}</p>
              <span class="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-300">
                Explore {{ platform.label }} <ArrowRight class="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </RouterLink>
          </div>
        </div>
      </section>

      <ServiceBenefits
        title="Why DigitalSMM"
        :benefits="[
          'One dashboard for TikTok, Facebook, Instagram, YouTube and Telegram growth.',
          'Instant delivery with real-time order tracking and remains.',
          'Secure Bakong KHQR payments — scan, pay, done.',
          'Refill and cancellation support on eligible services.',
        ]"
      />

      <ServiceFAQ :items="faqItems" />
      <ServiceCTA />
    </main>
    <LandingFooter />
  </div>
</template>
