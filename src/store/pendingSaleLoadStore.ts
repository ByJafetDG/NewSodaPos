import { create } from 'zustand'
import type { CartItem } from '@/types'

interface PendingSaleLoad {
    items: CartItem[] | null
    discount: number
    originalSaleId: string | null
    originalSaleNumber: number | null
    originalClientName: string | null
    set: (
        items: CartItem[],
        discount: number,
        originalSaleId: string,
        originalSaleNumber: number,
        originalClientName: string | null
    ) => void
    clear: () => void
    clearModifying: () => void
}

export const usePendingSaleLoadStore = create<PendingSaleLoad>((set) => ({
    items: null,
    discount: 0,
    originalSaleId: null,
    originalSaleNumber: null,
    originalClientName: null,
    set: (items, discount, originalSaleId, originalSaleNumber, originalClientName) =>
        set({ items, discount, originalSaleId, originalSaleNumber, originalClientName }),
    clear: () => set({ items: null, discount: 0 }),
    clearModifying: () => set({ originalSaleId: null, originalSaleNumber: null, originalClientName: null }),
}))
