import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2, Pencil, Minus, Plus, Receipt } from 'lucide-react'
import { EmptyState } from '@/components/atoms/EmptyState'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { cn, formatCurrency } from '@/lib/utils'
import type { CartItem, Product } from '@/types'

interface CartTableProps {
    items: CartItem[]
    onIncrease: (product: Product) => void
    onDecrease: (id: string) => void
    onRemove: (id: string) => void
    onEditPrice: (item: CartItem) => void
}

export function CartTable({ items, onIncrease, onDecrease, onRemove, onEditPrice }: CartTableProps) {
    const [removingItem, setRemovingItem] = useState<CartItem | null>(null)

    if (items.length === 0) {
        return (
            <EmptyState
                icon={<Receipt size={48} />}
                title="Sin productos"
                description="Escanea un código de barras para comenzar"
                className="h-full"
            />
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* Table header */}
            <div className="grid items-center gap-2 px-5 py-2 border-b border-[#192030] shrink-0"
                style={{ gridTemplateColumns: '28px 1fr 90px 96px 88px 36px' }}>
                {['#', 'Producto', 'Precio', 'Cantidad', 'Total', ''].map((h, i) => (
                    <span key={i} className={cn(
                        'text-[10px] uppercase tracking-widest text-[#3D506A] font-semibold',
                        i >= 2 && i < 5 ? 'text-right' : ''
                    )}>{h}</span>
                ))}
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto">
                <AnimatePresence>
                    {items.map((item, index) => (
                        <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20, height: 0 }}
                            transition={{ duration: 0.18 }}
                            className={cn(
                                'grid items-center gap-2 px-5 py-3 border-b border-[#192030]/60',
                                'hover:bg-[#101520] transition-colors group',
                                index % 2 === 0 ? 'bg-[#0D1117]' : 'bg-transparent'
                            )}
                            style={{ gridTemplateColumns: '28px 1fr 90px 96px 88px 36px' }}
                        >
                            {/* # */}
                            <span className="text-[12px] text-[#3D506A] font-mono">{index + 1}</span>

                            {/* Product */}
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium text-[#CBD5E1] truncate">
                                    {item.product.name}
                                </p>
                                {item.product.barcode && (
                                    <p className="text-[10px] text-[#3D506A] font-mono mt-0.5">{item.product.barcode}</p>
                                )}
                            </div>

                            {/* Price — editable */}
                            <button
                                onClick={() => onEditPrice(item)}
                                className="flex items-center justify-end gap-1 text-[12px] text-[#7A8FAA] font-mono hover:text-orange-400 transition-colors group/p cursor-pointer"
                                title="Editar precio"
                            >
                                <Pencil size={9} />
                                {formatCurrency(item.unitPrice)}
                            </button>

                            {/* Qty controls */}
                            <div className="flex items-center justify-center gap-1.5">
                                <button
                                    onClick={() => item.quantity > 1 && onDecrease(item.id)}
                                    className={cn(
                                        "w-7 h-7 rounded-lg bg-[#1C2438] text-[#7A8FAA] flex items-center justify-center transition-colors active:scale-95",
                                        item.quantity > 1 ? "hover:bg-[#243050] hover:text-white cursor-pointer" : "opacity-25 cursor-not-allowed"
                                    )}
                                >
                                    <Minus size={12} />
                                </button>
                                <span className="w-7 text-center text-[14px] font-bold text-[#E4ECF7] tabular-nums">
                                    {item.quantity}
                                </span>
                                <button
                                    onClick={() => onIncrease(item.product)}
                                    className="w-7 h-7 rounded-lg bg-[#1C2438] hover:bg-[#243050] text-[#7A8FAA] hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>

                            {/* Subtotal */}
                            <span className="text-[13px] font-bold text-orange-400 font-mono text-right">
                                {formatCurrency(item.subtotal)}
                            </span>

                            {/* Remove */}
                            <button
                                onClick={() => setRemovingItem(item)}
                                className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all cursor-pointer"
                            >
                                <Trash2 size={13} />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <DeleteConfirmModal
                isOpen={removingItem !== null}
                onClose={() => setRemovingItem(null)}
                onConfirm={() => { onRemove(removingItem!.id); setRemovingItem(null) }}
                title="Quitar producto"
                description={`¿Quitar "${removingItem?.product.name}" del carrito?`}
            />
        </div>
    )
}
