import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ShoppingCart, Trash2 } from 'lucide-react'
import { CartItemRow } from '@/components/molecules/CartItemRow'
import { EmptyState } from '@/components/atoms/EmptyState'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import type { CartItem, Product } from '@/types'

interface CartPanelProps {
    items: CartItem[]
    onIncrease: (product: Product) => void
    onDecrease: (id: string) => void
    onRemove: (id: string) => void
    onClear: () => void
    onEditPrice: (item: CartItem) => void
}

export function CartPanel({ items, onIncrease, onDecrease, onRemove, onClear, onEditPrice }: CartPanelProps) {
    const totalQty = items.reduce((s, i) => s + i.quantity, 0)
    const [confirmingClear, setConfirmingClear] = useState(false)

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-2">
                    <ShoppingCart size={15} className="text-orange-400" />
                    <span className="text-[13px] font-semibold text-[#CBD5E1]">Carrito</span>
                    {totalQty > 0 && (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500/15 text-orange-400 text-[10px] font-bold">
                            {totalQty}
                        </span>
                    )}
                </div>
                {items.length > 0 && (
                    <button
                        onClick={() => setConfirmingClear(true)}
                        title="Vaciar carrito"
                        className="w-7 h-7 rounded-lg text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all cursor-pointer"
                    >
                        <Trash2 size={13} />
                    </button>
                )}
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto">
                {items.length === 0 ? (
                    <EmptyState
                        icon={<ShoppingCart size={36} />}
                        title="Carrito vacío"
                        description="Toca un producto para agregar"
                        className="py-10"
                    />
                ) : (
                    <AnimatePresence>
                        {items.map(item => (
                            <CartItemRow
                                key={item.id}
                                item={item}
                                onIncrease={() => onIncrease(item.product)}
                                onDecrease={() => onDecrease(item.id)}
                                onRemove={() => onRemove(item.id)}
                                onEditPrice={() => onEditPrice(item)}
                            />
                        ))}
                    </AnimatePresence>
                )}
            </div>
            <DeleteConfirmModal
                isOpen={confirmingClear}
                onClose={() => setConfirmingClear(false)}
                onConfirm={() => { onClear(); setConfirmingClear(false) }}
                title="Vaciar carrito"
                description="¿Quitar todos los productos del carrito?"
            />
        </div>
    )
}
