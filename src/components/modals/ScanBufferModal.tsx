import { useEffect, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { BaseModal } from './BaseModal'

interface ScanBufferModalProps {
    isOpen: boolean
    barcode: string
    onClose: () => void
    onExpire: () => void
}

const DURATION = 5

export function ScanBufferModal({ isOpen, barcode, onClose, onExpire }: ScanBufferModalProps) {
    const [timeLeft, setTimeLeft] = useState(DURATION)
    const onExpireRef = useRef(onExpire)
    useEffect(() => { onExpireRef.current = onExpire }, [onExpire])

    useEffect(() => {
        if (!isOpen) return
        setTimeLeft(DURATION)
        const tick = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000)
        const expire = setTimeout(() => onExpireRef.current(), DURATION * 1000)
        return () => { clearInterval(tick); clearTimeout(expire) }
    }, [isOpen])

    const radius = 28
    const circumference = 2 * Math.PI * radius
    const dashOffset = circumference * (1 - timeLeft / DURATION)

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="Producto no encontrado" width="max-w-sm">
            <div className="space-y-5">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#101520] border border-[#1E2A40]">
                    <ScanLine size={16} className="text-[#3D506A] shrink-0" />
                    <div>
                        <p className="text-[10px] text-[#3D506A] uppercase tracking-widest mb-0.5">Código escaneado</p>
                        <p className="text-[14px] text-[#E4ECF7] font-mono font-medium">{barcode}</p>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                        <svg width="80" height="80" className="-rotate-90">
                            <circle
                                cx="40" cy="40" r={radius}
                                fill="none" stroke="#1E2A40" strokeWidth="5"
                            />
                            <circle
                                cx="40" cy="40" r={radius}
                                fill="none"
                                stroke="#f97316"
                                strokeWidth="5"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={dashOffset}
                                style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[22px] font-bold text-[#E4ECF7]">{timeLeft}</span>
                        </div>
                    </div>

                    <p className="text-[13px] text-[#7A8FAA] text-center leading-relaxed">
                        Escanea nuevamente para confirmar. Si fue un error de lectura, el código debe aparecer esta vez.
                    </p>
                </div>
            </div>
        </BaseModal>
    )
}
