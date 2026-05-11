import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatCurrency, cn } from '@/lib/utils'
import { PaymentMethodPicker } from '@/components/molecules/PaymentMethodPicker'
import { NumericPad } from '@/components/molecules/NumericPad'
import { TotalsPanel } from '@/components/molecules/TotalsPanel'
import { Button } from '@/components/atoms/Button'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { Trash2, Ticket, X, CreditCard, SplitSquareHorizontal, Smartphone } from 'lucide-react'
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
    activeSorteoName?: string
    onSorteo?: () => void
    pendingDebt?: { clientName: string; total: number }
    onClearDebt?: () => void
    splitMode: boolean
    onToggleSplit: () => void
    splitAmount: string
    onChangeSplitAmount: (v: string) => void
}

export function PaymentPanel({
    paymentMethod, onChangeMethod, amountReceived, onChangeAmount,
    itemCount, subtotal, discount, total,
    canCharge, isPending, onCharge, onClear, hasItems, onOpenDrawer,
    activeSorteoName, onSorteo, pendingDebt, onClearDebt,
    splitMode, onToggleSplit, splitAmount, onChangeSplitAmount,
}: PaymentPanelProps) {
    const [confirmClearDebt, setConfirmClearDebt] = useState(false)
    const [splitFocus, setSplitFocus] = useState<'secondary' | 'cash'>('secondary')
    const received = parseFloat(amountReceived) || 0
    const effectiveTotal = total + (pendingDebt?.total ?? 0)
    const splitAmountNum = parseFloat(splitAmount) || 0
    const cashPortion = splitMode && splitAmountNum > 0 ? effectiveTotal - splitAmountNum : effectiveTotal
    const change = paymentMethod === 'EFECTIVO'
        ? Math.max(0, received - (splitMode ? cashPortion : effectiveTotal))
        : 0
    const showCash = paymentMethod === 'EFECTIVO'
    const canConfirmCash = !hasItems || received >= (splitMode ? cashPortion : effectiveTotal)

    useEffect(() => { if (splitMode) setSplitFocus('secondary') }, [splitMode])

    const padValue = splitMode && splitFocus === 'secondary' ? splitAmount : amountReceived
    const padOnChange = splitMode && splitFocus === 'secondary' ? onChangeSplitAmount : onChangeAmount
    const padTotal = splitMode && splitFocus === 'secondary' ? undefined : (hasItems ? cashPortion : undefined)

    return (
        /*
         * The whole panel is a flex-col. Inside scroll-y is on this container
         * so everything stacks and scrolls if the screen is short.
         * This ensures the NumericPad always renders — it's never cut by flex.
         */
        <div className="flex flex-col overflow-y-auto h-full">

            {/* ── Payment method ─────────────────────────── */}
            <div className="px-4 pt-4 pb-3 border-b border-[#192030] shrink-0">
                <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D506A]">Forma de pago</p>
                    {paymentMethod === 'EFECTIVO' && (
                        <button
                            onClick={onToggleSplit}
                            className={cn(
                                'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer',
                                splitMode
                                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                    : 'text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5'
                            )}
                        >
                            <SplitSquareHorizontal size={11} />
                            {splitMode ? 'Cancelar mixto' : 'Pago mixto'}
                        </button>
                    )}
                </div>
                <PaymentMethodPicker value={paymentMethod} onChange={onChangeMethod} />
            </div>

            {/* ── Split: SINPE amount ─────────────────────── */}
            <AnimatePresence initial={false}>
                {splitMode && (
                    <motion.div
                        key="split-section"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden shrink-0"
                    >
                        <div className="px-4 pt-3 pb-3 border-b border-[#192030] space-y-2">
                            <div className="flex items-center gap-1.5">
                                <Smartphone size={11} className="text-blue-400" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                                    Cobro por SINPE
                                </p>
                            </div>
                            <div
                                onClick={() => setSplitFocus('secondary')}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-0.5 h-14 rounded-xl bg-[#101520] border select-none cursor-pointer active:scale-[0.98] transition-all',
                                    splitFocus === 'secondary' ? 'border-blue-500/40' : 'border-[#1E2A40]'
                                )}
                            >
                                <span className={cn('text-[24px] font-bold font-mono leading-none', splitAmountNum > 0 ? 'text-blue-400' : 'text-[#3D506A]')}>
                                    {splitAmountNum > 0 ? formatCurrency(splitAmountNum) : '₡ —'}
                                </span>
                                {splitFocus === 'secondary' && <span className="text-[9px] text-blue-400/60 uppercase tracking-wider">Ingresando aquí</span>}
                            </div>
                            {splitAmountNum > 0 && splitAmountNum < effectiveTotal && (
                                <p className="text-[11px] text-[#3D506A] text-center">
                                    Efectivo a cobrar: <span className="text-emerald-400 font-semibold font-mono">{formatCurrency(cashPortion)}</span>
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                                {splitMode ? 'Efectivo recibido' : 'Monto recibido'}
                            </p>

                            {/* Amount display — tap to open cash drawer / focus cash input */}
                            <div
                                className={cn(
                                    'flex flex-col items-center justify-center gap-0.5 h-16 rounded-xl bg-[#101520] border select-none cursor-pointer active:scale-[0.98] transition-all',
                                    splitMode && splitFocus === 'cash' ? 'border-emerald-500/40' : 'border-[#1E2A40]'
                                )}
                                onClick={() => { splitMode ? setSplitFocus('cash') : onOpenDrawer?.() }}
                            >
                                <span className={`text-[28px] font-bold font-mono leading-none transition-colors ${received > 0 ? 'text-[#E4ECF7]' : 'text-[#3D506A]'}`}>
                                    {received > 0 ? formatCurrency(received) : '₡ —'}
                                </span>
                                {received === 0 && !splitMode && (
                                    <span className="text-[9px] uppercase tracking-wider text-[#3D506A]">Toca para abrir cajón</span>
                                )}
                                {splitMode && splitFocus === 'cash' && (
                                    <span className="text-[9px] text-emerald-400/60 uppercase tracking-wider">Ingresando aquí</span>
                                )}
                            </div>

                            {/* Change badge */}
                            <AnimatePresence>
                                {received > 0 && received >= (splitMode ? cashPortion : effectiveTotal) && (
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

                            {/* Numeric pad — serves focused input */}
                            <NumericPad
                                value={padValue}
                                onChange={padOnChange}
                                total={padTotal}
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

            {/* ── Sorteo button ────────────────────────────── */}
            <AnimatePresence>
                {activeSorteoName && onSorteo && (
                    <motion.div
                        key="sorteo-btn"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden shrink-0"
                    >
                        <div className="px-4 pb-2 flex items-center gap-2">
                            <button
                                onClick={onSorteo}
                                className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 active:scale-[0.98] transition-all cursor-pointer"
                            >
                                <Ticket size={14} className="text-amber-400 shrink-0" />
                                <span className="text-[12px] font-semibold text-amber-300 truncate">
                                    {activeSorteoName}
                                </span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Pending debt notice ──────────────────────── */}
            {pendingDebt && (
                <div className="px-4 pb-2 shrink-0">
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-500/8 border border-violet-500/20">
                        <CreditCard size={13} className="text-violet-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-violet-300 truncate">{pendingDebt.clientName}</p>
                            <p className="text-[10px] text-violet-400/60">Deuda a saldar al cobrar</p>
                        </div>
                        <span className="text-[13px] font-bold text-violet-400 tabular-nums">{formatCurrency(pendingDebt.total)}</span>
                        {onClearDebt && (
                            <button
                                onClick={() => setConfirmClearDebt(true)}
                                title="Quitar deuda del carrito"
                                className="w-5 h-5 rounded-md flex items-center justify-center text-violet-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                            >
                                <X size={11} />
                            </button>
                        )}
                    </div>
                </div>
            )}

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
                            ? `Cobrar ${formatCurrency(effectiveTotal)}`
                            : 'Sin productos'
                    }
                </Button>
            </div>

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
