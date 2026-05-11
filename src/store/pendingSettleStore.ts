import { create } from 'zustand'
import type { Sale } from '@/types'

interface PendingSettleState {
    clientId: string
    clientName: string
    saleIds: string[]
    debtTotal: number
    sales: Sale[]
    hasDebt: boolean
    set: (clientId: string, clientName: string, saleIds: string[], debtTotal: number, sales: Sale[]) => void
    clear: () => void
}

export const usePendingSettleStore = create<PendingSettleState>((set) => ({
    clientId: '',
    clientName: '',
    saleIds: [],
    debtTotal: 0,
    sales: [],
    hasDebt: false,
    set: (clientId, clientName, saleIds, debtTotal, sales) =>
        set({ clientId, clientName, saleIds, debtTotal, sales, hasDebt: true }),
    clear: () => set({ clientId: '', clientName: '', saleIds: [], debtTotal: 0, sales: [], hasDebt: false }),
}))
