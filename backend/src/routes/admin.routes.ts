import { Router } from 'express'
import { adminController } from '../controllers/admin.controller.js'
import { adminOnly } from '../middleware/admin.middleware.js'

export const adminRoutes = Router()

// Everything below requires an admin role claim in the Clerk session token.
// Scoped to /admin so the guard does not intercept unrelated /api paths.
adminRoutes.use('/admin', adminOnly)

adminRoutes.get('/admin/stats', adminController.dashboard)
adminRoutes.post('/admin/services/sync', adminController.syncServices)

// Services
adminRoutes.get('/admin/services', ...adminController.listServices)
adminRoutes.post('/admin/services', ...adminController.createService)
adminRoutes.put('/admin/services/:id', ...adminController.updateService)
adminRoutes.delete('/admin/services/:id', adminController.deleteService)

// Categories
adminRoutes.get('/admin/categories', adminController.listCategories)
adminRoutes.post('/admin/categories', ...adminController.createCategory)
adminRoutes.put('/admin/categories/:id', ...adminController.updateCategory)
adminRoutes.delete('/admin/categories/:id', adminController.deleteCategory)

// Users
adminRoutes.get('/admin/users', ...adminController.listUsers)
adminRoutes.put('/admin/users/:id', ...adminController.updateUser)

// Orders
adminRoutes.get('/admin/orders', ...adminController.listOrders)
adminRoutes.get('/admin/orders/:id', adminController.getOrder)
adminRoutes.put('/admin/orders/:id/status', ...adminController.updateOrderStatus)

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
