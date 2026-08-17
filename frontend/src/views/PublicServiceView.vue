<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { servicesApi } from '@/api/services.api'
import { event } from '@/analytics'
import { useSeo, canonicalUrl, breadcrumbs, organizationSchema, websiteSchema, serviceProductSchema } from '@/seo'
import { SEO_ORIGIN } from '@/seo'
import { PLATFORM_META } from '@/utils/constants'
import { formatNumber, formatUnitPrice } from '@/utils/format'
import LandingNavbar from '@/components/landing/LandingNavbar.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
import SeoHero from '@/components/seo/SeoHero.vue'
import SeoBreadcrumbs from '@/components/seo/SeoBreadcrumbs.vue'
import ServiceInformation from '@/components/seo/ServiceInformation.vue'
import ServiceBenefits from '@/components/seo/ServiceBenefits.vue'
import RelatedServices from '@/components/seo/RelatedServices.vue'
import ServiceFAQ from '@/components/seo/ServiceFAQ.vue'
import ServiceCTA from '@/components/seo/ServiceCTA.vue'
import type { Category, Service } from '@/types/models'

const route = useRoute()
const seo = useSeo()

const service = ref<Service | null>(null)
const related = ref<Service[]>([])
const loading = ref(true)
const loadError = ref('')

async function load(): Promise<void> {
  const id = String(route.params.id ?? '')
  if (!id) return
  loading.value = true
  loadError.value = ''
  try {
    const found = await servicesApi.get(id)
    service.value = found
    // Public service view — business-level fields only.
    event('service_view', {
      service_id: found._id,
      service_type: found.type,
      platform: found.category && typeof found.category === 'object' && 'platform' in found.category
        ? (found.category as Category).platform
        : 'other',
      currency: found.currency || 'USD',
      value: found.pricePerUnit,
    })
    // Related = same category, real services only, capped.
    const categoryId =
      found.category && typeof found.category === 'object' && '_id' in found.category
        ? String(found.category._id)
        : typeof found.category === 'string'
          ? found.category
          : ''
    const res = await servicesApi.list({
      category: categoryId || undefined,
      limit: 6,
    })
    related.value = res.items
      .filter((s) => s._id !== found._id)
      .slice(0, 6)
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load service'
    service.value = null
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, () => void load())
onMounted(() => void load())

// ---------------------------------------------------------------------------
// SEO metadata + schema (real service data only)
// ---------------------------------------------------------------------------

const platformOf = computed(() => {
  const s = service.value
  const cat = s?.category
  if (cat && typeof cat === 'object' && 'platform' in cat) {
    const p = (cat as Category).platform
    if (p !== 'other') return p
  }
  return ''
})

const seoMeta = computed(() => {
  const s = service.value
  if (!s) {
    return {
      title: 'Service — DigitalSMM',
      description: 'Social media growth service from DigitalSMM.',
      canonical: canonicalUrl('/services'),
      schemas: [organizationSchema(), websiteSchema()] as object[],
    }
  }

  const categoryName =
    s.category && typeof s.category === 'object' && 'name' in s.category
      ? (s.category as Category).name
      : ''
  const canonical = canonicalUrl(`/service/${s._id}`)
  const crumbs = [
    { name: 'Home', url: `${SEO_ORIGIN}/` },
    { name: 'Services', url: `${SEO_ORIGIN}/services` },
    ...(platformOf.value
      ? [{ name: PLATFORM_META[platformOf.value as keyof typeof PLATFORM_META]?.label ?? platformOf.value, url: `${SEO_ORIGIN}/services/${platformOf.value}` }]
      : []),
    ...(categoryName ? [{ name: categoryName }] : [{ name: s.name }]),
  ]
  const description =
    s.description?.trim() ||
    `${s.name} at DigitalSMM — from ${formatUnitPrice(s.pricePerUnit)} per 1,000 units. Instant delivery, real-time tracking and secure KHQR payments.`

  return {
    title: `${s.name} — Buy now | DigitalSMM`,
    description,
    canonical,
    ogTitle: `${s.name} — DigitalSMM`,
    ogDescription: description,
    ogUrl: canonical,
    ogType: 'product',
    schemas: [
      organizationSchema(),
      websiteSchema(),
      breadcrumbs(crumbs as { name: string; url?: string }[]),
      serviceProductSchema({
        name: s.name,
        description,
        url: canonical,
        price: s.pricePerUnit,
        currency: s.currency || 'USD',
        inStock: s.isActive && s.max > 0,
        sku: s.providerServiceId != null ? String(s.providerServiceId) : undefined,
      }),
    ],
  }
})

seo.applyFrom(seoMeta)

const infoRows = computed(() => {
  const s = service.value
  if (!s) return []
  const rows = [
    { label: 'Price', value: `${formatUnitPrice(s.pricePerUnit)} / 1,000 units` },
    { label: 'Minimum order', value: s.min > 0 ? formatNumber(s.min) : '—' },
    { label: 'Maximum order', value: s.max > 0 ? formatNumber(s.max) : '—' },
  ]
  if (s.deliveryTime) rows.push({ label: 'Estimated start', value: s.deliveryTime })
  rows.push({ label: 'Refill', value: s.refill ? 'Yes' : 'No' })
  rows.push({ label: 'Cancellation', value: s.cancel ? 'Yes' : 'No' })
  return rows
})

const benefits = computed(() => {
  const s = service.value
  const name = s?.name ?? 'this service'
  return [
    `Transparent pricing — ${formatUnitPrice(s?.pricePerUnit ?? 0)} per 1,000 units, no hidden fees.`,
    `Instant delivery — ${name} starts right after your payment is confirmed.`,
    'Real-time tracking on your dashboard with live status and remains.',
    'Secure Bakong KHQR payments — scan, pay, done.',
    s?.refill ? 'Refill support keeps your counts stable if numbers drop.' : 'Order tracking and dashboard support included.',
  ]
})

const faqItems = computed(() => {
  const s = service.value
  const name = s?.name ?? 'this service'
  return [
    {
      question: `How do I order ${name}?`,
      answer: 'Sign in, top up your wallet, choose the service, enter your link and quantity, and confirm. The order starts automatically once payment is confirmed.',
    },
    {
      question: 'How long does delivery take?',
      answer: s?.deliveryTime
        ? `Estimated start for this service is ${s.deliveryTime}. Actual speed depends on the provider queue.`
        : 'Most orders start within minutes of payment confirmation. Actual speed depends on the provider queue.',
    },
    {
      question: 'What if the count drops?',
      answer: s?.refill
        ? 'This service supports refills — request one from your orders page and we restore the lost quantity.'
        : 'This service does not offer refills. Check the service details before ordering.',
    },
    {
      question: 'Is my payment secure?',
      answer: 'Yes — payments use Bakong KHQR with bank-level security, and your order only starts after the payment is verified.',
    },
  ]
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <LandingNavbar />
    <main class="pt-24">
      <div v-if="loading" class="container-page py-20 text-center text-sm text-ink/40">
        Loading service…
      </div>

      <div v-else-if="loadError || !service" class="container-page py-20 text-center">
        <h1 class="font-display text-2xl font-bold text-ink">Service not found</h1>
        <p class="mt-2 text-sm text-ink/50">{{ loadError || 'This service is no longer available.' }}</p>
        <div class="mt-6">
          <RouterLink to="/services" class="text-sm font-semibold text-brand-300 hover:text-brand-200">
            ← Browse all services
          </RouterLink>
        </div>
      </div>

      <template v-else>
        <div class="container-page">
          <SeoBreadcrumbs
            :items="[
              { label: 'Services', to: '/services' },
              ...(platformOf ? [{ label: PLATFORM_META[platformOf as keyof typeof PLATFORM_META]?.label ?? platformOf, to: `/services/${platformOf}` }] : []),
              { label: service.name },
            ]"
          />
        </div>

        <SeoHero
          :eyebrow="platformOf ? (PLATFORM_META[platformOf as keyof typeof PLATFORM_META]?.label ?? platformOf) + ' growth' : 'Social media growth'"
          :title="service.name"
          :description="service.description?.trim() || `Buy ${service.name} at DigitalSMM — from ${formatUnitPrice(service.pricePerUnit)} per 1,000 units.`"
          cta-to="/dashboard/services"
          cta-label="Order now"
        />

        <ServiceInformation :rows="infoRows" title="Service details" />
        <ServiceBenefits title="Why order this service" :benefits="benefits" />

        <RelatedServices :services="related" />
        <ServiceFAQ :items="faqItems" />
        <ServiceCTA />
      </template>
    </main>
    <LandingFooter />
  </div>
</template>
