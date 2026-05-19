import { create } from 'zustand'
import type { CartItem } from '@/types'

interface PendingSaleLoad {
    items: CartItem[] | null
    discount: number
    originalSaleId: string | null
    originalSaleNumber: number | null
    originalClientName: string | null
    originalClientId: string | null
    originalSaleSnapshot: string | null
    originalCompanyId: string | null
    originalConsumerName: string | null
    originalPhysicalInvoiceNumber: string | null
    set: (
        items: CartItem[],
        discount: number,
        originalSaleId: string,
        originalSaleNumber: number,
        originalClientName: string | null,
        originalSaleSnapshot?: string | null,
        originalCompanyId?: string | null,
        originalClientId?: string | null,
        originalConsumerName?: string | null,
        originalPhysicalInvoiceNumber?: string | null
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
    originalClientId: null,
    originalSaleSnapshot: null,
    originalCompanyId: null,
    originalConsumerName: null,
    originalPhysicalInvoiceNumber: null,
    set: (items, discount, originalSaleId, originalSaleNumber, originalClientName, originalSaleSnapshot = null, originalCompanyId = null, originalClientId = null, originalConsumerName = null, originalPhysicalInvoiceNumber = null) =>
        set({ items, discount, originalSaleId, originalSaleNumber, originalClientName, originalSaleSnapshot, originalCompanyId, originalClientId, originalConsumerName, originalPhysicalInvoiceNumber }),
    clear: () => set({ items: null, discount: 0 }),
    clearModifying: () => set({ originalSaleId: null, originalSaleNumber: null, originalClientName: null, originalClientId: null, originalSaleSnapshot: null, originalCompanyId: null, originalConsumerName: null, originalPhysicalInvoiceNumber: null }),
}))
