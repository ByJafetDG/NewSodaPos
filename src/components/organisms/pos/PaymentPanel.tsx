import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatCurrency, cn, normalizeStr, fuzzyMatch } from '@/lib/utils'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { PaymentMethodPicker } from '@/components/molecules/PaymentMethodPicker'
import { NumericPad } from '@/components/molecules/NumericPad'
import { TotalsPanel } from '@/components/molecules/TotalsPanel'
import { Button } from '@/components/atoms/Button'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { Trash2, Ticket, X, CreditCard, SplitSquareHorizontal, Smartphone, Inbox, UserCircle2, Search, Banknote } from 'lucide-react'
import type { PaymentMethod } from '@/types'

interface ClientOption { id: string; name: string }

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
    // Mixed payment
    mixedMethods: string[]
    onOpenMixedSelect: () => void
    onOpenMixedCancel: () => void
    splitAmount: string
    onChangeSplitAmount: (v: string) => void
    creditAmount: string
    onChangeCreditAmount: (v: string) => void
    creditClientId: string | null
    onSelectCreditClient: (id: string | null) => void
    clients?: ClientOption[]
    // Invoice name
    invoiceClient?: { name: string; cedula: string; email: string; extraEmail?: string; existingId?: string } | null
    onOpenInvoiceModal?: () => void
}

