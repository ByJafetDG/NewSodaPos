import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2, Pencil, Minus, Plus, Receipt, ChevronDown, X } from 'lucide-react'
import { EmptyState } from '@/components/atoms/EmptyState'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { cn, formatCurrency } from '@/lib/utils'
import type { CartItem, Product, Sale } from '@/types'

interface CartTableProps {
    items: CartItem[]
    onIncrease: (product: Product) => void
    onDecrease: (id: string) => void
    onRemove: (id: string) => void
    onEditPrice: (item: CartItem) => void
    pendingDebtSales?: Sale[]
    onClearDebt?: () => void
}

export function CartTable({ items, onIncrease, onDecrease, onRemove, onEditPrice, pendingDebtSales, onClearDebt }: CartTableProps) {
    const [removingItem, setRemovingItem] = useState<CartItem | null>(null)
    const [expandedDebt, setExpandedDebt] = useState<string | null>(null)
    const [confirmClearDebt, setConfirmClearDebt] = useState(false)
    const hasDebt = (pendingDebtSales?.length ?? 0) > 0

    if (items.length === 0 && !hasDebt) {
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

                {/* ── Debt sections ──────────────────────────────────────────── */}
                {hasDebt && (
                    <>
                        <div className="grid items-center gap-2 px-5 py-2 border-t-2 border-violet-500/20 bg-violet-500/5 shrink-0"
                            style={{ gridTemplateColumns: '28px 1fr 90px 96px 88px 36px' }}>
                            <Receipt size={11} className="text-violet-400" />
                            <span className="text-[10px] uppercase tracking-widest text-violet-400/80 font-bold col-span-4">Cuentas a saldar</span>
                            {onClearDebt && (
                                <button
                                    onClick={() => setConfirmClearDebt(true)}
                                    title="Quitar cuentas del carrito"
                                    className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all cursor-pointer"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        {pendingDebtSales!.map(sale => {
                            const sDate = sale.date instanceof Date ? sale.date : new Date(sale.date)
                            const dateStr = sDate.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
                            const isExpanded = expandedDebt === sale.id
                            return (
                                <div key={sale.id} className="border-b border-violet-500/10">
                                    {/* Section header */}
                                    <div
                                        onClick={() => setExpandedDebt(isExpanded ? null : sale.id)}
                                        className="grid items-center gap-2 px-5 py-2.5 bg-violet-500/5 hover:bg-violet-500/10 transition-colors cursor-pointer"
                                        style={{ gridTemplateColumns: '28px 1fr 90px 96px 88px 36px' }}
                                    >
                                        <div className="w-5 h-5 rounded-md bg-violet-500/15 flex items-center justify-center shrink-0">
                                            <Receipt size={10} className="text-violet-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[12px] font-semibold text-violet-300">Cuenta #{sale.saleNumber}</p>
                                            <p className="text-[10px] text-[#3D506A]">{dateStr}</p>
                                        </div>
                                        <span className="text-[11px] text-[#3D506A] text-right">Crédito</span>
                                        <span className="text-[11px] text-[#3D506A] text-right">{sale.items?.length ?? 0} prod.</span>
                                        <span className="text-[13px] font-bold text-violet-400 font-mono text-right">{formatCurrency(sale.total)}</span>
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-violet-400">
                                            <ChevronDown size={13} className={cn('transition-transform duration-200', isExpanded ? 'rotate-180' : '')} />
                                        </div>
                                    </div>
                                    {/* Expanded items */}
                                    {isExpanded && sale.items && sale.items.map((item: any) => (
                                        <div
                                            key={item.id}
                                            className="grid items-center gap-2 px-5 py-2 bg-violet-500/3 border-t border-violet-500/8"
                                            style={{ gridTemplateColumns: '28px 1fr 90px 96px 88px 36px' }}
                                        >
                                            <span />
                                            <span className="text-[12px] text-[#5A7A9A] truncate">{item.product?.name ?? 'Producto'}</span>
                                            <span className="text-[11px] text-[#3D506A] text-right font-mono">{formatCurrency(item.unitPrice)}</span>
                                            <span className="text-[12px] text-[#5A7A9A] text-center tabular-nums">{item.quantity}</span>
                                            <span className="text-[12px] text-violet-400/60 font-mono text-right">{formatCurrency(item.subtotal)}</span>
                                            <span />
                                        </div>
                                    ))}
                                </div>
                            )
                        })}
                    </>
                )}
            </div>

            <DeleteConfirmModal
                isOpen={removingItem !== null}
                onClose={() => setRemovingItem(null)}
                onConfirm={() => { onRemove(removingItem!.id); setRemovingItem(null) }}
                title="Quitar producto"
                description={`¿Quitar "${removingItem?.product.name}" del carrito?`}
            />

            <DeleteConfirmModal
                isOpen={confirmClearDebt}
                onClose={() => setConfirmClearDebt(false)}
                onConfirm={() => { onClearDebt?.(); setConfirmClearDebt(false) }}
                title="Quitar cuentas"
                description="¿Quitar las cuentas a saldar del carrito? La deuda no se eliminará, solo se quitará de esta venta."
            />
        </div>
    )
}
