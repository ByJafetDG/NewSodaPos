import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HeldOrder, HeldOrderDebt, HeldOrderInvoiceClient, CartItem } from '@/types'

interface HeldOrdersState {
    orders: HeldOrder[]
    saveOrder: (name: string, items: CartItem[], discount: number, pendingDebt?: HeldOrderDebt, id?: string, invoiceClient?: HeldOrderInvoiceClient | null) => void
    updateOrder: (id: string, items: CartItem[], discount: number, pendingDebt?: HeldOrderDebt, invoiceClient?: HeldOrderInvoiceClient | null) => void
    renameOrder: (id: string, name: string) => void
    deleteOrder: (id: string) => void
}

export const useHeldOrdersStore = create<HeldOrdersState>()(
    persist(
        (set) => ({
            orders: [],
            saveOrder: (name, items, discount, pendingDebt, id, invoiceClient) => set(s => ({
                orders: [...s.orders, {
                    id: id ?? crypto.randomUUID(),
                    name: name.trim() || `Cuenta pendiente ${s.orders.length + 1}`,
                    items,
                    discount,
                    savedAt: new Date().toISOString(),
                    pendingDebt,
                    invoiceClient: invoiceClient ?? null,
                }]
            })),
            updateOrder: (id, items, discount, pendingDebt, invoiceClient) => set(s => ({
                orders: s.orders.map(o => o.id === id ? { ...o, items, discount, pendingDebt, invoiceClient: invoiceClient ?? o.invoiceClient } : o)
            })),
            renameOrder: (id, name) => set(s => ({
                orders: s.orders.map(o => o.id === id ? { ...o, name: name.trim() || o.name } : o)
            })),
            deleteOrder: (id) => set(s => ({ orders: s.orders.filter(o => o.id !== id) })),
        }),
        { name: 'pos_held_orders' }
    )
)