export function PaymentPanel({
    paymentMethod, onChangeMethod, amountReceived, onChangeAmount,
    itemCount, subtotal, discount, total,
    canCharge, isPending, onCharge, onClear, hasItems, onOpenDrawer,
    activeSorteoName, onSorteo, pendingDebt, onClearDebt,
    mixedMethods, onOpenMixedSelect, onOpenMixedCancel,
    splitAmount, onChangeSplitAmount,
    creditAmount, onChangeCreditAmount,
    creditClientId, onSelectCreditClient, clients = [],
    invoiceClient, onOpenInvoiceModal,
}: PaymentPanelProps) {
    const [confirmClearDebt, setConfirmClearDebt] = useState(false)
    const [splitFocus, setSplitFocus] = useState<'sinpe' | 'cash' | 'credit'>('sinpe')
    const [clientSearch, setClientSearch] = useState('')
    const clientSearchKb = useKeyboardInput(clientSearch, setClientSearch)

    const isMixed = mixedMethods.length >= 2
    const hasSinpe   = isMixed && mixedMethods.includes('SINPE')
    const hasEfectivo = isMixed ? mixedMethods.includes('EFECTIVO') : paymentMethod === 'EFECTIVO'
    const hasCuenta  = isMixed && mixedMethods.includes('CUENTA')

    const received       = parseFloat(amountReceived) || 0
    const effectiveTotal = total + (pendingDebt?.total ?? 0)
    const sinpeAmt       = parseFloat(splitAmount) || 0
    const creditAmt      = parseFloat(creditAmount) || 0
    const cashPortion    = effectiveTotal - (hasSinpe ? sinpeAmt : 0) - (hasCuenta ? creditAmt : 0)
    const change         = hasEfectivo ? Math.max(0, received - cashPortion) : 0
    const canConfirmCash = !hasItems || received >= cashPortion

    const filteredClients = clients.filter(c =>
        !clientSearch ||
        normalizeStr(c.name).includes(normalizeStr(clientSearch)) ||
        fuzzyMatch(clientSearch, c.name)
    )
    const selectedClient = clients.find(c => c.id === creditClientId)

    useEffect(() => {
        if (isMixed) {
            if (hasSinpe) setSplitFocus('sinpe')
            else if (hasCuenta) setSplitFocus('credit')
            else setSplitFocus('cash')
        }
    }, [isMixed, mixedMethods.join(',')])

    const padValue = isMixed
        ? (splitFocus === 'sinpe' ? splitAmount : splitFocus === 'credit' ? creditAmount : amountReceived)
        : amountReceived
    const padOnChange = isMixed
        ? (splitFocus === 'sinpe' ? onChangeSplitAmount : splitFocus === 'credit' ? onChangeCreditAmount : onChangeAmount)
        : onChangeAmount
    const padTotal = (isMixed && (splitFocus === 'sinpe' || splitFocus === 'credit'))
        ? undefined
        : (hasItems ? cashPortion : undefined)

    const mixedLabel = isMixed
        ? mixedMethods.map(m => m === 'EFECTIVO' ? 'Efectivo' : m === 'SINPE' ? 'SINPE' : 'Cuenta').join(' + ')
        : null

    return (
        <div className="flex flex-col overflow-y-auto h-full">

            {/* ── Payment method ─────────────────────────── */}
            <div className="px-4 pt-4 pb-3 border-b border-[#192030] shrink-0">
                <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D506A]">Forma de pago</p>
                    {paymentMethod !== 'CREDITO' && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onOpenInvoiceModal}
                                className={cn(
                                    'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer',
                                    invoiceClient
                                        ? 'bg-blue-500/12 text-blue-400 border border-blue-500/25 hover:bg-blue-500/20'
                                        : 'text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5'
                                )}
                            >
                                <UserCircle2 size={11} />
                                {invoiceClient ? 'Facturar a: ' + invoiceClient.name : 'Facturar a nombre'}
                            </button>

                            <button
                                onClick={isMixed ? onOpenMixedCancel : onOpenMixedSelect}
                                className={cn(
                                    'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer',
                                    isMixed
                                        ? 'bg-orange-500/12 text-orange-400 border border-orange-500/25 hover:bg-orange-500/20'
                                        : 'text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5'
                                )}
                            >
                                <SplitSquareHorizontal size={11} />
                                {isMixed ? `Mixto: ${mixedLabel}` : 'Pago mixto'}
                            </button>
                        </div>
                    )}
                </div>
                {!isMixed && <PaymentMethodPicker value={paymentMethod} onChange={onChangeMethod} />}
            </div>

            {/* ── SINPE amount ─────────────────────────────── */}
            <AnimatePresence initial={false}>
                {hasSinpe && (
                    <motion.div
                        key="sinpe-section"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden shrink-0"
                    >
                        <div className="px-4 pt-3 pb-3 border-b border-[#192030] space-y-2">
                            <div className="flex items-center gap-1.5">
                                <Smartphone size={11} className="text-blue-400" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">SINPE</p>
                            </div>
                            <div
                                onClick={() => setSplitFocus('sinpe')}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-0.5 h-14 rounded-xl bg-[#101520] border select-none cursor-pointer active:scale-[0.98] transition-all',
                                    splitFocus === 'sinpe' ? 'border-blue-500/40' : 'border-[#1E2A40]'
                                )}
                            >
                                <span className={cn('text-[24px] font-bold font-mono leading-none', sinpeAmt > 0 ? 'text-blue-400' : 'text-[#3D506A]')}>
                                    {sinpeAmt > 0 ? formatCurrency(sinpeAmt) : '₡ —'}
                                </span>
                                {splitFocus === 'sinpe' && <span className="text-[9px] text-blue-400/60 uppercase tracking-wider">Ingresando aquí</span>}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Cargo a cuenta ───────────────────────────── */}
            <AnimatePresence initial={false}>
                {hasCuenta && (
                    <motion.div
                        key="credit-section"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden shrink-0"
                    >
                        <div className="px-4 pt-3 pb-3 border-b border-[#192030] space-y-2">
                            <div className="flex items-center gap-1.5">
                                <CreditCard size={11} className="text-violet-400" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Cargo a cuenta</p>
                            </div>

                            {selectedClient ? (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/30">
                                    <UserCircle2 size={13} className="text-violet-400 shrink-0" />
                                    <span className="flex-1 text-[12px] font-medium text-[#E4ECF7] truncate">{selectedClient.name}</span>
                                    <button
                                        onClick={() => { onSelectCreditClient(null); setClientSearch('') }}
                                        className="text-violet-400/50 hover:text-red-400 transition-colors cursor-pointer"
                                    >
                                        <X size={11} />
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <div className="relative">
                                        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#3D506A]" />
                                        <input
                                            type="text"
                                            placeholder="Buscar cliente..."
                                            className="w-full h-8 pl-7 pr-3 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/50"
                                            {...clientSearchKb}
                                        />
                                    </div>
                                    {filteredClients.length > 0 && (
                                        <div className="max-h-24 overflow-y-auto space-y-0.5">
                                            {filteredClients.slice(0, 6).map(c => (
                                                <button
                                                    key={c.id}
                                                    onClick={() => { onSelectCreditClient(c.id); setClientSearch('') }}
                                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#101520] border border-[#192030] hover:bg-[#161D2E] text-left cursor-pointer transition-colors"
                                                >
                                                    <UserCircle2 size={12} className="text-[#3D506A] shrink-0" />
                                                    <span className="text-[11px] text-[#7A8FAA] truncate">{c.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div
                                onClick={() => setSplitFocus('credit')}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-0.5 h-14 rounded-xl bg-[#101520] border select-none cursor-pointer active:scale-[0.98] transition-all',
                                    splitFocus === 'credit' ? 'border-violet-500/40' : 'border-[#1E2A40]'
                                )}
                            >
                                <span className={cn('text-[24px] font-bold font-mono leading-none', creditAmt > 0 ? 'text-violet-400' : 'text-[#3D506A]')}>
                                    {creditAmt > 0 ? formatCurrency(creditAmt) : '₡ —'}
                                </span>
                                {splitFocus === 'credit' && <span className="text-[9px] text-violet-400/60 uppercase tracking-wider">Ingresando aquí</span>}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Cash section ─────────────────────────────── */}
            <AnimatePresence initial={false}>
                {hasEfectivo && (
                    <motion.div
                        key="cash-section"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden shrink-0"
                    >
                        <div className="px-4 pt-3 pb-3 border-b border-[#192030] space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D506A]">
                                    {isMixed ? 'Efectivo recibido' : 'Monto recibido'}
                                </p>
                                {isMixed && onOpenDrawer && (
                                    <button
                                        onClick={onOpenDrawer}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5 transition-all cursor-pointer"
                                    >
                                        <Inbox size={11} />
                                        Cajón
                                    </button>
                                )}
                            </div>

                            <div
                                className={cn(
                                    'flex flex-col items-center justify-center gap-0.5 h-16 rounded-xl bg-[#101520] border select-none cursor-pointer active:scale-[0.98] transition-all',
                                    isMixed && splitFocus === 'cash' ? 'border-emerald-500/40' : 'border-[#1E2A40]'
                                )}
                                onClick={() => isMixed ? setSplitFocus('cash') : onOpenDrawer?.()}
                            >
                                <span className={`text-[28px] font-bold font-mono leading-none transition-colors ${received > 0 ? 'text-[#E4ECF7]' : 'text-[#3D506A]'}`}>
                                    {received > 0 ? formatCurrency(received) : '₡ —'}
                                </span>
                                {received === 0 && !isMixed && (
                                    <span className="text-[9px] uppercase tracking-wider text-[#3D506A]">Toca para abrir cajón</span>
                                )}
                                {isMixed && splitFocus === 'cash' && (
                                    <span className="text-[9px] text-emerald-400/60 uppercase tracking-wider">Ingresando aquí</span>
                                )}
                            </div>

                            <AnimatePresence>
                                {received > 0 && received >= cashPortion && (
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

                            {isMixed && hasSinpe && sinpeAmt > 0 && creditAmt === 0 && (
                                <p className="text-[11px] text-[#3D506A] text-center">
                                    Efectivo a cobrar: <span className="text-emerald-400 font-semibold font-mono">{formatCurrency(Math.max(0, cashPortion))}</span>
                                </p>
                            )}

                            <NumericPad value={padValue} onChange={padOnChange} total={padTotal} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Non-cash numpad (SINPE-only or credit-only mix) ─ */}
            <AnimatePresence initial={false}>
                {!hasEfectivo && isMixed && (
                    <motion.div
                        key="noncash-pad"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden shrink-0"
                    >
                        <div className="px-4 pt-3 pb-3 border-b border-[#192030]">
                            <NumericPad value={padValue} onChange={padOnChange} total={padTotal} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Spacer ───────────────────────────────────── */}
            <div className="flex-1" />

            {/* ── Totals ──────────────────────────────────── */}
            <div className="px-4 pt-3 pb-3 border-t border-[#192030] shrink-0">
                <TotalsPanel
                    itemCount={itemCount}
                    subtotal={subtotal}
                    discount={discount}
                    total={total}
                    debtTotal={pendingDebt?.total}
                />
            </div>

            {/* ── Sorteo ──────────────────────────────────── */}
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
                                <span className="text-[12px] font-semibold text-amber-300 truncate">{activeSorteoName}</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Pending debt ─────────────────────────────── */}
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
                    disabled={!canCharge || (hasEfectivo && hasItems && !canConfirmCash)}
                    loading={isPending}
                    onClick={onCharge}
                >
                    {isPending
                        ? 'Procesando...'
                        : hasItems || pendingDebt
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
