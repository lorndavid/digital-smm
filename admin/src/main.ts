import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MotionPlugin } from '@vueuse/motion'
import App from './App.vue'
import router from './router'
import { initTheme } from './utils/theme'
import { initMonitoring } from './monitoring'
import './style.css'

// Apply the persisted theme (light by default) before first paint.
initTheme()

const app = createApp(App)

app.use(createPinia())
app.use(MotionPlugin)
app.use(router)

// Boot monitoring after the app/router exist so Sentry binds to them.
initMonitoring(app, router)

app.mount('#app')
