import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MotionPlugin } from '@vueuse/motion'
import App from './App.vue'
import router from './router'
import { useThemeStore } from './stores/theme.store'
import { initialize, pageView } from './analytics'
import { initMonitoring } from './monitoring'
import './style.css'

// Load the GA4 tag once (idempotent, fails gracefully when disabled).
initialize()

const app = createApp(App)

app.use(createPinia())
app.use(MotionPlugin)
app.use(router)

// Boot monitoring after the app/router exist so Sentry binds to them.
initMonitoring(app, router)

// Apply the persisted/OS theme to the <html> element.
useThemeStore().init()

// Central SPA route tracking — every navigation sends a page_view event
// (no per-component analytics calls needed).
router.afterEach((to) => {
  pageView({ route_name: typeof to.name === 'string' ? to.name : String(to.name ?? '') })
})

app.mount('#app')
