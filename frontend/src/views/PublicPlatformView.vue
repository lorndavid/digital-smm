<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { servicesApi } from '@/api/services.api'
import { useSeo, canonicalUrl, breadcrumbs, organizationSchema, websiteSchema } from '@/seo'
import { SEO_ORIGIN } from '@/seo'
import { PLATFORM_META } from '@/utils/constants'
import LandingNavbar from '@/components/landing/LandingNavbar.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
import SeoHero from '@/components/seo/SeoHero.vue'
import SeoBreadcrumbs from '@/components/seo/SeoBreadcrumbs.vue'
import ServicePricing from '@/components/seo/ServicePricing.vue'
import ServiceBenefits from '@/components/seo/ServiceBenefits.vue'
import ServiceOverview from '@/components/seo/ServiceOverview.vue'
import ServiceFAQ from '@/components/seo/ServiceFAQ.vue'
import ServiceCTA from '@/components/seo/ServiceCTA.vue'
import type { Category, Service } from '@/types/models'

const route = useRoute()
const seo = useSeo()

const VALID_PLATFORMS = ['tiktok', 'facebook', 'instagram', 'youtube', 'telegram'] as const
type PlatformSlug = (typeof VALID_PLATFORMS)[number]

const platform = computed<PlatformSlug | ''>(() => {
  const slug = String(route.params.platform ?? '').toLowerCase()
  return (VALID_PLATFORMS as readonly string[]).includes(slug) ? (slug as PlatformSlug) : ''
})

const categories = ref<Category[]>([])
const services = ref<Service[]>([])
const loading = ref(true)
const loadError = ref('')

const platformLabel = computed(() =>
  platform.value ? PLATFORM_META[platform.value]?.label ?? platform.value : 'Social media',
)

async function load(): Promise<void> {
  if (!platform.value) return
  loading.value = true
  loadError.value = ''
  try {
    // Real data only: categories + services for this platform.
    const [cats, res] = await Promise.all([
      servicesApi.categories(),
      servicesApi.list({ platform: platform.value, limit: 250 }),
    ])
    categories.value = cats.filter((c) => c.name.toLowerCase().includes(platform.value!))
    services.value = res.items
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load services'
  } finally {
    loading.value = false
  }
}

watch(platform, () => void load())
onMounted(() => void load())

// ---------------------------------------------------------------------------
// SEO metadata + schema (route-aware, canonical, real data)
// ---------------------------------------------------------------------------

const seoMeta = computed(() => {
  const p = platform.value
  const label = platformLabel.value
  const path = p ? `/services/${p}` : '/services'
  const canonical = canonicalUrl(path)
  const crumbs = [
    { name: 'Home', url: `${SEO_ORIGIN}/` },
    { name: 'Services', url: `${SEO_ORIGIN}/services` },
    ...(p ? [{ name: label }] : []),
  ]
  const description = p
    ? `Buy real ${label} growth at DigitalSMM — followers, views, likes and more with instant delivery, real-time tracking and secure KHQR payments.`
    : `Browse social media growth services for TikTok, Facebook, Instagram, YouTube and Telegram — instant delivery, real-time tracking and secure KHQR payments.`

  return {
    title: p ? `${label} Growth Services — DigitalSMM` : 'Social Media Growth Services — DigitalSMM',
    description,
    canonical,
    ogTitle: p ? `${label} services — buy real growth` : 'Social Media Growth Services — DigitalSMM',
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

const benefits = computed(() =>
  platform.value
    ? [
        `Instant delivery for ${platformLabel.value} — orders start within minutes of payment.`,
        `Real-time order tracking on your dashboard with live status and remains.`,
        'Secure Bakong KHQR payments — scan, pay, done.',
        'Refill and cancellation support on eligible services.',
      ]
    : [
        'One platform for TikTok, Facebook, Instagram, YouTube and Telegram growth.',
        'Instant delivery with real-time order tracking.',
        'Secure Bakong KHQR payments — no card needed.',
        'Refill and cancellation support on eligible services.',
      ],
)

const faqItems = computed(() => {
  const label = platformLabel.value
  return [
    {
      question: `How fast is delivery for ${label} services?`,
      answer: `Most ${label} orders start within minutes of payment confirmation and show live status on your dashboard. Delivery speed depends on the specific service and current provider queue.`,
    },
    {
      question: 'Is it safe to order?',
      answer: 'We use verified provider infrastructure, secure Bakong KHQR payments and real-time order tracking. Refunds are handled per our Refund Policy when a service cannot be delivered.',
    },
    {
      question: 'How do I pay?',
      answer: 'Payments are made with Bakong KHQR — scan the QR with any supported Cambodian banking app and the order starts automatically once confirmed.',
    },
    {
      question: 'Do you offer refills?',
      answer: 'Many services support refill if your count drops over time. Eligible services are marked in the catalogue, and refills can be requested from your orders page.',
    },
  ]
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <LandingNavbar />
    <main class="pt-24">
      <div class="container-page">
        <SeoBreadcrumbs :items="[{ label: 'Services', to: '/services' }]" />
      </div>

      <SeoHero
        :eyebrow="`${platformLabel} growth`"
        :title="platform ? `Buy real ${platformLabel} growth` : 'Social media growth services'"
        :description="platform ? `Followers, views, likes, comments and more for ${platformLabel} — priced transparently, delivered fast, tracked in real time.` : 'Followers, views, likes and more for TikTok, Facebook, Instagram, YouTube and Telegram — transparent pricing, instant delivery and real-time tracking.'"
        cta-to="/dashboard/services"
        cta-label="Browse all services"
      />

      <div v-if="loading" class="container-page py-10 text-center text-sm text-ink/40">
        Loading services…
      </div>
      <p v-else-if="loadError" class="container-page py-10 text-center text-sm text-rose-300">
        {{ loadError }}
      </p>

      <template v-else>
        <ServicePricing
          v-if="services.length"
          title="Popular services & pricing"
          :services="services.slice(0, 9)"
        />

        <ServiceBenefits :title="`Why choose DigitalSMM for ${platformLabel}`" :benefits="benefits" />

        <ServiceOverview
          :title="`About ${platformLabel} growth services`"
          :body="`DigitalSMM sells real ${platformLabel} growth from vetted providers. Every service lists its price per 1,000 units, minimum and maximum order size and estimated delivery, so you always know what you are paying for.`"
        />

        <ServiceFAQ :items="faqItems" />
        <ServiceCTA />
      </template>
    </main>
    <LandingFooter />
  </div>
</template>
