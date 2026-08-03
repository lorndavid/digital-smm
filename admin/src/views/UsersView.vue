<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Search, ShieldCheck, UserX } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage, formatDate } from '@/utils/format'
import type { AdminUser } from '@/types/models'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const toast = useToast()

const items = ref<AdminUser[]>([])
const total = ref(0)
const loading = ref(true)
const search = ref('')
const page = ref(1)
const pageSize = 15
const acting = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await adminApi.listUsers({
      page: page.value,
      limit: pageSize,
      search: search.value || undefined,
    })
    items.value = result.items
    total.value = result.total
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load users'))
  } finally {
    loading.value = false
  }
}

async function toggleRole(user: AdminUser): Promise<void> {
  acting.value = user._id
  try {
    const updated = await adminApi.updateUser(user._id, {
      role: user.role === 'admin' ? 'customer' : 'admin',
    })
    const index = items.value.findIndex((u) => u._id === user._id)
    if (index !== -1) items.value[index] = updated
    toast.success(`Role updated to ${updated.role}`)
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to update role'))
  } finally {
    acting.value = null
  }
}

async function toggleActive(user: AdminUser): Promise<void> {
  acting.value = user._id
  try {
    const updated = await adminApi.updateUser(user._id, { isActive: !user.isActive })
    const index = items.value.findIndex((u) => u._id === user._id)
    if (index !== -1) items.value[index] = updated
    toast.success(updated.isActive ? 'User activated' : 'User deactivated')
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to update user'))
  } finally {
    acting.value = null
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <div>
      <h1 class="font-display text-2xl font-bold text-white">Users</h1>
      <p class="mt-1 text-sm text-white/50">Manage roles and account status. ({{ total }} users)</p>
    </div>

    <div class="relative max-w-xs">
      <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
      <input
        v-model="search"
        type="search"
        placeholder="Search by name or email…"
        class="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        @keyup.enter="page = 1; void load()"
      />
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 8" :key="n" class="h-16 w-full" />
    </div>

    <BaseEmptyState v-else-if="items.length === 0" title="No users found" message="Try a different search." />

    <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-white/10 text-xs uppercase tracking-wider text-white/40">
            <tr>
              <th class="px-5 py-3 font-medium">User</th>
              <th class="px-5 py-3 font-medium">Role</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium">Last login</th>
              <th class="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.06]">
            <tr v-for="user in items" :key="user._id" class="transition-colors hover:bg-white/[0.03]">
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-secondary-500 text-xs font-bold text-white">
                    {{ (user.name || user.email).slice(0, 2).toUpperCase() }}
                  </div>
                  <div class="min-w-0">
                    <p class="truncate font-medium text-white">{{ user.name || '—' }}</p>
                    <p class="truncate text-xs text-white/40">{{ user.email }}</p>
                  </div>
                </div>
              </td>
              <td class="px-5 py-3.5">
                <BaseBadge :tone="user.role === 'admin' ? 'brand' : 'neutral'">
                  <ShieldCheck v-if="user.role === 'admin'" class="h-3 w-3" />
                  {{ user.role }}
                </BaseBadge>
              </td>
              <td class="px-5 py-3.5">
                <BaseBadge :tone="user.isActive ? 'success' : 'danger'" dot>
                  {{ user.isActive ? 'Active' : 'Disabled' }}
                </BaseBadge>
              </td>
              <td class="px-5 py-3.5 text-white/40">{{ formatDate(user.lastLoginAt) }}</td>
              <td class="px-5 py-3.5">
                <div class="flex justify-end gap-2">
                  <button
                    class="rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    :disabled="acting === user._id"
                    @click="toggleRole(user)"
                  >
                    {{ user.role === 'admin' ? 'Demote' : 'Make admin' }}
                  </button>
                  <button
                    class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
                    :disabled="acting === user._id"
                    @click="toggleActive(user)"
                  >
                    <UserX class="h-3.5 w-3.5" /> {{ user.isActive ? 'Disable' : 'Enable' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="Math.ceil(total / pageSize) > 1" class="flex items-center justify-center gap-3 pt-2">
      <button class="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:border-brand-400/50 disabled:opacity-30" :disabled="page <= 1" @click="page--; void load()">Prev</button>
      <span class="text-sm text-white/50">Page {{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button class="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:border-brand-400/50 disabled:opacity-30" :disabled="page >= Math.ceil(total / pageSize)" @click="page++; void load()">Next</button>
    </div>
  </div>
</template>
