import { create } from 'zustand'
import type { AppPage, SyncInfo } from '@/types'

interface UIState {
    currentPage: AppPage
    setCurrentPage: (page: AppPage) => void
    syncInfo: SyncInfo
    setSyncInfo: (info: Partial<SyncInfo>) => void
    inventorySearch: string
    setInventorySearch: (search: string) => void
}

export const useUIStore = create<UIState>((set) => ({
    currentPage: 'pos',
    setCurrentPage: (page) => set({ currentPage: page }),
    inventorySearch: '',
    setInventorySearch: (search) => set({ inventorySearch: search }),
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
