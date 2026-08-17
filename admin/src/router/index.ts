import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { until } from '@vueuse/core'
import { useAuthStore } from '@/stores/auth.store'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/views/AdminLayoutView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: '', name: 'admin-dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'services', name: 'admin-services', component: () => import('@/views/ServicesView.vue') },
      { path: 'categories', name: 'admin-categories', component: () => import('@/views/CategoriesView.vue') },
      { path: 'users', name: 'admin-users', component: () => import('@/views/UsersView.vue') },
      { path: 'users/:id', name: 'admin-user-detail', component: () => import('@/views/UserDetailView.vue') },
      {
        path: 'admins',
        name: 'admin-admins',
        component: () => import('@/views/AdminsView.vue'),
        meta: { requiresSuperAdmin: true },
      },
      { path: 'orders', name: 'admin-orders', component: () => import('@/views/OrdersView.vue') },
      { path: 'payments', name: 'admin-payments', component: () => import('@/views/PaymentsView.vue') },
      { path: 'announcements', name: 'admin-announcements', component: () => import('@/views/AnnouncementsView.vue') },
      { path: 'analytics', name: 'admin-analytics', component: () => import('@/views/AnalyticsView.vue') },
      { path: 'system/health', name: 'admin-system-health', component: () => import('@/views/SystemHealthView.vue') },
      { path: 'settings', name: 'admin-settings', component: () => import('@/views/SettingsView.vue') },
    ],
  },
  {
    path: '/login',
    name: 'admin-login',
    component: () => import('@/views/AdminLoginView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/denied',
    name: 'admin-denied',
    component: () => import('@/views/DeniedView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'admin-not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await until(() => authStore.isLoaded).toBe(true)

  if (to.meta.requiresAuth && !authStore.isSignedIn) {
    return { name: 'admin-login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: 'admin-denied' }
  }
  if (to.meta.requiresSuperAdmin && !authStore.isSuperAdmin) {
    return { name: 'admin-denied' }
  }
  if (to.meta.guestOnly && authStore.isSignedIn) {
    return { name: 'admin-dashboard' }
  }
  return true
})

// Production SPA recovery: if a lazy route chunk can't be fetched, the tab is
// almost certainly running a stale index.html from before the latest deploy
// (Vite renames every chunk with a content hash). One reload pulls the fresh
// build; the sessionStorage guard stops a genuinely broken chunk from looping.
// Inert in dev, where HMR replaces modules in place.
router.onError((error) => {
  if (!import.meta.env.PROD) return
  const message = String(error?.message ?? '')
  if (
    !/(Failed to fetch dynamically imported module|Loading chunk .* failed|Importing a module script failed)/.test(
      message,
    )
  )
    return
  if (sessionStorage.getItem('digitalsmm:chunk-reloaded')) return
  sessionStorage.setItem('digitalsmm:chunk-reloaded', '1')
  window.location.reload()
})

export default router
