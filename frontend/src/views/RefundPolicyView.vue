<script setup lang="ts">
import LegalPage, { type LegalSection } from '@/components/legal/LegalPage.vue'

const sections: LegalSection[] = [
  {
    heading: '1. Refill & Refund Eligibility',
    paragraphs: [
      'If an order cannot be delivered or fails entirely, we automatically refill the order or refund it to your wallet — whichever applies to your service.',
      'Orders that are partially delivered may be refilled for the missing quantity, in line with the provider\'s delivery report.',
    ],
  },
  {
    heading: '2. Refund Method',
    paragraphs: [
      'Approved refunds are credited to your DigitalSMM wallet balance and can be used for future orders immediately.',
      'KHQR wallet top-ups are not refundable in cash once credited to your account.',
    ],
  },
  {
    heading: '3. Non-Refundable Situations',
    paragraphs: ['Refunds or refills are not available in the following cases:'],
    list: [
      'Orders that were fully delivered, or services consumed in full',
      'Orders placed for content you do not own or manage',
      'Orders cancelled after they have started and cannot be stopped',
      'Delays or partial delivery caused by the social platform itself',
      'Losses caused by incorrect links or quantities supplied by you',
    ],
  },
  {
    heading: '4. How to Request a Refund',
    paragraphs: [
      'Most refunds and refills are handled automatically by our system. If you believe an order qualifies for a refund, contact support with your order ID and we will review it within 48 hours.',
    ],
  },
  {
    heading: '5. Timeframe',
    paragraphs: [
      'Approved refunds are usually credited to your wallet within 24–48 hours of approval. You will see the credit appear in your wallet and payment history.',
    ],
  },
]
</script>

<template>
  <LegalPage title="Refund Policy" updated="August 10, 2026" :sections="sections" />
</template>
