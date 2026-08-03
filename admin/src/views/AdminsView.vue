<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Clock3, KeyRound, Search, ShieldCheck, UserPlus, UserX } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/composables/useToast'
import { errorMessage, formatDate } from '@/utils/format'
import type { AdminAccount, AdminAuditLog, ManagedRole } from '@/types/models'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const toast = useToast()
const authStore = useAuthStore()

const items = ref<AdminAccount[]>([])
const total = ref(0)
const loading = ref(true)
const search = ref('')
const page = ref(1)
const pageSize = 50
const acting = ref<string | null>(null)

// Create-admin modal
const showCreate = ref(false)
const creating = ref(false)
const form = ref({ email: '', name: '', password: '', role: 'admin' as ManagedRole })
const formError = ref('')

// Audit trail
const auditLogs = ref<AdminAuditLog[]>([])
const auditLoading = ref(false)

const roleTone = (role: string): 'brand' | 'info' | 'neutral' =>
  role === 'super_admin' ? 'brand' : role === 'admin' ? 'info' : 'neutral'

const auditActionLabel = (action: string): string =>
  action === 'admin.create'
    ? 'created admin'
    : action === 'admin.set_role'
      ? 'changed role of'
      : 'removed admin access from'

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await adminApi.listAdmins({
      page: page.value,
      limit: pageSize,
      search: search.value || undefined,
    })
    items.value = result.items
    total.value = result.total
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load admin accounts'))
  } finally {
    loading.value = false
  }
}

async function loadAuditLogs(): Promise<void> {
  auditLoading.value = true
  try {
    const result = await adminApi.listAuditLogs({ page: 1, limit: 10 })
    auditLogs.value = result.items
  } catch {
    // Non-fatal — the trail is best-effort display.
  } finally {
    auditLoading.value = false
  }
}

async function createAdmin(): Promise<void> {
  formError.value = ''
  if (!form.value.email.trim()) {
    formError.value = 'Email is required'
    return
  }
  if (form.value.password.length < 8) {
    formError.value = 'Password must be at least 8 characters'
    return
  }
  creating.value = true
  try {
    await adminApi.createAdmin({
      email: form.value.email.trim(),
      name: form.value.name.trim() || undefined,
      password: form.value.password,
      role: form.value.role,
    })
    toast.success(`Admin created (${form.value.role})`)
    showCreate.value = false
    form.value = { email: '', name: '', password: '', role: 'admin' }
    void load()
  } catch (err) {
    formError.value = errorMessage(err, 'Failed to create admin')
  } finally {
    creating.value = false
  }
}

async function setRole(account: AdminAccount, role: ManagedRole): Promise<void> {
  acting.value = account.id
  try {
    await adminApi.setAdminRole(account.id, role)
    toast.success(`Role updated to ${role}`)
    void load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to update role'))
  } finally {
    acting.value = null
  }
}

async function removeAdmin(account: AdminAccount): Promise<void> {
  if (!window.confirm(`Remove admin access from ${account.email}? They will become a regular customer.`)) {
    return
  }
  acting.value = account.id
  try {
    await adminApi.removeAdminRole(account.id)
    toast.success('Admin access removed')
    void load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to remove admin access'))
  } finally {
    acting.value = null
  }
}

const isSelf = (account: AdminAccount): boolean => account.id === authStore.userId

