<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowRight, Camera, MessageCircle, Music2, Play, ThumbsUp } from '@lucide/vue'

const router = useRouter()

const platforms = [
  {
    name: 'TikTok',
    icon: Music2,
    gradient: 'from-fuchsia-500 to-cyan-400',
    glow: 'group-hover:shadow-[0_0_40px_-8px_rgba(217,70,239,0.6)]',
    services: ['Followers', 'Likes', 'Views', 'Shares', 'Comments'],
  },
  {
    name: 'Facebook',
    icon: ThumbsUp,
    gradient: 'from-blue-500 to-indigo-500',
    glow: 'group-hover:shadow-[0_0_40px_-8px_rgba(59,130,246,0.6)]',
    services: ['Page Likes', 'Followers', 'Post Likes', 'Video Views', 'Comments'],
  },
  {
    name: 'Instagram',
    icon: Camera,
    gradient: 'from-pink-500 to-amber-400',
    glow: 'group-hover:shadow-[0_0_40px_-8px_rgba(236,72,153,0.6)]',
    services: ['Followers', 'Likes', 'Views', 'Comments', 'Reels'],
  },
  {
    name: 'YouTube',
    icon: Play,
    gradient: 'from-red-500 to-rose-500',
    glow: 'group-hover:shadow-[0_0_40px_-8px_rgba(239,68,68,0.6)]',
    services: ['Subscribers', 'Views', 'Likes', 'Watch Hours', 'Comments'],
  },
  {
    name: 'Telegram',
    icon: MessageCircle,
    gradient: 'from-sky-400 to-blue-500',
    glow: 'group-hover:shadow-[0_0_40px_-8px_rgba(56,189,248,0.6)]',
    services: ['Members', 'Views', 'Reactions', 'Invites', 'Posts'],
  },
]
</script>

<template>
  <section id="services" class="relative py-24">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <p class="text-sm font-semibold uppercase tracking-widest text-brand-300">
          Supported Platforms
        </p>
        <h2 class="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          One platform. <span class="text-gradient">Every network.</span>
        </h2>
        <p class="mt-4 text-ink/60">
          Premium engagement services for the networks your audience lives on.
        </p>
      </div>

      <div class="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="(platform, index) in platforms"
          :key="platform.name"
          v-motion
          :initial="{ opacity: 0, y: 28 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.07 } }"
          class="group glass relative overflow-hidden rounded-3xl p-7 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-ink/20"
          :class="platform.glow"
        >
          <div
            class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25"
            :class="platform.gradient"
          />
          <div
            class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-ink shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
            :class="platform.gradient"
          >
            <component :is="platform.icon" class="h-7 w-7" />
          </div>
          <h3 class="font-display mt-5 text-xl font-bold text-ink">{{ platform.name }}</h3>
          <ul class="mt-4 space-y-2">
            <li
              v-for="service in platform.services"
              :key="service"
              class="flex items-center gap-2 text-sm text-ink/55"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-ink/30" />
              {{ service }}
            </li>
          </ul>
          <button
            class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300 transition-colors hover:text-brand-200"
            @click="router.push('/sign-in')"
          >
            Explore {{ platform.name }} services <ArrowRight class="h-4 w-4" />
          </button>
        </div>

        <!-- CTA card -->
        <div
          v-motion
          :initial="{ opacity: 0, y: 28 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.35 } }"
          class="animate-gradient relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-500 to-secondary-500 p-8 text-center shadow-glow"
        >
          <p class="font-display text-2xl font-bold text-white">500+ services available</p>
          <p class="mt-2 text-sm text-white/80">
            Subscriptions, web traffic, comment replies and more.
          </p>
          <button
            class="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-600 transition-transform hover:scale-105 hover:bg-white/90 active:scale-95"
            @click="router.push('/sign-in')"
          >
            Browse the full catalog <ArrowRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
