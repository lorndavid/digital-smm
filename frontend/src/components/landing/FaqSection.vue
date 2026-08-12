<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown } from '@lucide/vue'

const faqs = [
  {
    q: 'How fast is delivery?',
    a: 'Most orders start within minutes and complete in under 30 minutes. Larger orders may take a few hours. You can follow progress live from your dashboard.',
  },
  {
    q: 'Which payment methods do you accept?',
    a: 'We accept Bakong KHQR, ABA KHQR, ACLEDA and Wing. Just top up your wallet by scanning the QR code — funds are credited instantly.',
  },
  {
    q: 'Are the followers real?',
    a: 'All services deliver high-retention engagement designed for safety. Refillable services are automatically topped up if counts drop within the guarantee window.',
  },
  {
    q: 'What happens if an order fails?',
    a: 'If an order cannot be delivered, you get an automatic refund to your wallet or a full refill — whichever applies to your service.',
  },
  {
    q: 'Can I cancel an order?',
    a: 'Orders that support cancellation can be cancelled from your dashboard before completion. Wallet-funded cancellations are refunded immediately.',
  },
  {
    q: 'Do I need a subscription?',
    a: 'No. DigitalSMM is pay-as-you-go. Top up your wallet when you need it — there are no recurring fees.',
  },
]

const openIndex = ref(0)

function toggle(index: number): void {
  openIndex.value = openIndex.value === index ? -1 : index
}
</script>

<template>
  <section id="faq" class="container-page py-14 sm:py-18">
    <div class="text-center">
      <p class="text-xs font-semibold uppercase tracking-widest text-primary">FAQ</p>
      <h2 class="font-display mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Questions? <span class="text-gradient">Answered.</span>
      </h2>
    </div>

    <div class="mx-auto mt-8 max-w-3xl space-y-2">
      <div
        v-for="(faq, index) in faqs"
        :key="faq.q"
        class="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300"
        :class="openIndex === index ? 'border-primary/30' : ''"
      >
        <button
          class="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left"
          :aria-expanded="openIndex === index"
          @click="toggle(index)"
        >
          <span class="text-sm font-semibold text-foreground sm:text-base">{{ faq.q }}</span>
          <ChevronDown
            class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300"
            :class="openIndex === index ? 'rotate-180 text-primary' : ''"
          />
        </button>
        <Transition name="accordion">
          <div v-if="openIndex === index" class="px-5 pb-4">
            <p class="text-sm leading-relaxed text-muted-foreground">{{ faq.a }}</p>
          </div>
        </Transition>
      </div>
    </div>
  </section>
</template>

<style>
.accordion-enter-active,
.accordion-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.accordion-enter-from,
.accordion-leave-to {
  opacity: 0;
  max-height: 0;
}
.accordion-enter-to,
.accordion-leave-from {
  max-height: 300px;
}
</style>
