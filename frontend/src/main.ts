import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { MotionPlugin } from '@vueuse/motion'
import App from './App.vue'
import router from './router'
import { useThemeStore } from './stores/theme.store'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(MotionPlugin)
app.use(router)

// Apply the persisted/OS theme to the <html> element.
useThemeStore().init()

app.mount('#app')
