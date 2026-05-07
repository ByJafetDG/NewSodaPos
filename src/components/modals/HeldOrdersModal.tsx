import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowLeft, PlusSquare, ClipboardList, Trash2, Download, Save, Merge, Check, RotateCcw } from 'lucide-react'
import { EmptyState } from '@/components/atoms/EmptyState'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import { formatCurrency, cn } from '@/lib/utils'
import type { CartItem, HeldOrder } from '@/types'

type ModalView = 'choice' | 'save' | 'load' | 'merge'

interface HeldOrdersModalProps {
    isOpen: boolean
    onClose: () => void
    initialView: 'choice' | 'save' | 'load'
    currentItems: CartItem[]
    currentDiscount: number
    orders: HeldOrder[]
    activeOrderId: string | null
    hasLinkedAccount: boolean
    onSave: (name: string) => void
    onNewCustomer: () => void
    onLoad: (order: HeldOrder) => void
    onDelete: (id: string) => void
    onMerge: (ids: string[]) => void
    hasMergeSnapshot?: boolean
    onUndoMerge?: () => void
}

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'ahora'
    if (min < 60) return `hace ${min} min`
    return `hace ${Math.floor(min / 60)}h`
}

export function HeldOrdersModal({
    isOpen, onClose, initialView,
    currentItems, currentDiscount,
    orders, activeOrderId, hasLinkedAccount,
    onSave, onNewCustomer, onLoad, onDelete, onMerge,
    hasMergeSnapshot, onUndoMerge,
}: HeldOrdersModalProps) {
    const [view, setView] = useState<ModalView>(initialView)
    const [name, setName] = useState('')
    const [confirmLoadId, setConfirmLoadId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const nameKb = useKeyboardInput(name, setName, { mode: 'alpha' })

    useEffect(() => {
        if (isOpen) {
            setView(initialView)
            setName('')
            setConfirmLoadId(null)
            setConfirmDeleteId(null)
            setSelectedIds([])
        }
    }, [isOpen, initialView])

    const currentTotal = Math.max(0, currentItems.reduce((s, i) => s + i.subtotal, 0) - currentDiscount)
    const currentQty = currentItems.reduce((s, i) => s + i.quantity, 0)

    function toggleSelect(id: string) {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
    }

    const selectedOrders = orders.filter(o => selectedIds.includes(o.id))
    const mergedTotal = selectedOrders.reduce((s, o) => {
        const orderTotal = Math.max(0, o.items.reduce((t, i) => t + i.subtotal, 0) - o.discount)
        return s + orderTotal
    }, 0)
    const mergedQty = selectedOrders.reduce((s, o) =>
        s + o.items.reduce((t, i) => t + i.quantity, 0), 0
    )

    const showBack = view !== 'choice' && initialView === 'choice'
    const title =
        view === 'choice' ? '¿Qué deseas hacer?' :
        view === 'save'   ? 'Guardar cuenta' :
        view === 'load'   ? 'Cuentas pendientes' :
                            'Juntar cuentas'

    const handleLoadClick = (order: HeldOrder) => {
        if (currentItems.length > 0 && !hasLinkedAccount) setConfirmLoadId(order.id)
        else onLoad(order)
    }

    function handleConfirmMerge() {
        onMerge(selectedIds)
        onClose()
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
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

                            {/* Header */}
                            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#192030]">
                                <div className="flex items-center gap-2.5">
                                    {showBack && (
                                        <button
                                            onClick={() => { setView('choice'); setSelectedIds([]) }}
                                            className="w-7 h-7 rounded-lg text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                                        >
                                            <ArrowLeft size={14} />
                                        </button>
                                    )}
                                    {view === 'merge' && initialView !== 'choice' && (
                                        <button
                                            onClick={() => { setView('load'); setSelectedIds([]) }}
                                            className="w-7 h-7 rounded-lg text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                                        >
                                            <ArrowLeft size={14} />
                                        </button>
                                    )}
                                    <div>
                                        <h2 className="text-[16px] font-semibold text-[#E4ECF7]">{title}</h2>
                                        {view === 'load' && orders.length > 0 && (
                                            <p className="text-[12px] text-[#3D506A] mt-0.5">
                                                {orders.length} cuenta{orders.length !== 1 ? 's' : ''} pendiente{orders.length !== 1 ? 's' : ''}
                                            </p>
                                        )}
                                        {view === 'merge' && (
                                            <p className="text-[12px] text-[#3D506A] mt-0.5">
                                                {selectedIds.length < 2
                                                    ? `Selecciona ${selectedIds.length === 0 ? 'al menos 2' : '1 más'}`
                                                    : `${selectedIds.length} seleccionadas · ${formatCurrency(mergedTotal)}`
                                                }
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="px-6 py-5">

                                {/* ── CHOICE VIEW ── */}
                                {view === 'choice' && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => hasLinkedAccount ? onNewCustomer() : setView('save')}
                                                className="flex flex-col items-center gap-3 p-5 rounded-xl bg-[#101520] border border-[#1E2A40] hover:border-orange-500/30 hover:bg-orange-500/5 transition-all duration-150 cursor-pointer text-center"
                                            >
                                                <div className="w-11 h-11 rounded-full bg-orange-500/10 flex items-center justify-center">
                                                    <PlusSquare size={22} className="text-orange-400" />
                                                </div>
                                                <div>
                                                    <p className="text-[13px] font-semibold text-[#CBD5E1] leading-tight">
                                                        {hasLinkedAccount ? 'Nuevo cliente' : 'Crear una cuenta'}
                                                    </p>
                                                    <p className="text-[11px] text-[#3D506A] mt-1 leading-snug">
                                                        {hasLinkedAccount
                                                            ? 'Cuenta guardada · Limpiar carrito'
                                                            : 'Guardar el carrito para cobrar después'}
                                                    </p>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => setView('load')}
                                                className="flex flex-col items-center gap-3 p-5 rounded-xl bg-[#101520] border border-[#1E2A40] hover:border-amber-500/30 hover:bg-amber-500/5 transition-all duration-150 cursor-pointer text-center"
                                            >
                                                <div className="relative w-11 h-11 rounded-full bg-amber-500/10 flex items-center justify-center">
                                                    <ClipboardList size={22} className="text-amber-400" />
                                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">
                                                        {orders.length}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-[13px] font-semibold text-[#CBD5E1] leading-tight">Cargar una cuenta</p>
                                                    <p className="text-[11px] text-[#3D506A] mt-1 leading-snug">Ver cuentas pendientes guardadas</p>
                                                </div>
                                            </button>
                                        </div>

                                        {orders.length >= 2 && (
                                            <button
                                                onClick={() => { setView('merge'); setSelectedIds([]) }}
                                                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#101520] border border-[#1E2A40] hover:border-blue-500/30 hover:bg-blue-500/5 transition-all duration-150 cursor-pointer"
                                            >
                                                <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                                                    <Merge size={18} className="text-blue-400" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-[13px] font-semibold text-[#CBD5E1]">Juntar cuentas</p>
                                                    <p className="text-[11px] text-[#3D506A]">Combinar varias cuentas en una sola</p>
                                                </div>
                                            </button>
                                        )}

                                        {hasMergeSnapshot && onUndoMerge && (
                                            <button
                                                onClick={() => { onUndoMerge(); onClose() }}
                                                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#101520] border border-orange-500/20 hover:border-orange-500/35 hover:bg-orange-500/5 transition-all duration-150 cursor-pointer"
                                            >
                                                <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                                                    <RotateCcw size={17} className="text-orange-400" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-[13px] font-semibold text-[#CBD5E1]">Deshacer fusión</p>
                                                    <p className="text-[11px] text-[#3D506A]">Separar las cuentas juntadas nuevamente</p>
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* ── SAVE VIEW ── */}
                                {view === 'save' && (
                                    <div className="space-y-4">
                                        {hasMergeSnapshot && onUndoMerge && (
                                            <button
                                                onClick={() => { onUndoMerge(); onClose() }}
                                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#101520] border border-orange-500/20 hover:border-orange-500/35 hover:bg-orange-500/5 transition-all duration-150 cursor-pointer"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                                                    <RotateCcw size={15} className="text-orange-400" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-[13px] font-semibold text-[#CBD5E1]">Deshacer fusión</p>
                                                    <p className="text-[11px] text-[#3D506A]">Separar las cuentas juntadas nuevamente</p>
                                                </div>
                                            </button>
                                        )}
                                        {currentItems.length > 0 ? (
                                            <>
                                                <div className="flex items-center justify-between px-3 py-2.5 bg-[#101520] rounded-xl border border-[#1E2A40]">
                                                    <span className="text-[12px] text-[#7A8FAA]">Carrito actual</span>
                                                    <span className="text-[12px] font-semibold text-[#CBD5E1]">
                                                        {currentQty} prod · {formatCurrency(currentTotal)}
                                                    </span>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="block text-[11px] text-[#3D506A] uppercase tracking-wider">
                                                        Nombre del cliente (opcional)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        {...nameKb}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') { useKeyboardStore.getState().close(); onSave(name) } }}
                                                        placeholder="Ej: Juan, Mesa 3..."
                                                        className="w-full h-10 px-3 rounded-xl bg-[#0B0F1A] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                                                    />
                                                    <p className="text-[10px] text-[#3D506A]">
                                                        Si lo dejas vacío se guardará como "Cuenta pendiente {orders.length + 1}"
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => { useKeyboardStore.getState().close(); onSave(name) }}
                                                    className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/15 font-semibold text-[13px] transition-all cursor-pointer"
                                                >
                                                    <Save size={15} />
                                                    Guardar cuenta
                                                </button>
                                            </>
                                        ) : (
                                            <EmptyState
                                                icon={<PlusSquare size={32} />}
                                                title="Carrito vacío"
                                                description="Agrega productos al carrito antes de guardar una cuenta"
                                                className="py-6"
                                            />
                                        )}
                                    </div>
                                )}

                                {/* ── LOAD VIEW ── */}
                                {view === 'load' && (
                                    orders.length === 0 ? (
                                        <EmptyState
                                            icon={<ClipboardList size={32} />}
                                            title="Sin cuentas guardadas"
                                            description="Guarda el carrito de un cliente para verlo aquí"
                                            className="py-6"
                                        />
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="space-y-2 max-h-[280px] overflow-y-auto -mx-1 px-1">
                                                {orders.map(order => {
                                                    const orderTotal = Math.max(0, order.items.reduce((s, i) => s + i.subtotal, 0) - order.discount)
                                                    const orderQty = order.items.reduce((s, i) => s + i.quantity, 0)
                                                    const isConfirming = confirmLoadId === order.id
                                                    const isActive = order.id === activeOrderId

                                                    return (
                                                        <div key={order.id} className={`border rounded-xl p-3.5 transition-colors ${isActive ? 'bg-amber-500/5 border-amber-500/25' : 'bg-[#101520] border-[#1E2A40]'}`}>
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-[13px] font-semibold text-[#E4ECF7] truncate">{order.name}</p>
                                                                        {isActive && (
                                                                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full">
                                                                                Activa
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[11px] text-[#3D506A] mt-0.5">
                                                                        {orderQty} prod · {formatCurrency(orderTotal)} · {timeAgo(order.savedAt)}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    onClick={() => setConfirmDeleteId(order.id)}
                                                                    className="w-7 h-7 rounded-lg text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all cursor-pointer shrink-0"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>

                                                            {confirmDeleteId === order.id ? (
                                                                <div className="mt-2 flex items-center gap-2 border-t border-[#192030] pt-2">
                                                                    <p className="text-[11px] text-red-400 flex-1">
                                                                        {isActive ? '¿Eliminar y limpiar carrito?' : '¿Eliminar esta cuenta?'}
                                                                    </p>
                                                                    <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 rounded-lg text-[11px] text-[#7A8FAA] hover:bg-white/5 transition-all cursor-pointer">No</button>
                                                                    <button onClick={() => { setConfirmDeleteId(null); onDelete(order.id) }} className="px-2 py-1 rounded-lg text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 transition-all cursor-pointer">Eliminar</button>
                                                                </div>
                                                            ) : isConfirming ? (
                                                                <div className="mt-2 flex items-center gap-2 border-t border-[#192030] pt-2">
                                                                    <p className="text-[11px] text-amber-400 flex-1">¿Reemplazar carrito actual?</p>
                                                                    <button onClick={() => setConfirmLoadId(null)} className="px-2 py-1 rounded-lg text-[11px] text-[#7A8FAA] hover:bg-white/5 transition-all cursor-pointer">No</button>
                                                                    <button onClick={() => { setConfirmLoadId(null); onLoad(order) }} className="px-2 py-1 rounded-lg text-[11px] bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/15 transition-all cursor-pointer">Cargar</button>
                                                                </div>
                                                            ) : !isActive ? (
                                                                <button
                                                                    onClick={() => handleLoadClick(order)}
                                                                    className="mt-2 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-[#161D2E] border border-[#1E2A40] text-[#7A8FAA] hover:text-[#CBD5E1] hover:border-[#2A3A54] text-[12px] font-medium transition-all cursor-pointer"
                                                                >
                                                                    <Download size={12} />
                                                                    Cargar esta cuenta
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            {orders.length >= 2 && (
                                                <button
                                                    onClick={() => { setView('merge'); setSelectedIds([]) }}
                                                    className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-[#1E2A40] text-[#3D506A] hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/5 text-[12px] font-medium transition-all cursor-pointer"
                                                >
                                                    <Merge size={13} />
                                                    Juntar cuentas
                                                </button>
                                            )}
                                        </div>
                                    )
                                )}

                                {/* ── MERGE VIEW ── */}
                                {view === 'merge' && (
                                    <div className="space-y-3">
                                        <div className="space-y-2 max-h-[280px] overflow-y-auto -mx-1 px-1">
                                            {orders.map(order => {
                                                const orderTotal = Math.max(0, order.items.reduce((s, i) => s + i.subtotal, 0) - order.discount)
                                                const orderQty = order.items.reduce((s, i) => s + i.quantity, 0)
                                                const isSelected = selectedIds.includes(order.id)

                                                return (
                                                    <button
                                                        key={order.id}
                                                        onClick={() => toggleSelect(order.id)}
                                                        className={cn(
                                                            'w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer',
                                                            isSelected
                                                                ? 'border-blue-500/40 bg-blue-500/8'
                                                                : 'border-[#1E2A40] bg-[#101520] hover:border-[#2A3A54]'
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            'w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all',
                                                            isSelected
                                                                ? 'bg-blue-500 border-blue-500'
                                                                : 'border-[#3D506A]'
                                                        )}>
                                                            {isSelected && <Check size={11} className="text-white" />}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-[13px] font-semibold text-[#E4ECF7] truncate">{order.name}</p>
                                                            <p className="text-[11px] text-[#3D506A] mt-0.5">
                                                                {orderQty} prod · {formatCurrency(orderTotal)} · {timeAgo(order.savedAt)}
                                                            </p>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>

                                        <div className={cn(
                                            'rounded-xl border p-3 transition-all',
                                            selectedIds.length >= 2
                                                ? 'border-blue-500/25 bg-blue-500/5'
                                                : 'border-[#1E2A40] bg-[#101520]'
                                        )}>
                                            {selectedIds.length >= 2 ? (
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[12px]">
                                                        <span className="text-[#7A8FAA]">Total combinado</span>
                                                        <span className="font-semibold text-[#E4ECF7]">{formatCurrency(mergedTotal)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[12px]">
                                                        <span className="text-[#7A8FAA]">Total unidades</span>
                                                        <span className="text-[#7A8FAA]">{mergedQty} productos</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-[12px] text-[#3D506A] text-center">
                                                    Selecciona {selectedIds.length === 0 ? 'al menos 2 cuentas' : '1 cuenta más'} para ver el resumen
                                                </p>
                                            )}
                                        </div>

                                        <button
                                            onClick={handleConfirmMerge}
                                            disabled={selectedIds.length < 2}
                                            className={cn(
                                                'w-full flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-[13px] transition-all',
                                                selectedIds.length >= 2
                                                    ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 cursor-pointer'
                                                    : 'bg-[#101520] border border-[#1E2A40] text-[#3D506A] cursor-not-allowed'
                                            )}
                                        >
                                            <Merge size={15} />
                                            {selectedIds.length >= 2
                                                ? `Juntar y cobrar (${selectedIds.length} cuentas)`
                                                : 'Juntar y cobrar'
                                            }
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
