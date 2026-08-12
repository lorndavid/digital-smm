<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowRight } from '@lucide/vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'

const router = useRouter()

const platforms = [
  {
    key: 'tiktok',
    name: 'TikTok',
    services: ['Followers', 'Likes', 'Views', 'Comments'],
  },
  {
    key: 'facebook',
    name: 'Facebook',
    services: ['Page Likes', 'Followers', 'Video Views'],
  },
  {
    key: 'instagram',
    name: 'Instagram',
    services: ['Followers', 'Reels Likes', 'Views'],
  },
  {
    key: 'youtube',
    name: 'YouTube',
    services: ['Subscribers', 'Views', 'Likes'],
  },
  {
    key: 'telegram',
    name: 'Telegram',
    services: ['Members', 'Views', 'Invites'],
  },
  {
    key: 'other',
    name: 'And many more',
    services: ['X', 'Threads', 'Web traffic'],
  },
]
</script>

<template>
  <section id="services" class="bg-muted/40 py-14 sm:py-18">
    <div class="container-page">
      <div class="mx-auto max-w-2xl text-center">
        <p class="text-xs font-semibold uppercase tracking-widest text-primary">Categories</p>
        <h2 class="font-display mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          One platform. <span class="text-gradient">Every network.</span>
        </h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Premium engagement services for the platforms your audience lives on.
        </p>
      </div>

      <div class="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="(platform, index) in platforms"
          :key="platform.key"
          v-motion
          :initial="{ opacity: 0, y: 24 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.07 } }"
          class="group rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
        >
          <div class="flex items-center gap-3">
            <PlatformIcon :platform="platform.key" size="md" tile />
            <h3 class="font-display text-base font-semibold text-foreground">{{ platform.name }}</h3>
          </div>
          <ul class="mt-4 space-y-1.5">
            <li
              v-for="service in platform.services"
              :key="service"
              class="flex items-center gap-2 text-[13px] text-muted-foreground"
            >
              <span class="h-1 w-1 shrink-0 rounded-full bg-primary/50" />
              {{ service }}
            </li>
          </ul>
          <button
            class="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary transition-colors hover:text-primary/80"
            @click="router.push('/dashboard/services')"
          >
            Explore {{ platform.name }} <ArrowRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
