import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DoorOpen, Wallet, X } from 'lucide-react'
import { NumericPad } from '@/components/molecules/NumericPad'
import { Button } from '@/components/atoms/Button'
import { useActiveRegister, useOpenRegister } from '@/hooks/useCashRegister'
import { cn, formatCurrency } from '@/lib/utils'

const SKIP_KEY = 'soda_caja_skipped_date'

function getTodayStr() {
    return new Date().toISOString().slice(0, 10)
}

function wasSkippedToday() {
    return localStorage.getItem(SKIP_KEY) === getTodayStr()
}

function skipToday() {
    localStorage.setItem(SKIP_KEY, getTodayStr())
}

function AmountDisplay({ value }: { value: string }) {
    const amount = parseInt(value) || 0
    return (
        <div className="text-center py-4 rounded-xl bg-[#101520] border border-[#192030]">
            <p className={cn('text-[30px] font-bold font-mono', amount > 0 ? 'text-emerald-400' : 'text-[#3D506A]')}>
                {formatCurrency(amount)}
            </p>
        </div>
    )
}

export function StartupCajaModal() {
    const { data: activeRegister, isLoading } = useActiveRegister()
    const openRegister = useOpenRegister()
    const [amount, setAmount] = useState('')
    const [skipped, setSkipped] = useState(() => wasSkippedToday())

    const isOpen = !isLoading && !activeRegister && !skipped

    async function handleOpen() {
        const parsed = parseInt(amount) || 0
        await openRegister.mutateAsync(parsed)
        setAmount('')
    }

    function handleSkip() {
        skipToday()
        setSkipped(true)
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop — no onClick to force decision */}
                    <motion.div
                        key="startup-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
                    />

                    {/* Panel */}
                    <motion.div
                        key="startup-panel"
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 12 }}
                        transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="fixed z-[51] inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-sm px-4"
                    >
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#192030]">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10">
                                        <Wallet size={18} className="text-emerald-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-[16px] font-semibold text-[#E4ECF7]">Abrir Caja</h2>
                                        <p className="text-[12px] text-[#3D506A] mt-0.5">Inicio del día</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleSkip}
                                    className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                                    title="Omitir por hoy"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="px-6 py-5 space-y-4">
                                <div className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                                    <DoorOpen size={28} className="text-emerald-400" />
                                    <p className="text-[12px] text-[#3D506A]">Ingresa el fondo inicial en caja</p>
                                </div>

                                <AmountDisplay value={amount} />
                                <NumericPad value={amount} onChange={setAmount} />

                                <Button
                                    variant="primary"
                                    size="lg"
                                    className="w-full"
                                    onClick={handleOpen}
                                    disabled={openRegister.isPending}
                                >
                                    Abrir Caja
                                </Button>

                                <button
                                    onClick={handleSkip}
                                    className="w-full text-[13px] text-[#3D506A] hover:text-[#7A8FAA] transition-colors py-1 cursor-pointer"
                                >
                                    Omitir por hoy
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
