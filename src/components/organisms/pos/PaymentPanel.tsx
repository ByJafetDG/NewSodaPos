import { AnimatePresence, motion } from 'framer-motion'
import { formatCurrency } from '@/lib/utils'
import { PaymentMethodPicker } from '@/components/molecules/PaymentMethodPicker'
import { NumericPad } from '@/components/molecules/NumericPad'
import { TotalsPanel } from '@/components/molecules/TotalsPanel'
import { Button } from '@/components/atoms/Button'
import { Trash2 } from 'lucide-react'
import type { PaymentMethod } from '@/types'

interface PaymentPanelProps {
    paymentMethod: PaymentMethod
    onChangeMethod: (m: PaymentMethod) => void
    amountReceived: string
    onChangeAmount: (v: string) => void
    itemCount: number
    subtotal: number
    discount: number
    total: number
    canCharge: boolean
    isPending: boolean
    onCharge: () => void
    onClear: () => void
    hasItems: boolean
    onOpenDrawer?: () => void
}

export function PaymentPanel({
    paymentMethod, onChangeMethod, amountReceived, onChangeAmount,
    itemCount, subtotal, discount, total,
    canCharge, isPending, onCharge, onClear, hasItems, onOpenDrawer
}: PaymentPanelProps) {
    const received = parseFloat(amountReceived) || 0
    const change = paymentMethod === 'EFECTIVO' ? Math.max(0, received - total) : 0
    const showCash = paymentMethod === 'EFECTIVO'
    const canConfirmCash = !hasItems || received >= total

    return (
        /*
         * The whole panel is a flex-col. Inside scroll-y is on this container
         * so everything stacks and scrolls if the screen is short.
         * This ensures the NumericPad always renders — it's never cut by flex.
         */
        <div className="flex flex-col overflow-y-auto h-full">

            {/* ── Payment method ─────────────────────────── */}
            <div className="px-4 pt-4 pb-3 border-b border-[#192030] shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D506A] mb-2.5">
                    Forma de pago
                </p>
                <PaymentMethodPicker value={paymentMethod} onChange={onChangeMethod} />
            </div>

            {/* ── Cash amount section ─────────────────────── */}
            <AnimatePresence initial={false}>
                {showCash && (
                    <motion.div
                        key="cash-section"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden shrink-0"
                    >
                        <div className="px-4 pt-3 pb-3 border-b border-[#192030] space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D506A]">
                                Monto recibido
                            </p>

                            {/* Amount display — tap to open cash drawer */}
                            <div
                                className="flex flex-col items-center justify-center gap-0.5 h-16 rounded-xl bg-[#101520] border border-[#1E2A40] select-none cursor-pointer active:scale-[0.98] transition-transform"
                                onClick={onOpenDrawer}
                            >
                                <span className={`text-[28px] font-bold font-mono leading-none transition-colors ${received > 0 ? 'text-[#E4ECF7]' : 'text-[#3D506A]'}`}>
                                    {received > 0 ? formatCurrency(received) : '₡ —'}
                                </span>
                                {received === 0 && (
                                    <span className="text-[9px] uppercase tracking-wider text-[#3D506A]">Toca para abrir cajón</span>
                                )}
                            </div>

                            {/* Change badge */}
                            <AnimatePresence>
                                {received > 0 && received >= total && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                                    >
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Vuelto</span>
                                        <span className="text-[20px] font-bold text-emerald-400 font-mono">{formatCurrency(change)}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Numeric pad */}
                            <NumericPad
                                value={amountReceived}
                                onChange={onChangeAmount}
                                total={hasItems ? total : undefined}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Spacer pushes totals to bottom ─────────── */}
            <div className="flex-1" />

            {/* ── Totals ─────────────────────────────────── */}
            <div className="px-4 pt-3 pb-3 border-t border-[#192030] shrink-0">
                <TotalsPanel
                    itemCount={itemCount}
                    subtotal={subtotal}
                    discount={discount}
                    total={total}
                />
            </div>

            {/* ── Action buttons ──────────────────────────── */}
            <div className="px-4 pb-4 flex gap-2 shrink-0">
                {hasItems && (
                    <button
                        onClick={onClear}
                        title="Vaciar carrito"
                        className="w-14 h-14 rounded-2xl bg-red-500/8 border border-red-500/15 text-red-400 hover:bg-red-500/15 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95"
                    >
                        <Trash2 size={18} />
                    </button>
                )}
                <Button
                    variant="success"
                    size="xl"
                    className="flex-1"
                    disabled={!canCharge || (showCash && hasItems && !canConfirmCash)}
                    loading={isPending}
                    onClick={onCharge}
                >
                    {isPending
                        ? 'Procesando...'
                        : hasItems
                            ? `Cobrar ${formatCurrency(total)}`
                            : 'Sin productos'
                    }
                </Button>
            </div>
        </div>
    )
}
