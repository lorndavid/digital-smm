<script setup lang="ts">
import LegalPage, { type LegalSection } from '@/components/legal/LegalPage.vue'

const sections: LegalSection[] = [
  {
    heading: '1. Information We Collect',
    paragraphs: ['When you use VidSMM, we collect the information needed to provide the Service:'],
    list: [
      'Account information from Google sign-in (your name, email address and profile photo)',
      'Order details, including the services you buy and the links and quantities you provide',
      'Payment references and statuses for KHQR wallet top-ups and service payments',
      'Basic technical data such as IP address, device and browser, used for security and rate limiting',
    ],
  },
  {
    heading: '2. How We Use Your Information',
    paragraphs: [
      'We use the information we collect to provide, maintain and improve the Service, including processing orders, crediting wallet top-ups, providing support, preventing fraud and abuse, and meeting legal obligations.',
      'We do not sell your personal information to anyone.',
    ],
  },
  {
    heading: '3. Payment Information',
    paragraphs: [
      'We do not store your card numbers or banking credentials. Payments are handled by our payment partners (Bakong/ABA KHQR and similar providers). We only store payment reference IDs and statuses to reconcile your transactions.',
    ],
  },
  {
    heading: '4. Cookies & Local Storage',
    paragraphs: [
      'We use browser local storage to keep you signed in (session token) and to remember preferences such as your theme. We do not use third-party advertising cookies or cross-site tracking.',
      'See our Cookies Policy for more details.',
    ],
  },
  {
    heading: '5. Data Retention',
    paragraphs: [
      'We keep your information for as long as your account is active, plus a reasonable period afterwards to meet legal, tax and accounting obligations.',
    ],
  },
  {
    heading: '6. Third-Party Services',
    paragraphs: [
      'Google provides authentication, and our payment providers process your KHQR transactions. These services may collect data under their own privacy policies, which we encourage you to review.',
    ],
  },
  {
    heading: '7. Your Rights',
    paragraphs: [
      'You can access and correct your account information in your profile settings at any time. To request deletion of your data or account, contact us using the details below.',
    ],
  },
  {
    heading: '8. Contact Us',
    paragraphs: ['If you have any questions about this Privacy Policy, contact us at support@vidsmm.com.'],
  },
]
</script>

<template>
  <LegalPage title="Privacy Policy" updated="August 10, 2026" :sections="sections" />
</template>
