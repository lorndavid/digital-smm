<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowRight, Mail } from '@lucide/vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
</script>

<template>
  <section id="contact" class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
    <div
      class="animate-gradient relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-600 via-brand-500 to-secondary-500 p-10 text-center shadow-glow sm:p-16"
    >
      <div class="bg-grid pointer-events-none absolute inset-0 opacity-20" />
      <div class="relative mx-auto max-w-2xl">
        <h2 class="font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
          Ready to grow your social media?
        </h2>
        <p class="mt-4 text-white/85">
          Join thousands of creators and agencies in Cambodia already growing with VidSMM.
          Sign up in seconds with your Google account.
        </p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-4">
          <BaseButton
            size="lg"
            variant="secondary"
            @click="router.push('/sign-in')"
          >
            Start Now — it's free <ArrowRight class="h-4 w-4" />
          </BaseButton>
          <a
            href="mailto:support@vidsmm.com"
            class="inline-flex h-12 items-center gap-2 rounded-xl border border-white/40 px-7 text-base font-semibold text-white transition-colors hover:bg-white/10"
          >
            <Mail class="h-4 w-4" /> Contact us
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
