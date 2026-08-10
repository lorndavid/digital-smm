<script setup lang="ts">
import LegalPage, { type LegalSection } from '@/components/legal/LegalPage.vue'

const sections: LegalSection[] = [
  {
    heading: '1. What Are Cookies?',
    paragraphs: [
      'Cookies are small text files stored on your device by websites you visit. Similar technologies, such as browser local storage, are used to remember information about you.',
    ],
  },
  {
    heading: '2. How We Use Local Storage',
    paragraphs: [
      'VidSMM primarily uses browser local storage rather than cookies to provide essential functionality:',
    ],
    list: [
      'Keeping you signed in (your session token)',
      'Remembering your preferences, such as light or dark theme',
      'Supporting security features such as rate limiting',
    ],
  },
  {
    heading: '3. Third-Party Services',
    paragraphs: [
      'When you sign in with Google or complete a payment with our payment partners, those services may set their own cookies on their own sites. Their handling of that data is governed by their own policies.',
    ],
  },
  {
    heading: '4. Managing Cookies & Local Storage',
    paragraphs: [
      'You can clear your browser\'s cookies and site data at any time, which will sign you out and reset your preferences. You can also block local storage in your browser settings, although parts of the Service may not work correctly without it.',
    ],
  },
  {
    heading: '5. Changes to This Policy',
    paragraphs: [
      'We may update this Cookies Policy from time to time. Any changes will be posted on this page with a revised "last updated" date.',
    ],
  },
]
</script>

<template>
  <LegalPage title="Cookies Policy" updated="August 10, 2026" :sections="sections" />
</template>
