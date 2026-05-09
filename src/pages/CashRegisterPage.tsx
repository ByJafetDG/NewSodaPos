import { useState } from 'react'
import {
    Wallet, DoorOpen, DoorClosed, Banknote, Smartphone,
    CheckCircle2, Clock, Edit2, Trash2, TrendingUp,
    Receipt,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { BaseModal } from '@/components/modals/BaseModal'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { Button } from '@/components/atoms/Button'
import { EmptyState } from '@/components/atoms/EmptyState'
import { NumericPad } from '@/components/molecules/NumericPad'
import {
    useActiveRegister, useRegisterHistory,
    useOpenRegister, useCloseRegister, useUpdateRegister, useDeleteRegister,
} from '@/hooks/useCashRegister'
import { cn, formatCurrency } from '@/lib/utils'
import type { CashRegister } from '@/types'

function toDate(v: Date | string | null | undefined): Date {
    if (!v) return new Date()
    return v instanceof Date ? v : new Date(v)
}

const TZ = 'America/Costa_Rica'

function fmtTime(v: Date | string | null | undefined): string {
    if (!v) return '--'
    return toDate(v).toLocaleTimeString('es-CR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

function fmtDate(v: Date | string | null | undefined): string {
    if (!v) return ''
    return toDate(v).toLocaleDateString('es-CR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' })
}

function parseAmount(str: string) { return parseInt(str) || 0 }

function AmountDisplay({ value, color = 'emerald' }: { value: string; color?: 'emerald' | 'red' | 'orange' }) {
    const amount = parseAmount(value)
    const colorClass = color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-orange-400'
    return (
        <div className="text-center py-4 rounded-xl bg-[#101520] border border-[#192030]">
            <p className={cn('text-[30px] font-bold font-mono', amount > 0 ? colorClass : 'text-[#3D506A]')}>
                {formatCurrency(amount)}
            </p>
        </div>
    )
}

export function CashRegisterPage() {
    const { data: activeRegister = null } = useActiveRegister()
    const { data: history = [] } = useRegisterHistory()
    const openRegister = useOpenRegister()
    const closeRegister = useCloseRegister()
    const updateRegister = useUpdateRegister()
    const deleteRegister = useDeleteRegister()

    const [openModal, setOpenModal] = useState(false)
    const [closeModal, setCloseModal] = useState(false)
    const [editingRegister, setEditingRegister] = useState<CashRegister | null>(null)
    const [deletingRegister, setDeletingRegister] = useState<CashRegister | null>(null)
    const [detailRegister, setDetailRegister] = useState<CashRegister | null>(null)

    const [initialAmount, setInitialAmount] = useState('')
    const [finalAmount, setFinalAmount] = useState('')
    const [editInitial, setEditInitial] = useState('')
    const [editFinal, setEditFinal] = useState('')

    const isOpen = !!activeRegister

    async function handleOpen() {
        if (!initialAmount) return
        await openRegister.mutateAsync(parseAmount(initialAmount))
        setInitialAmount('')
        setOpenModal(false)
    }

    async function handleClose() {
        if (!activeRegister || !finalAmount) return
        await closeRegister.mutateAsync({ registerId: activeRegister.id, finalAmount: parseAmount(finalAmount) })
        setFinalAmount('')
        setCloseModal(false)
    }

    function handleEdit(r: CashRegister) {
        setEditingRegister(r)
        setEditInitial(String(r.initialAmount))
        setEditFinal(String(r.finalAmount ?? 0))
    }

    async function handleSaveEdit() {
        if (!editingRegister) return
        await updateRegister.mutateAsync({
            registerId: editingRegister.id,
            updates: { initialAmount: parseAmount(editInitial), finalAmount: parseAmount(editFinal) },
        })
        setEditingRegister(null)
    }

    async function handleDeleteConfirm() {
        if (!deletingRegister) return
        await deleteRegister.mutateAsync(deletingRegister.id)
        setDeletingRegister(null)
    }

    const cashSales = activeRegister?.salesCash ?? 0
    const sinpeSales = activeRegister?.salesSinpe ?? 0
    const creditSales = activeRegister?.salesCredit ?? 0
    const totalSales = cashSales + sinpeSales + creditSales

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-3">
                    <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg', isOpen ? 'bg-emerald-500/10' : 'bg-[#1C2438]')}>
                        <Wallet size={18} className={isOpen ? 'text-emerald-400' : 'text-[#3D506A]'} />
                    </div>
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E4ECF7]">Caja</h1>
                        <p className={cn('text-[12px]', isOpen ? 'text-emerald-400' : 'text-[#3D506A]')}>
                            {isOpen ? 'Caja abierta' : 'Caja cerrada'}
                        </p>
                    </div>
                </div>
                {isOpen ? (
                    <Button variant="danger" size="sm" onClick={() => setCloseModal(true)} className="gap-1.5">
                        <DoorClosed size={14} />
                        Cerrar Caja
                    </Button>
                ) : (
                    <Button variant="primary" size="sm" onClick={() => setOpenModal(true)} className="gap-1.5">
                        <DoorOpen size={14} />
                        Abrir Caja
                    </Button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Active register summary */}
                {isOpen && activeRegister && (
                    <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/20 p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse block" />
                                <span className="text-[13px] font-semibold text-emerald-400">Caja activa</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[12px] text-[#3D506A]">
                                <Clock size={11} />
                                Abierta: {fmtTime(activeRegister.openedAt)}
                            </div>
                        </div>

                        {/* Fondo + ventas por método */}
                        <div className="grid grid-cols-4 gap-3">
                            <StatCell label="Fondo inicial" value={formatCurrency(activeRegister.initialAmount)} color="text-[#E4ECF7]" />
                            <StatCell label="Efectivo" value={formatCurrency(cashSales)} color="text-emerald-400" icon={<Banknote size={12} className="text-emerald-400" />} />
                            <StatCell label="SINPE" value={formatCurrency(sinpeSales)} color="text-blue-400" icon={<Smartphone size={12} className="text-blue-400" />} />
                            <StatCell label="Crédito" value={formatCurrency(creditSales)} color="text-amber-400" icon={<Receipt size={12} className="text-amber-400" />} />
                        </div>

                        {/* Totales */}
                        <div className="border-t border-emerald-500/15 pt-4 grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[11px] text-[#3D506A] mb-1 flex items-center gap-1">
                                    <Banknote size={11} /> Cuadre físico (efectivo)
                                </p>
                                <p className="text-[14px] font-bold font-mono text-[#E4ECF7]">
                                    {formatCurrency(activeRegister.initialAmount + cashSales)}
                                </p>
                                <p className="text-[10px] text-[#3D506A] mt-0.5">Inicial + ventas en efectivo</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-[#3D506A] mb-1 flex items-center gap-1">
                                    <TrendingUp size={11} /> Total general vendido
                                </p>
                                <p className="text-[14px] font-bold font-mono text-emerald-400">
                                    {formatCurrency(totalSales)}
                                </p>
                                <p className="text-[10px] text-[#3D506A] mt-0.5">Todos los métodos de pago</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* History */}
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-3">Historial de cajas</p>
                    {history.length === 0 ? (
                        <EmptyState
                            icon={<Wallet size={28} className="text-[#3D506A]" />}
                            title="Sin historial"
                            description="Las cajas cerradas aparecerán aquí"
                        />
                    ) : (
                        <div className="space-y-2">
                            {history.map(r => (
                                <RegisterRow
                                    key={r.id}
                                    register={r}
                                    onDetail={() => setDetailRegister(r)}
                                    onEdit={handleEdit}
                                    onDelete={d => setDeletingRegister(d)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Modals ─────────────────────────────────────────────────── */}

            {/* Open */}
            <BaseModal isOpen={openModal} onClose={() => setOpenModal(false)} title="Abrir Caja" width="max-w-sm">
                <div className="space-y-4">
                    <div className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                        <DoorOpen size={28} className="text-emerald-400" />
                        <p className="text-[12px] text-[#3D506A]">Ingresa el fondo inicial en caja</p>
                    </div>
                    <AmountDisplay value={initialAmount} color="emerald" />
                    <NumericPad value={initialAmount} onChange={setInitialAmount} />
                    <Button variant="primary" size="lg" className="w-full" onClick={handleOpen} disabled={!initialAmount}>
                        Abrir Caja
                    </Button>
                </div>
            </BaseModal>

            {/* Close */}
            <BaseModal isOpen={closeModal} onClose={() => setCloseModal(false)} title="Cerrar Caja" width="max-w-sm">
                <div className="space-y-4">
                    <div className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-red-500/5 border border-red-500/15">
                        <DoorClosed size={28} className="text-red-400" />
                        <p className="text-[12px] text-[#3D506A]">Conteo final de efectivo en caja</p>
                    </div>
                    <AmountDisplay value={finalAmount} color="red" />
                    <NumericPad value={finalAmount} onChange={setFinalAmount} />
                    <Button variant="danger" size="lg" className="w-full" onClick={handleClose} disabled={!finalAmount}>
                        Cerrar Caja
                    </Button>
                </div>
            </BaseModal>

            {/* Edit */}
            <EditRegisterModal
                register={editingRegister}
                editInitial={editInitial}
                editFinal={editFinal}
                onChangeInitial={setEditInitial}
                onChangeFinal={setEditFinal}
                onSave={handleSaveEdit}
                onClose={() => setEditingRegister(null)}
            />

            {/* Detail */}
            <RegisterDetailModal
                register={detailRegister}
                onClose={() => setDetailRegister(null)}
            />

            {/* Delete */}
            <DeleteConfirmModal
                isOpen={deletingRegister !== null}
                onClose={() => setDeletingRegister(null)}
                onConfirm={handleDeleteConfirm}
                title="Eliminar registro"
                description={`¿Eliminar la caja del ${deletingRegister ? fmtDate(deletingRegister.openedAt) : ''}? Esta acción no se puede deshacer.`}
            />
        </div>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCell({ label, value, color, icon }: {
    label: string; value: string; color: string; icon?: React.ReactNode
}) {
    return (
        <div>
            <div className="flex items-center gap-1 mb-1">
                {icon}
                <p className="text-[11px] text-[#3D506A]">{label}</p>
            </div>
            <p className={cn('text-[15px] font-bold font-mono', color)}>{value}</p>
        </div>
    )
}

function RegisterRow({ register: r, onDetail, onEdit, onDelete }: {
    register: CashRegister
    onDetail: () => void
    onEdit: (r: CashRegister) => void
    onDelete: (r: CashRegister) => void
}) {
    const cashSales = r.salesCash ?? 0
    const totalSales = cashSales + (r.salesSinpe ?? 0) + (r.salesCredit ?? 0)
    const expectedFinal = r.initialAmount + cashSales
    const diff = (r.finalAmount ?? 0) - expectedFinal

    const openTime = fmtTime(r.openedAt)
    const closeTime = r.closedAt ? fmtTime(r.closedAt) : undefined
    const dateStr = fmtDate(r.openedAt)

    return (
        <div
            onClick={onDetail}
            className="px-4 py-4 rounded-xl bg-[#0F1623] border border-[#192030] hover:bg-[#141C2E] hover:border-[#243450] transition-colors cursor-pointer"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-[#3D506A]" />
                    <span className="text-[13px] font-semibold text-[#E4ECF7]">{dateStr}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#3D506A]">
                    <Clock size={10} />
                    {openTime} → {closeTime}
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => onEdit(r)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-[#3D506A] hover:text-orange-400 hover:bg-orange-500/10 transition-colors cursor-pointer"
                    >
                        <Edit2 size={13} />
                    </button>
                    <button
                        onClick={() => onDelete(r)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
                <div>
                    <p className="text-[11px] text-[#3D506A] mb-0.5">Inicial</p>
                    <p className="text-[13px] font-mono text-[#7A8FAA]">{formatCurrency(r.initialAmount)}</p>
                </div>
                <div>
                    <p className="text-[11px] text-[#3D506A] mb-0.5">Total ventas</p>
                    <p className="text-[13px] font-mono text-emerald-400">{formatCurrency(totalSales)}</p>
                </div>
                <div>
                    <p className="text-[11px] text-[#3D506A] mb-0.5">Final contado</p>
                    <p className="text-[13px] font-mono text-[#E4ECF7]">{formatCurrency(r.finalAmount ?? 0)}</p>
                </div>
                <div>
                    <p className="text-[11px] text-[#3D506A] mb-0.5">Cuadre efectivo</p>
                    <p className={cn('text-[13px] font-mono font-semibold', diff === 0 ? 'text-emerald-400' : diff > 0 ? 'text-blue-400' : 'text-red-400')}>
                        {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                    </p>
                </div>
            </div>
            <p className="text-[10px] text-[#3D506A] mt-2">Toca para ver el cuadre detallado</p>
        </div>
    )
}

function RegisterDetailModal({ register: r, onClose }: { register: CashRegister | null; onClose: () => void }) {
    if (!r) return null

    const cashSales = r.salesCash ?? 0
    const sinpeSales = r.salesSinpe ?? 0
    const creditSales = r.salesCredit ?? 0
    const totalSales = cashSales + sinpeSales + creditSales

    const expectedFinal = r.initialAmount + cashSales
    const diff = (r.finalAmount ?? 0) - expectedFinal

    const dateStr = fmtDate(r.openedAt)

    return (
        <AnimatePresence>
            {r && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="fixed z-50 inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-sm px-4"
                    >
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#192030]">
                                <div>
                                    <h2 className="text-[16px] font-semibold text-[#E4ECF7]">Cuadre de caja</h2>
                                    <p className="text-[12px] text-[#3D506A] mt-0.5">{dateStr}</p>
                                </div>
                                <button onClick={onClose} className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                                    <DoorClosed size={16} />
                                </button>
                            </div>
                            <div className="px-6 py-5 space-y-5">

                                {/* Ventas por método */}
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-3">Ventas por método de pago</p>
                                    <div className="space-y-1.5">
                                        <PayRow icon={<Banknote size={13} className="text-emerald-400" />} label="Efectivo" value={cashSales} color="text-emerald-400" />
                                        <PayRow icon={<Smartphone size={13} className="text-blue-400" />} label="SINPE" value={sinpeSales} color="text-blue-400" />
                                        <PayRow icon={<Receipt size={13} className="text-amber-400" />} label="Crédito" value={creditSales} color="text-amber-400" />
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-[#192030] flex items-center justify-between">
                                        <span className="text-[12px] font-semibold text-[#CBD5E1]">Total vendido</span>
                                        <span className="text-[15px] font-bold font-mono text-emerald-400">{formatCurrency(totalSales)}</span>
                                    </div>
                                </div>

                                {/* Cuadre físico */}
                                <div className="rounded-xl bg-[#101520] border border-[#1E2A40] p-4 space-y-2">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-3">Cuadre de efectivo (físico)</p>
                                    <div className="space-y-2 text-[13px]">
                                        <div className="flex justify-between">
                                            <span className="text-[#7A8FAA]">Fondo inicial</span>
                                            <span className="font-mono text-[#E4ECF7]">{formatCurrency(r.initialAmount)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#7A8FAA]">+ Ventas efectivo</span>
                                            <span className="font-mono text-emerald-400">+{formatCurrency(cashSales)}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-[#192030] pt-2">
                                            <span className="text-[#7A8FAA]">= Esperado en caja</span>
                                            <span className="font-mono font-semibold text-[#E4ECF7]">{formatCurrency(expectedFinal)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#7A8FAA]">Contado físicamente</span>
                                            <span className="font-mono text-[#E4ECF7]">{formatCurrency(r.finalAmount ?? 0)}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-[#192030] pt-2">
                                            <span className="font-semibold text-[#CBD5E1]">Diferencia</span>
                                            <span className={cn('font-mono font-bold text-[15px]',
                                                diff === 0 ? 'text-emerald-400' : diff > 0 ? 'text-blue-400' : 'text-red-400'
                                            )}>
                                                {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                                                {diff === 0 && ' ✓'}
                                            </span>
                                        </div>
                                    </div>
                                    {diff !== 0 && (
                                        <p className="text-[10px] text-[#3D506A] pt-1">
                                            {diff > 0 ? 'Hay más efectivo del esperado (sobrante)' : 'Hay menos efectivo del esperado (faltante)'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

function PayRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
    return (
        <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-[#101520]">
            <div className="flex items-center gap-2">
                {icon}
                <span className="text-[12px] text-[#7A8FAA]">{label}</span>
            </div>
            <span className={cn('text-[13px] font-mono font-semibold', value > 0 ? color : 'text-[#3D506A]')}>
                {formatCurrency(value)}
            </span>
        </div>
    )
}

function EditRegisterModal({ register, editInitial, editFinal, onChangeInitial, onChangeFinal, onSave, onClose }: {
    register: CashRegister | null
    editInitial: string; editFinal: string
    onChangeInitial: (v: string) => void; onChangeFinal: (v: string) => void
    onSave: () => void; onClose: () => void
}) {
    const [tab, setTab] = useState<'inicial' | 'final'>('inicial')
    const isInitialTab = tab === 'inicial'

    return (
        <BaseModal isOpen={register !== null} onClose={onClose} title="Editar Caja" width="max-w-sm">
            {register && (
                <div className="space-y-4">
                    <p className="text-[12px] text-[#3D506A] text-center">
                        {fmtDate(register.openedAt)}
                    </p>
                    <div className="flex gap-1 p-1 rounded-xl bg-[#101520] border border-[#192030]">
                        <button
                            onClick={() => setTab('inicial')}
                            className={cn('flex-1 h-8 rounded-lg text-[12px] font-semibold transition-all cursor-pointer',
                                isInitialTab ? 'bg-emerald-500/15 text-emerald-400' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                            )}
                        >
                            Monto inicial
                        </button>
                        <button
                            onClick={() => setTab('final')}
                            className={cn('flex-1 h-8 rounded-lg text-[12px] font-semibold transition-all cursor-pointer',
                                !isInitialTab ? 'bg-orange-500/15 text-orange-400' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                            )}
                        >
                            Monto final
                        </button>
                    </div>
                    {isInitialTab ? (
                        <><AmountDisplay value={editInitial} color="emerald" /><NumericPad value={editInitial} onChange={onChangeInitial} /></>
                    ) : (
                        <><AmountDisplay value={editFinal} color="orange" /><NumericPad value={editFinal} onChange={onChangeFinal} /></>
                    )}
                    <Button variant="primary" size="lg" className="w-full" onClick={onSave} disabled={!editInitial}>
                        Guardar cambios
                    </Button>
                </div>
            )}
        </BaseModal>
    )
}
