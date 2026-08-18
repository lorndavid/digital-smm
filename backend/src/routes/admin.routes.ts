import { Router } from 'express'
import { adminController } from '../controllers/admin.controller.js'
import { adminOnly, requireSuperAdmin } from '../middleware/admin.middleware.js'
import {
  adminMutationLimiter,
  integrationTestLimiter,
  loginLimiter,
} from '../middleware/rate-limit.middleware.js'
import { validate } from '../middleware/validate.middleware.js'

export const adminRoutes = Router()

// Public admin auth — no JWT required.
adminRoutes.post('/admin/auth/login', loginLimiter, ...adminController.login)

// Everything below requires a valid admin session JWT (email + password,
// stored in MongoDB). Scoped to /admin so the guard does not intercept
// unrelated /api paths.
adminRoutes.use('/admin', adminOnly)

// Current admin profile.
adminRoutes.get('/admin/auth/me', adminController.me)

adminRoutes.get('/admin/stats', adminController.dashboard)
adminRoutes.post('/admin/services/sync', adminController.syncServices)

// Analytics (database-backed)
adminRoutes.get('/admin/analytics/revenue', adminController.analyticsRevenue)
adminRoutes.get('/admin/analytics/overview', adminController.analyticsOverview)
adminRoutes.get('/admin/analytics/services', adminController.analyticsServices)

// System health
adminRoutes.get('/admin/system/health', adminController.systemHealth)

// Operations center: incidents + deployment history (admin authenticated)
adminRoutes.get('/admin/system/incidents', ...adminController.listIncidents)
adminRoutes.post('/admin/system/incidents/:id/resolve', adminController.resolveIncident)
adminRoutes.get('/admin/system/deployments', ...adminController.listDeployments)

// Services
adminRoutes.get('/admin/services', ...adminController.listServices)
adminRoutes.post('/admin/services', ...adminController.createService)
// Bulk updates — by ids (toolbar: hide/show/feature) and by filter (category
// curation: enable/disable every service in a category).
adminRoutes.post('/admin/services/bulk', ...adminController.bulkUpdateServices)
adminRoutes.post('/admin/services/bulk-status', ...adminController.bulkSetServiceStatus)
adminRoutes.post('/admin/services/bulk-profit', ...adminController.bulkSetServiceProfit)
adminRoutes.put('/admin/services/:id', ...adminController.updateService)
adminRoutes.delete('/admin/services/:id', adminController.deleteService)

// Categories
adminRoutes.get('/admin/categories', ...adminController.listCategories)
adminRoutes.post('/admin/categories', ...adminController.createCategory)
adminRoutes.put('/admin/categories/:id', ...adminController.updateCategory)
adminRoutes.delete('/admin/categories/:id', adminController.deleteCategory)

// Users (list, detail + per-user activity history)
adminRoutes.get('/admin/users', ...adminController.listUsers)
adminRoutes.get('/admin/users/:id', adminController.getUserDetail)
adminRoutes.get('/admin/users/:id/orders', ...adminController.getUserOrders)
adminRoutes.get('/admin/users/:id/payments', ...adminController.getUserPayments)
adminRoutes.put('/admin/users/:id', ...adminController.updateUser)

// Admins & roles (super admin only) — stored in MongoDB.
// requireAdminAuth already ran for the whole /admin prefix via `adminOnly`;
// only the extra role gate is applied per-route.
adminRoutes.get('/admin/admins', requireSuperAdmin, ...adminController.listAdmins)
adminRoutes.post('/admin/admins', requireSuperAdmin, adminMutationLimiter, ...adminController.createAdmin)
adminRoutes.put(
  '/admin/admins/:id/role',
  requireSuperAdmin,
  adminMutationLimiter,
  ...adminController.setAdminRole,
)
adminRoutes.delete(
  '/admin/admins/:id/role',
  requireSuperAdmin,
  adminMutationLimiter,
  adminController.removeAdminRole,
)
adminRoutes.get('/admin/audit-logs', requireSuperAdmin, ...adminController.listAuditLogs)

// Orders
adminRoutes.get('/admin/orders', ...adminController.listOrders)
adminRoutes.get('/admin/orders/:id', adminController.getOrder)
adminRoutes.put('/admin/orders/:id/status', ...adminController.updateOrderStatus)
// Support-agent "Order again" — re-places an order for the same customer,
// funded from their wallet (audited in the admin activity trail).
adminRoutes.post('/admin/orders/:id/again', adminController.placeOrderAgain)

// Payments
adminRoutes.get('/admin/payments', ...adminController.listPayments)
adminRoutes.get('/admin/payments/stats', adminController.paymentsStats)
adminRoutes.get('/admin/payments/export', ...adminController.paymentsExport)

// Announcements
adminRoutes.get('/admin/announcements', ...adminController.listAnnouncements)
adminRoutes.post('/admin/announcements', ...adminController.createAnnouncement)
adminRoutes.put('/admin/announcements/:id', ...adminController.updateAnnouncement)
adminRoutes.delete('/admin/announcements/:id', adminController.deleteAnnouncement)

// Settings
adminRoutes.get('/admin/settings', adminController.listSettings)
adminRoutes.get('/admin/settings/:key', adminController.getSetting)
adminRoutes.put('/admin/settings', ...adminController.setSetting)

// Integrations (encrypted provider credentials)
// All mutations require an authenticated admin (adminOnly already ran for
// the /admin prefix). Test endpoints carry their own strict limiter.
adminRoutes.get('/admin/integrations', adminController.listIntegrations)
adminRoutes.get('/admin/integrations/:provider', adminController.getIntegration)
adminRoutes.put('/admin/integrations/:provider', ...adminController.saveIntegration)
adminRoutes.delete('/admin/integrations/:provider', adminController.deleteIntegration)
adminRoutes.post('/admin/integrations/:provider/enable', ...adminController.setIntegrationEnabled)
adminRoutes.post(
  '/admin/integrations/:provider/test',
  integrationTestLimiter,
  adminController.testIntegration,
)
adminRoutes.post(
  '/admin/integrations/telegram/test-message',
  integrationTestLimiter,
  adminController.sendTelegramTestMessage,
)