onMounted(() => {
  void load()
  void loadAuditLogs()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-(--a-text)">Admins &amp; Roles</h1>
        <p class="mt-1 text-sm text-(--a-muted)">
          Super admin only — create admin accounts, promote existing users, and assign roles.
          Showing up to {{ total }} accounts.
        </p>
      </div>
      <BaseButton size="md" @click="showCreate = true">
        <UserPlus class="h-4 w-4" /> Add admin
      </BaseButton>
    </div>

    <div class="relative max-w-xs">
      <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
      <input
        v-model="search"
        type="search"
        placeholder="Search by email or name…"
        class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) pl-10 pr-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        @keyup.enter="page = 1; void load()"
      />
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 6" :key="n" class="h-16 w-full" />
    </div>

    <BaseEmptyState
      v-else-if="items.length === 0"
      title="No admin accounts found"
      message="Add your first admin (email + password + role) or try a different search."
    />

    <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-(--a-border) text-xs uppercase tracking-wider text-(--a-muted-2)">
            <tr>
              <th class="px-5 py-3 font-medium">Account</th>
              <th class="px-5 py-3 font-medium">Role</th>
              <th class="px-5 py-3 font-medium">Created</th>
              <th class="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--a-border)">
            <tr v-for="account in items" :key="account.id" class="transition-colors hover:bg-(--a-hover)">
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-secondary-500 text-xs font-bold text-white"
                  >
                    {{ (account.name || account.email).slice(0, 2).toUpperCase() }}
                  </div>
                  <div class="min-w-0">
                    <p class="truncate font-medium text-(--a-text)">
                      {{ account.name || '—' }}
                      <span v-if="isSelf(account)" class="ml-1 text-xs text-secondary-300">(you)</span>
                    </p>
                    <p class="truncate text-xs text-(--a-muted-2)">{{ account.email }}</p>
                  </div>
                </div>
              </td>
              <td class="px-5 py-3.5">
                <BaseBadge :tone="roleTone(account.role)">
                  <ShieldCheck v-if="account.role !== 'customer'" class="h-3 w-3" />
                  {{ account.role === 'customer' ? 'customer' : account.role }}
                </BaseBadge>
              </td>
              <td class="px-5 py-3.5 text-(--a-muted-2)">{{ formatDate(account.createdAt) }}</td>
              <td class="px-5 py-3.5">
                <div class="flex items-center justify-end gap-2" :class="{ 'pointer-events-none opacity-40': acting === account.id }">
                  <select
                    class="h-9 rounded-lg border border-(--a-border) bg-(--a-sidebar) px-2 text-xs text-(--a-text-soft) focus:border-brand-400/60 focus:outline-none"
                    :value="account.role"
                    :disabled="isSelf(account)"
                    @change="setRole(account, ($event.target as HTMLSelectElement).value as ManagedRole)"
                  >
                    <option value="customer">customer</option>
                    <option value="admin">admin</option>
                    <option value="super_admin">super admin</option>
                  </select>
                  <button
                    v-if="account.role !== 'customer'"
                    class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-300/80 transition-colors hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-40"
                    :disabled="isSelf(account)"
                    :title="isSelf(account) ? 'You cannot remove yourself' : 'Remove admin access'"
                    @click="removeAdmin(account)"
                  >
                    <UserX class="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create admin modal -->
    <BaseModal :open="showCreate" title="Add admin account" max-width="max-w-md" @close="showCreate = false">
      <form class="space-y-4" @submit.prevent="createAdmin">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-(--a-muted)">Email</label>
          <input
            v-model="form.email"
            type="email"
            required
            placeholder="admin@example.com"
            class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) px-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-(--a-muted)">Display name (optional)</label>
          <input
            v-model="form.name"
            type="text"
            placeholder="Admin name"
            class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) px-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
          />
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-(--a-muted)">
            Password <span class="text-(--a-muted-3)">(min 8 chars — email/password login)</span>
          </label>
          <input
            v-model="form.password"
            type="password"
            required
            minlength="8"
            placeholder="••••••••"
            class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) px-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
          />
          <p class="mt-1.5 flex items-center gap-1.5 text-xs text-(--a-muted-3)">
            <KeyRound class="h-3 w-3" /> The password is hashed (scrypt) and stored in MongoDB — never stored in plaintext.
          </p>
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-(--a-muted)">Role</label>
          <select
            v-model="form.role"
            class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-sidebar) px-4 text-sm text-(--a-text) focus:border-brand-400/60 focus:outline-none"
          >
            <option value="admin">Admin — full panel access, cannot manage admins</option>
            <option value="super_admin">Super admin — full access incl. admins &amp; roles</option>
          </select>
        </div>

        <p v-if="formError" class="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-300">
          {{ formError }}
        </p>

        <div class="flex justify-end gap-2 pt-1">
          <BaseButton variant="ghost" :disabled="creating" @click="showCreate = false">Cancel</BaseButton>
          <BaseButton type="submit" :loading="creating">
            <UserPlus class="h-4 w-4" /> Create admin
          </BaseButton>
        </div>
      </form>
    </BaseModal>

    <!-- Audit trail -->
    <div class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="flex items-center gap-2 border-b border-(--a-border) px-5 py-4">
        <Clock3 class="h-4 w-4 text-(--a-muted)" />
        <h2 class="font-display text-sm font-semibold text-(--a-text)">Recent admin activity</h2>
      </div>
      <div v-if="auditLoading" class="space-y-2 p-4">
        <BaseSkeleton v-for="n in 4" :key="n" class="h-10 w-full" />
      </div>
      <div v-else-if="auditLogs.length === 0" class="p-6 text-center text-sm text-(--a-muted-2)">
        No admin actions recorded yet.
      </div>
      <ul v-else class="divide-y divide-(--a-border)">
        <li v-for="log in auditLogs" :key="log._id" class="flex items-center gap-3 px-5 py-3 text-sm">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--a-soft) text-xs font-bold text-(--a-muted)">
            {{ (log.actorEmail || '?').slice(0, 2).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-(--a-text-soft)">
              <span class="font-medium text-(--a-text)">{{ log.actorEmail || 'Unknown' }}</span>
              {{ auditActionLabel(log.action) }}
              <span class="font-medium text-(--a-text)">{{ log.targetEmail || 'a user' }}</span>
              <span v-if="log.details?.role" class="text-secondary-300">→ {{ log.details.role }}</span>
            </p>
          </div>
          <span class="shrink-0 text-xs text-(--a-muted-3)">{{ formatDate(log.createdAt) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
