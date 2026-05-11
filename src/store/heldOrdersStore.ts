import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HeldOrder, HeldOrderDebt, CartItem } from '@/types'

interface HeldOrdersState {
    orders: HeldOrder[]
    saveOrder: (name: string, items: CartItem[], discount: number, pendingDebt?: HeldOrderDebt) => void
    updateOrder: (id: string, items: CartItem[], discount: number, pendingDebt?: HeldOrderDebt) => void
    deleteOrder: (id: string) => void
}

export const useHeldOrdersStore = create<HeldOrdersState>()(
    persist(
        (set) => ({
            orders: [],
            saveOrder: (name, items, discount, pendingDebt) => set(s => ({
                orders: [...s.orders, {
                    id: crypto.randomUUID(),
                    name: name.trim() || `Cuenta pendiente ${s.orders.length + 1}`,
                    items,
                    discount,
                    savedAt: new Date().toISOString(),
                    pendingDebt,
                }]
            })),
            updateOrder: (id, items, discount, pendingDebt) => set(s => ({
                orders: s.orders.map(o => o.id === id ? { ...o, items, discount, pendingDebt } : o)
            })),
            deleteOrder: (id) => set(s => ({ orders: s.orders.filter(o => o.id !== id) })),
        }),
        { name: 'pos_held_orders' }
    )
)
