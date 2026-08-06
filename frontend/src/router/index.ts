import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { until } from '@vueuse/core'
import { useAuthStore } from '@/stores/auth.store'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/LandingView.vue'),
  },
  {
    path: '/sign-in',
    name: 'sign-in',
    component: () => import('@/views/SignInView.vue'),
    meta: { guestOnly: true },
  },
  {
    // Google redirects here after consent (?code=…&state=…). The view
    // exchanges the code, stores the session and continues to the dashboard.
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('@/views/AuthCallbackView.vue'),
  },
  {
    path: '/pay/:reference',
    name: 'payment',
    component: () => import('@/views/PaymentView.vue'),
    meta: { requiresAuth: true },
  },
  {
    // Landing page for CutLuy hosted-checkout redirects
    // (?status=&payment_id=&reference_id=). Kept auth-free so redirects work
    // even when the customer isn't signed in.
    path: '/payment-result',
    name: 'payment-result',
    component: () => import('@/views/PaymentResultView.vue'),
  },
  {
    path: '/dashboard',
    component: () => import('@/views/DashboardLayoutView.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardHomeView.vue'),
      },
      {
        path: 'services',
        name: 'services',
        component: () => import('@/views/ExploreServicesView.vue'),
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('@/views/OrdersView.vue'),
      },
      {
        path: 'orders/:id',
        name: 'order-detail',
        component: () => import('@/views/OrderDetailView.vue'),
      },
      {
        path: 'wallet',
        name: 'wallet',
        component: () => import('@/views/WalletView.vue'),
      },
      {
        path: 'payments',
        name: 'payments',
        component: () => import('@/views/PaymentsView.vue'),
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/ProfileView.vue'),
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
      },
    ],
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/ForbiddenView.vue'),
  },
  {
    path: '/500',
    name: 'server-error',
    component: () => import('@/views/ServerErrorView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
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

  // Wait for the session rehydration (App.vue → authStore.init) before
  // deciding anything.
  await until(() => authStore.isLoaded).toBe(true)

  if (to.meta.requiresAuth && !authStore.isSignedIn) {
    return { name: 'sign-in', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: 'forbidden' }
  }
  if (to.meta.guestOnly && authStore.isSignedIn) {
    return { name: 'dashboard' }
  }
  return true
})

export default router
