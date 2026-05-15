import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HeldOrder, HeldOrderDebt, CartItem } from '@/types'

interface HeldOrdersState {
    orders: HeldOrder[]
    saveOrder: (name: string, items: CartItem[], discount: number, pendingDebt?: HeldOrderDebt, id?: string) => void
    updateOrder: (id: string, items: CartItem[], discount: number, pendingDebt?: HeldOrderDebt) => void
    renameOrder: (id: string, name: string) => void
    deleteOrder: (id: string) => void
}

export const useHeldOrdersStore = create<HeldOrdersState>()(
    persist(
        (set) => ({
            orders: [],
            saveOrder: (name, items, discount, pendingDebt, id) => set(s => ({
                orders: [...s.orders, {
                    id: id ?? crypto.randomUUID(),
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
            renameOrder: (id, name) => set(s => ({
                orders: s.orders.map(o => o.id === id ? { ...o, name: name.trim() || o.name } : o)
            })),
            deleteOrder: (id) => set(s => ({ orders: s.orders.filter(o => o.id !== id) })),
        }),
        { name: 'pos_held_orders' }
    )
)
