import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowLeft, PlusSquare, ClipboardList, Trash2, Download, Save } from 'lucide-react'
import { EmptyState } from '@/components/atoms/EmptyState'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import { formatCurrency } from '@/lib/utils'
import type { CartItem, HeldOrder } from '@/types'

type ModalView = 'choice' | 'save' | 'load'

interface HeldOrdersModalProps {
    isOpen: boolean
    onClose: () => void
    initialView: ModalView
    currentItems: CartItem[]
    currentDiscount: number
    orders: HeldOrder[]
    activeOrderId: string | null
    hasLinkedAccount: boolean
    onSave: (name: string) => void
    onNewCustomer: () => void
    onLoad: (order: HeldOrder) => void
    onDelete: (id: string) => void
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
    orders, activeOrderId, hasLinkedAccount, onSave, onNewCustomer, onLoad, onDelete,
}: HeldOrdersModalProps) {
    const [view, setView] = useState<ModalView>(initialView)
    const [name, setName] = useState('')
    const [confirmLoadId, setConfirmLoadId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const nameKb = useKeyboardInput(name, setName, { mode: 'alpha' })

    useEffect(() => {
        if (isOpen) {
            setView(initialView)
            setName('')
            setConfirmLoadId(null)
            setConfirmDeleteId(null)
        }
    }, [isOpen, initialView])

    const currentTotal = Math.max(0, currentItems.reduce((s, i) => s + i.subtotal, 0) - currentDiscount)
    const currentQty = currentItems.reduce((s, i) => s + i.quantity, 0)

    const showBack = view !== 'choice' && initialView === 'choice'
    const title = view === 'choice'
        ? '¿Qué deseas hacer?'
        : view === 'save'
            ? 'Guardar cuenta'
            : 'Cuentas pendientes'

    const handleLoadClick = (order: HeldOrder) => {
        if (currentItems.length > 0 && !hasLinkedAccount) setConfirmLoadId(order.id)
        else onLoad(order)
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
                                            onClick={() => setView('choice')}
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
                                )}

                                {/* ── SAVE VIEW ── */}
                                {view === 'save' && (
                                    <div className="space-y-4">
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
                                        <div className="space-y-2 max-h-[320px] overflow-y-auto -mx-1 px-1">
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
                                                                <button
                                                                    onClick={() => setConfirmDeleteId(null)}
                                                                    className="px-2 py-1 rounded-lg text-[11px] text-[#7A8FAA] hover:bg-white/5 transition-all cursor-pointer"
                                                                >
                                                                    No
                                                                </button>
                                                                <button
                                                                    onClick={() => { setConfirmDeleteId(null); onDelete(order.id) }}
                                                                    className="px-2 py-1 rounded-lg text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 transition-all cursor-pointer"
                                                                >
                                                                    Eliminar
                                                                </button>
                                                            </div>
                                                        ) : isConfirming ? (
                                                            <div className="mt-2 flex items-center gap-2 border-t border-[#192030] pt-2">
                                                                <p className="text-[11px] text-amber-400 flex-1">¿Reemplazar carrito actual?</p>
                                                                <button
                                                                    onClick={() => setConfirmLoadId(null)}
                                                                    className="px-2 py-1 rounded-lg text-[11px] text-[#7A8FAA] hover:bg-white/5 transition-all cursor-pointer"
                                                                >
                                                                    No
                                                                </button>
                                                                <button
                                                                    onClick={() => { setConfirmLoadId(null); onLoad(order) }}
                                                                    className="px-2 py-1 rounded-lg text-[11px] bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/15 transition-all cursor-pointer"
                                                                >
                                                                    Cargar
                                                                </button>
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
                                    )
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
