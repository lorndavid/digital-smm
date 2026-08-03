<script setup lang="ts">
import LandingNavbar from '@/components/landing/LandingNavbar.vue'
import HeroSection from '@/components/landing/HeroSection.vue'
import FeaturesSection from '@/components/landing/FeaturesSection.vue'
import PlatformsSection from '@/components/landing/PlatformsSection.vue'
import HowItWorksSection from '@/components/landing/HowItWorksSection.vue'
import StatsSection from '@/components/landing/StatsSection.vue'
import PricingSection from '@/components/landing/PricingSection.vue'
import FaqSection from '@/components/landing/FaqSection.vue'
import TestimonialsSection from '@/components/landing/TestimonialsSection.vue'
import CtaSection from '@/components/landing/CtaSection.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
</script>

<template>
  <div class="min-h-screen">
    <LandingNavbar />
    <main>
      <HeroSection />
      <FeaturesSection />
      <PlatformsSection />
      <HowItWorksSection />
      <StatsSection />
      <PricingSection />
      <FaqSection />
      <TestimonialsSection />
      <CtaSection />
    </main>
    <LandingFooter />
  </div>
</template>
