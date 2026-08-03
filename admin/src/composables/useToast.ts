import { useToastStore } from '@/stores/toast.store'

export function useToast() {
  const store = useToastStore()
  return {
    success: (message: string) => store.show(message, 'success'),
    error: (message: string) => store.show(message, 'error'),
    info: (message: string) => store.show(message, 'info'),
    warning: (message: string) => store.show(message, 'warning'),
  }
}
