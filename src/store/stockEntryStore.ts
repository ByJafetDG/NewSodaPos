import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from '@/types'

export interface StockEntry {
    productId: string
    product: Product
    qty: number
}

interface StockEntryState {
    entries: StockEntry[]
    notes: string
    scanMode: boolean
    addEntry: (product: Product) => void
    setQty: (productId: string, qty: number) => void
    moveEntry: (productId: string, direction: 'up' | 'down') => void
    setNotes: (notes: string) => void
    setScanMode: (v: boolean) => void
    clear: () => void
}

export const useStockEntryStore = create<StockEntryState>()(
    persist(
        (set, get) => ({
            entries: [],
            notes: '',
            scanMode: false,

            addEntry: (product) => {
                set(state => {
                    const existing = state.entries.find(e => e.productId === product.id)
                    if (existing) {
                        return {
                            entries: state.entries.map(e =>
                                e.productId === product.id ? { ...e, qty: e.qty + 1 } : e
                            ),
                        }
                    }
                    return { entries: [...state.entries, { productId: product.id, product, qty: 1 }] }
                })
            },

            moveEntry: (productId, direction) => {
                set(state => {
                    const idx = state.entries.findIndex(e => e.productId === productId)
                    if (idx === -1) return state
                    const arr = [...state.entries]
                    if (direction === 'up' && idx > 0) {
                        [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]]
                    } else if (direction === 'down' && idx < arr.length - 1) {
                        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
                    }
                    return { entries: arr }
                })
            },

            setQty: (productId, qty) => {
                if (qty <= 0) {
                    set(state => ({ entries: state.entries.filter(e => e.productId !== productId) }))
                    return
                }
                set(state => ({
                    entries: state.entries.map(e => e.productId === productId ? { ...e, qty } : e),
                }))
            },

            setNotes: (notes) => set({ notes }),

            setScanMode: (v) => set({ scanMode: v }),

            clear: () => set({ entries: [], notes: '' }),
        }),
        { name: 'stock-entry-draft' }
    )
)
