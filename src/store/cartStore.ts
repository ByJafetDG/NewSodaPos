import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, Product, HeldOrderInvoiceClient } from '@/types'

interface CartState {
    items: CartItem[]
    discount: number
    invoiceClient: HeldOrderInvoiceClient | null
    addItem: (product: Product, qty?: number) => void
    removeItem: (productId: string) => void
    removeItems: (ids: string[]) => void
    updateQuantity: (productId: string, qty: number) => void
    updatePrice: (productId: string, newPrice: number) => void
    clearCart: () => void
    loadOrder: (items: CartItem[], discount: number) => void
    getSubtotal: () => number
    getTotal: () => number
    setDiscount: (d: number) => void
    setInvoiceClient: (c: HeldOrderInvoiceClient | null) => void
}

export const useCartStore = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],
            discount: 0,
            invoiceClient: null,
            addItem: (product, qty = 1) => {
                const existing = get().items.find(i => i.id === product.id)
                const currentQty = existing ? existing.quantity : 0
                if (!product.isInfinite && product.stockQty !== undefined && currentQty + qty > product.stockQty) return
                set(state => {
                    const ex = state.items.find(i => i.id === product.id)
                    if (ex) {
                        return {
                            items: state.items.map(i => i.id === product.id
                                ? { ...i, quantity: i.quantity + qty, subtotal: (i.quantity + qty) * i.unitPrice }
                                : i
                            )
                        }
                    }
                    return {
                        items: [...state.items, {
                            id: product.id, product, quantity: qty,
                            unitPrice: product.price, subtotal: qty * product.price, notes: null
                        }]
                    }
                })
            },
            removeItem: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
            removeItems: (ids) => set(s => ({ items: s.items.filter(i => !ids.includes(i.id)) })),
            updateQuantity: (id, qty) => {
                if (qty <= 0) { get().removeItem(id); return }
                set(s => ({ items: s.items.map(i => i.id === id ? { ...i, quantity: qty, subtotal: qty * i.unitPrice } : i) }))
            },
            updatePrice: (id, price) => set(s => ({
                items: s.items.map(i => i.id === id ? { ...i, unitPrice: price, subtotal: i.quantity * price } : i)
            })),
            clearCart: () => set({ items: [], discount: 0, invoiceClient: null }),
            loadOrder: (items, discount) => set({ items, discount }),
            setInvoiceClient: (c) => set({ invoiceClient: c }),
            getSubtotal: () => get().items.reduce((s, i) => s + i.subtotal, 0),
            getTotal: () => Math.max(0, get().getSubtotal() - get().discount),
            setDiscount: (d) => set({ discount: d }),
        }),
        { name: 'pos-cart-v2', partialize: s => ({ items: s.items, discount: s.discount, invoiceClient: s.invoiceClient }) }
    )
)
