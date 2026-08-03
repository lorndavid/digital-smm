import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { clerkPlugin } from '@clerk/vue'
import { MotionPlugin } from '@vueuse/motion'
import App from './App.vue'
import router from './router'
import './style.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[VidSMM Admin] VITE_CLERK_PUBLISHABLE_KEY is missing — add it to admin/.env ' +
      '(see .env.example). Authentication will be disabled until configured.',
  )
}

const app = createApp(App)

app.use(createPinia())
app.use(clerkPlugin, {
  publishableKey: PUBLISHABLE_KEY ?? '',
  signInForceRedirectUrl: '/',
  signUpForceRedirectUrl: '/',
})
app.use(MotionPlugin)
app.use(router)

app.mount('#app')
