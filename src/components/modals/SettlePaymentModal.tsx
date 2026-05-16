import { useState } from 'react'
import { X, Banknote, Smartphone, Landmark, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn, formatCurrency } from '@/lib/utils'

type SettleMethod = 'EFECTIVO' | 'SINPE' | 'DEPOSITO'

interface SettlePaymentModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (method: SettleMethod) => void
    title: string
    amount: number
    isPending?: boolean
}

const METHODS: { value: SettleMethod; label: string; icon: React.ElementType; color: string; bg: string; border: string }[] = [
    { value: 'EFECTIVO', label: 'Efectivo',  icon: Banknote,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    { value: 'SINPE',    label: 'SINPE',     icon: Smartphone, color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30'   },
    { value: 'DEPOSITO', label: 'Depósito',  icon: Landmark,  color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
]

export function SettlePaymentModal({ isOpen, onClose, onConfirm, title, amount, isPending }: SettlePaymentModalProps) {
    const [selected, setSelected] = useState<SettleMethod | null>(null)

    function handleClose() { setSelected(null); onClose() }
    function handleConfirm() {
        if (!selected || isPending) return
        onConfirm(selected)
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
                        onClick={handleClose}
                    />
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="fixed z-50 inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-xs px-4"
                    >
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                                <h2 className="text-[15px] font-semibold text-[#E4ECF7]">{title}</h2>
                                <button onClick={handleClose} className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="px-5 pb-5 space-y-3">
                                <div className="text-center py-3 rounded-xl bg-[#101520] border border-[#192030]">
                                    <p className="text-[11px] text-[#3D506A] uppercase tracking-wider mb-1">Total a saldar</p>
                                    <p className="text-[28px] font-bold text-[#E4ECF7] font-mono">{formatCurrency(amount)}</p>
                                </div>

                                <p className="text-[11px] text-[#3D506A] uppercase tracking-wider font-semibold">Método de pago</p>

                                <div className="space-y-2">
                                    {METHODS.map(m => {
                                        const Icon = m.icon
                                        const active = selected === m.value
                                        return (
                                            <button
                                                key={m.value}
                                                onClick={() => setSelected(m.value)}
                                                className={cn(
                                                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer text-left',
                                                    active ? `${m.bg} ${m.border}` : 'bg-[#101520] border-[#192030] hover:bg-[#161D2E]'
                                                )}
                                            >
                                                <Icon size={16} className={active ? m.color : 'text-[#3D506A]'} />
                                                <span className={cn('text-[13px] font-semibold flex-1', active ? m.color : 'text-[#7A8FAA]')}>{m.label}</span>
                                                {active && <Check size={14} className={m.color} />}
                                            </button>
                                        )
                                    })}
                                </div>

                                <button
                                    onClick={handleConfirm}
                                    disabled={!selected || isPending}
                                    className="w-full h-12 rounded-xl bg-emerald-500 text-white text-[14px] font-bold hover:bg-emerald-600 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {isPending ? 'Saldando...' : 'Confirmar pago'}
                                    {!isPending && <Check size={16} />}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
