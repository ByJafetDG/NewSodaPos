import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { PaymentMethod } from '@/types'

export interface SaleSuccessData {
    total: number
    itemCount: number
    items: { name: string; quantity: number }[]
    cashier: string
    paymentMethod: PaymentMethod
}

function playSaleSound() {
    try {
        const ctx = new AudioContext()
        const now = ctx.currentTime

        const tone = (freq: number, start: number, duration: number, vol: number) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.setValueAtTime(freq, start)
            gain.gain.setValueAtTime(0, start)
            gain.gain.linearRampToValueAtTime(vol, start + 0.012)
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
            osc.start(start)
            osc.stop(start + duration)
        }

        tone(1046.5, now, 0.18, 0.25)        // C6
        tone(1318.5, now + 0.1, 0.22, 0.18)  // E6

        setTimeout(() => ctx.close(), 800)
    } catch { }
}

const DISMISS_MS = 3000

export function SaleSuccessModal({ data, onClose }: { data: SaleSuccessData | null; onClose: () => void }) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!data) return
        playSaleSound()
        timerRef.current = setTimeout(onClose, DISMISS_MS)
        return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }, [data])

    const itemsSummary = data?.items
        .map(i => i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)
        .join(', ') ?? ''

    return (
        <AnimatePresence>
            {data && (
                <motion.div
                    key="sale-success"
                    initial={{ opacity: 0, scale: 0.92, y: -16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: -16 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="fixed top-5 inset-x-0 mx-auto z-50 w-full max-w-[360px] px-4"
                >
                    <div className="bg-[#0A1220] border border-emerald-500/25 rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.6)] overflow-hidden">
                        {/* Countdown bar */}
                        <motion.div
                            initial={{ scaleX: 1 }}
                            animate={{ scaleX: 0 }}
                            transition={{ duration: DISMISS_MS / 1000, ease: 'linear' }}
                            style={{ transformOrigin: 'left' }}
                            className="h-[2px] bg-emerald-500/70"
                        />

                        <div className="flex items-start gap-3 px-4 py-3.5">
                            {/* Icon */}
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 text-emerald-400 shrink-0 mt-0.5">
                                <CheckCircle2 size={20} />
                            </div>

                            {/* Body */}
                            <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-emerald-400 uppercase tracking-wide">Venta completada</p>
                                <p className="text-[22px] font-bold text-[#E4ECF7] leading-tight">{formatCurrency(data.total)}</p>

                                <p className="text-[11px] text-[#7A8FAA] mt-1.5 leading-snug line-clamp-2">
                                    {data.itemCount} {data.itemCount === 1 ? 'producto' : 'productos'}: {itemsSummary}
                                </p>
                                <p className="text-[11px] text-[#3D506A] mt-0.5">
                                    Cajero: <span className="text-[#7A8FAA]">{data.cashier}</span>
                                </p>
                            </div>

                            {/* Dismiss */}
                            <button
                                onClick={onClose}
                                className="w-7 h-7 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer shrink-0"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
