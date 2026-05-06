import { useState } from 'react'
import { Minus, Plus, Trash2, Pencil } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn, formatCurrency } from '@/lib/utils'
import type { CartItem } from '@/types'

interface CartItemRowProps {
    item: CartItem
    onIncrease: () => void
    onDecrease: () => void
    onRemove: () => void
    onEditPrice: () => void
}

export function CartItemRow({ item, onIncrease, onDecrease, onRemove, onEditPrice }: CartItemRowProps) {
    const [confirming, setConfirming] = useState(false)

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-3 px-4 py-3 border-b border-[#192030] hover:bg-[#0F1420] transition-colors group"
        >
            {/* Name + price */}
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#CBD5E1] truncate leading-tight">
                    {item.product.name}
                </p>
                <button
                    onClick={onEditPrice}
                    className="flex items-center gap-1 text-[11px] text-[#3D506A] font-mono mt-0.5 hover:text-orange-400 transition-colors group/price cursor-pointer"
                    title="Editar precio"
                >
                    <Pencil size={9} />
                    {formatCurrency(item.unitPrice)} c/u
                </button>
            </div>

            {/* Qty controls — large touch targets */}
            <div className="flex items-center gap-1.5 shrink-0">
                <button
                    onClick={() => item.quantity > 1 && onDecrease()}
                    className={cn(
                        "w-8 h-8 rounded-lg bg-[#1C2438] text-[#7A8FAA] flex items-center justify-center transition-colors active:scale-95",
                        item.quantity > 1 ? "hover:bg-[#243050] hover:text-[#E4ECF7] cursor-pointer" : "opacity-25 cursor-not-allowed"
                    )}
                >
                    <Minus size={13} />
                </button>
                <span className="w-7 text-center text-[14px] font-bold text-[#E4ECF7] tabular-nums">
                    {item.quantity}
                </span>
                <button
                    onClick={onIncrease}
                    className="w-8 h-8 rounded-lg bg-[#1C2438] hover:bg-[#243050] text-[#7A8FAA] hover:text-[#E4ECF7] flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                >
                    <Plus size={13} />
                </button>
            </div>

            {confirming ? (
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-[#7A8FAA]">¿Quitar?</span>
                    <button
                        onClick={() => setConfirming(false)}
                        className="px-2 h-7 rounded-lg text-[11px] font-semibold bg-[#1C2438] text-[#7A8FAA] hover:text-[#E4ECF7] hover:bg-[#243050] transition-colors cursor-pointer"
                    >
                        No
                    </button>
                    <button
                        onClick={() => { onRemove(); setConfirming(false) }}
                        className="px-2 h-7 rounded-lg text-[11px] font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors cursor-pointer"
                    >
                        Sí
                    </button>
                </div>
            ) : (
                <>
                    {/* Subtotal */}
                    <span className="text-[13px] font-bold font-mono w-20 text-right shrink-0 text-orange-400">
                        {formatCurrency(item.subtotal)}
                    </span>

                    {/* Remove */}
                    <button
                        onClick={() => setConfirming(true)}
                        className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all cursor-pointer"
                    >
                        <Trash2 size={13} />
                    </button>
                </>
            )}
        </motion.div>
    )
}
