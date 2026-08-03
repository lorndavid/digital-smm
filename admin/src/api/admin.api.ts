import { apiClient } from './client'
import type {
  AdminAccount,
  AdminAuditLog,
  AdminIdentity,
  AdminUser,
  Announcement,
  Category,
  DashboardStats,
  ManagedRole,
  Order,
  OrderStatus,
  Paginated,
  Payment,
  PaymentStats,
  Service,
  Setting,
  SyncResult,
  UserDetail,
} from '@/types/models'

interface ListParams {
  page?: number
  limit?: number
  search?: string
  status?: string
  category?: string
}

/** Typed access to the admin API. */
export const adminApi = {
  // Auth (email + password, stored in MongoDB)
  login: async (email: string, password: string): Promise<{ token: string; admin: AdminIdentity }> =>
    (await apiClient.post('/admin/auth/login', { email, password })).data,
  me: async (): Promise<AdminIdentity> => (await apiClient.get('/admin/auth/me')).data,

  // Dashboard
  stats: async (): Promise<DashboardStats> => (await apiClient.get('/admin/stats')).data,
  syncServices: async (): Promise<SyncResult> => (await apiClient.post('/admin/services/sync')).data,

  // Services
  listServices: async (params: ListParams = {}): Promise<Paginated<Service>> =>
    (await apiClient.get('/admin/services', { params })).data,
  createService: async (data: Partial<Service>): Promise<Service> =>
    (await apiClient.post('/admin/services', data)).data,
  updateService: async (id: string, data: Partial<Service>): Promise<Service> =>
    (await apiClient.put(`/admin/services/${id}`, data)).data,
  deleteService: async (id: string): Promise<void> => (await apiClient.delete(`/admin/services/${id}`)).data,
  /** Bulk enable/disable services by ids and/or category (catalog curation). */
  bulkUpdateServices: async (data: {
    ids?: string[]
    categoryId?: string
    isActive: boolean
  }): Promise<{ updated: number; isActive: boolean }> =>
    (await apiClient.post('/admin/services/bulk-status', data)).data,

  // Categories (the backend wraps the list in { items } — unwrap it)
  listCategories: async (): Promise<Category[]> =>
    (await apiClient.get<{ items: Category[] }>('/admin/categories')).data.items,
  createCategory: async (data: Partial<Category>): Promise<Category> =>
    (await apiClient.post('/admin/categories', data)).data,
  updateCategory: async (id: string, data: Partial<Category>): Promise<Category> =>
    (await apiClient.put(`/admin/categories/${id}`, data)).data,
  deleteCategory: async (id: string): Promise<void> => (await apiClient.delete(`/admin/categories/${id}`)).data,

  // Users (role is managed via /admin/admins — never here)
  listUsers: async (params: ListParams = {}): Promise<Paginated<AdminUser>> =>
    (await apiClient.get('/admin/users', { params })).data,
  updateUser: async (id: string, data: { isActive?: boolean }): Promise<AdminUser> =>
    (await apiClient.put(`/admin/users/${id}`, data)).data,
  getUserDetail: async (id: string): Promise<UserDetail> =>
    (await apiClient.get(`/admin/users/${id}`)).data,
  getUserOrders: async (id: string, params: ListParams = {}): Promise<Paginated<Order>> =>
    (await apiClient.get(`/admin/users/${id}/orders`, { params })).data,
  getUserPayments: async (id: string, params: ListParams = {}): Promise<Paginated<Payment>> =>
    (await apiClient.get(`/admin/users/${id}/payments`, { params })).data,

  // Admins & roles (super admin only)
  listAdmins: async (params: ListParams = {}): Promise<Paginated<AdminAccount>> =>
    (await apiClient.get('/admin/admins', { params })).data,
  createAdmin: async (data: {
    email: string
    password: string
    name?: string
    role: ManagedRole
  }): Promise<AdminAccount> => (await apiClient.post('/admin/admins', data)).data,
  setAdminRole: async (id: string, role: ManagedRole): Promise<AdminAccount> =>
    (await apiClient.put(`/admin/admins/${id}/role`, { role })).data,
  removeAdminRole: async (id: string): Promise<{ removed: boolean; email: string }> =>
    (await apiClient.delete(`/admin/admins/${id}/role`)).data,
  listAuditLogs: async (params: ListParams = {}): Promise<Paginated<AdminAuditLog>> =>
    (await apiClient.get('/admin/audit-logs', { params })).data,

  // Orders
  listOrders: async (params: ListParams = {}): Promise<Paginated<Order>> =>
    (await apiClient.get('/admin/orders', { params })).data,
  getOrder: async (id: string): Promise<Order> => (await apiClient.get(`/admin/orders/${id}`)).data,
  updateOrderStatus: async (id: string, status: OrderStatus): Promise<Order> =>
    (await apiClient.put(`/admin/orders/${id}/status`, { status })).data,

  // Payments
  listPayments: async (params: ListParams = {}): Promise<Paginated<Payment>> =>
    (await apiClient.get('/admin/payments', { params })).data,
  paymentStats: async (): Promise<PaymentStats> =>
    (await apiClient.get('/admin/payments/stats')).data,
  exportPayments: async (params: ListParams = {}): Promise<Blob> =>
    (
      await apiClient.get('/admin/payments/export', {
        params,
        responseType: 'blob',
      })
    ).data,

  // Announcements
  listAnnouncements: async (params: ListParams = {}): Promise<Paginated<Announcement>> =>
    (await apiClient.get('/admin/announcements', { params })).data,
  createAnnouncement: async (data: Partial<Announcement>): Promise<Announcement> =>
    (await apiClient.post('/admin/announcements', data)).data,
  updateAnnouncement: async (id: string, data: Partial<Announcement>): Promise<Announcement> =>
    (await apiClient.put(`/admin/announcements/${id}`, data)).data,
  deleteAnnouncement: async (id: string): Promise<void> =>
    (await apiClient.delete(`/admin/announcements/${id}`)).data,

  // Settings
  listSettings: async (): Promise<Setting[]> => (await apiClient.get('/admin/settings')).data,
  setSetting: async (data: { key: string; value: unknown; description?: string }): Promise<Setting> =>
    (await apiClient.put('/admin/settings', data)).data,
}
