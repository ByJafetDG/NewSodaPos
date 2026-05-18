import { create } from 'zustand'
import type { AppPage, SyncInfo } from '@/types'

interface UIState {
    currentPage: AppPage
    setCurrentPage: (page: AppPage) => void
    syncInfo: SyncInfo
    setSyncInfo: (info: Partial<SyncInfo>) => void
    inventorySearch: string
    setInventorySearch: (search: string) => void
    sinpeUnread: number
    setSinpeUnread: (n: number) => void
    incrementSinpeUnread: () => void
}

export const useUIStore = create<UIState>((set) => ({
    currentPage: 'pos',
    setCurrentPage: (page) => set({ currentPage: page }),
    inventorySearch: '',
    setInventorySearch: (search) => set({ inventorySearch: search }),
    sinpeUnread: 0,
    setSinpeUnread: (n) => set({ sinpeUnread: n }),
    incrementSinpeUnread: () => set((s) => ({ sinpeUnread: s.sinpeUnread + 1 })),
    syncInfo: {
        isOnline: navigator.onLine,
        pendingCount: 0,
        lastSync: null,
        isSyncing: false,
    },
    setSyncInfo: (info) => set((state) => ({
        syncInfo: { ...state.syncInfo, ...info }
    })),
}))
