<script setup lang="ts">
import LegalPage, { type LegalSection } from '@/components/legal/LegalPage.vue'

const sections: LegalSection[] = [
  {
    heading: '1. Acceptance of Terms',
    paragraphs: [
      'By creating an account or using VidSMM ("the Service"), you agree to these Terms of Service. If you do not agree with any part of these terms, please do not use the Service.',
    ],
  },
  {
    heading: '2. Description of Service',
    paragraphs: [
      'VidSMM is a social media marketing platform that lets you purchase growth services — such as followers, likes, views and similar — for platforms including TikTok, Facebook, Instagram, YouTube and Telegram.',
      'Services are delivered by third-party providers. We make reasonable efforts to ensure delivery, but delivery start times and completion times vary by service and cannot be guaranteed.',
    ],
  },
  {
    heading: '3. Accounts & Eligibility',
    paragraphs: [
      'You must be at least 18 years old to use the Service. Your account is tied to your Google identity, and you must provide accurate information when signing in.',
      'You are responsible for keeping your login credentials secure and for all activity under your account. We may suspend or close accounts that violate these terms.',
    ],
  },
  {
    heading: '4. Wallet & Payments',
    paragraphs: [
      'VidSMM is pay-as-you-go. You top up your wallet using KHQR payments (Bakong, ABA, ACLEDA or Wing), and orders are paid from your wallet balance.',
      'Top-ups are credited to your wallet instantly once the payment is confirmed. Wallet balances do not expire, but are not redeemable for cash.',
    ],
  },
  {
    heading: '5. Acceptable Use',
    paragraphs: [
      'You agree to only order services for profiles you own or are authorized to manage.',
    ],
    list: [
      'Do not place orders using stolen or fraudulent payment methods',
      'Do not order services for content you do not control',
      'Do not attempt to abuse, spam or manipulate the ordering system',
      'Do not resell services purchased on the platform outside of it',
    ],
  },
  {
    heading: '6. Orders & Delivery',
    paragraphs: [
      'Orders begin processing shortly after they are placed. If an order cannot be completed, it is automatically refunded or refilled in line with our Refund Policy.',
      'We are not responsible for content removed or accounts suspended by the social platforms themselves.',
    ],
  },
  {
    heading: '7. Refunds',
    paragraphs: [
      'Refunds are issued to your wallet balance in accordance with our Refund Policy. KHQR top-up funds are not refundable in cash once credited.',
    ],
  },
  {
    heading: '8. Limitation of Liability',
    paragraphs: [
      'To the maximum extent permitted by law, VidSMM is not liable for indirect, incidental or consequential damages arising from your use of the Service, including losses resulting from actions taken by third-party providers or social platforms.',
    ],
  },
  {
    heading: '9. Changes to These Terms',
    paragraphs: [
      'We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.',
    ],
  },
]
</script>

<template>
  <LegalPage title="Terms of Service" updated="August 10, 2026" :sections="sections" />
</template>
