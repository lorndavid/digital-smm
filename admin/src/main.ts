import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MotionPlugin } from '@vueuse/motion'
import App from './App.vue'
import router from './router'
import { initTheme } from './utils/theme'
import './style.css'

// Apply the persisted theme (light by default) before first paint.
initTheme()

const app = createApp(App)

app.use(createPinia())
app.use(MotionPlugin)
app.use(router)

app.mount('#app')
