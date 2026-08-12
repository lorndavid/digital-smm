<script setup lang="ts">
import LandingNavbar from '@/components/landing/LandingNavbar.vue'
import HeroSection from '@/components/landing/HeroSection.vue'
import TrustSection from '@/components/landing/TrustSection.vue'
import PopularProductsSection from '@/components/landing/PopularProductsSection.vue'
import PlatformsSection from '@/components/landing/PlatformsSection.vue'
import HowItWorksSection from '@/components/landing/HowItWorksSection.vue'
import FeaturesSection from '@/components/landing/FeaturesSection.vue'
import PaymentSection from '@/components/landing/PaymentSection.vue'
import FaqSection from '@/components/landing/FaqSection.vue'
import CtaSection from '@/components/landing/CtaSection.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <LandingNavbar />
    <main>
      <HeroSection />
      <TrustSection />
      <PopularProductsSection />
      <PlatformsSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PaymentSection />
      <FaqSection />
      <CtaSection />
    </main>
    <LandingFooter />
  </div>
</template>
