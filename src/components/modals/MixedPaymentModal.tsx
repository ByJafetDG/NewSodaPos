import { useState, useEffect } from 'react'
import { Banknote, Smartphone, CreditCard, Check } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { cn } from '@/lib/utils'

type MixedMethod = 'EFECTIVO' | 'SINPE' | 'CUENTA'
export type MixedModalView = 'select' | 'cancel'

const METHOD_DEFS: { key: MixedMethod; label: string; color: 'emerald' | 'blue' | 'violet' }[] = [
    { key: 'EFECTIVO', label: 'Efectivo',        color: 'emerald' },
    { key: 'SINPE',    label: 'SINPE',            color: 'blue'    },
    { key: 'CUENTA',   label: 'Cargo a cuenta',   color: 'violet'  },
]

const COLOR_SELECTED: Record<string, string> = {
    emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
    blue:    'bg-blue-500/15    border-blue-500/40    text-blue-400',
    violet:  'bg-violet-500/15  border-violet-500/40  text-violet-400',
}
const ICON_MAP: Record<MixedMethod, React.ReactNode> = {
    EFECTIVO: <Banknote  size={22} />,
    SINPE:    <Smartphone size={22} />,
    CUENTA:   <CreditCard size={22} />,
}

interface MixedPaymentModalProps {
    isOpen: boolean
    onClose: () => void
    initialView: MixedModalView
    currentMethods: string[]
    onConfirm: (methods: string[]) => void
    onCancelMixed: () => void
}

export function MixedPaymentModal({
    isOpen, onClose, initialView, currentMethods, onConfirm, onCancelMixed,
}: MixedPaymentModalProps) {
    const [view, setView] = useState<MixedModalView>(initialView)
    const [selected, setSelected] = useState<string[]>(currentMethods)

    useEffect(() => {
        if (isOpen) {
            setView(initialView)
            setSelected(currentMethods.length > 0 ? currentMethods : [])
        }
    }, [isOpen])

    const toggle = (key: string) =>
        setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

    if (view === 'cancel') {
        const labels = currentMethods
            .map(m => METHOD_DEFS.find(x => x.key === m)?.label ?? m)
            .join(' + ')
        return (
            <BaseModal isOpen={isOpen} onClose={onClose} title="Pago mixto activo" width="max-w-xs">
                <div className="space-y-4">
                    <p className="text-[13px] text-[#7A8FAA] text-center">{labels}</p>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={onCancelMixed}
                            className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-all cursor-pointer active:scale-95"
                        >
                            <span className="text-[12px] font-semibold leading-tight text-center">Cancelar pago mixto</span>
                        </button>
                        <button
                            onClick={() => { setSelected(currentMethods); setView('select') }}
                            className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-orange-500/10 border border-orange-500/25 text-orange-400 hover:bg-orange-500/18 transition-all cursor-pointer active:scale-95"
                        >
                            <span className="text-[12px] font-semibold leading-tight text-center">Agregar/Editar opción</span>
                        </button>
                    </div>
                </div>
            </BaseModal>
        )
    }

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="¿Con qué formas pagará?" width="max-w-xs">
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                    {METHOD_DEFS.map(({ key, label, color }) => {
                        const isSelected = selected.includes(key)
                        return (
                            <button
                                key={key}
                                onClick={() => toggle(key)}
                                className={cn(
                                    'relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer active:scale-95',
                                    isSelected ? COLOR_SELECTED[color] : 'bg-[#101520] border-[#192030] text-[#3D506A] hover:border-[#2A3A50] hover:text-[#7A8FAA]'
                                )}
                            >
                                {isSelected && (
                                    <span className="absolute top-1.5 right-1.5">
                                        <Check size={10} />
                                    </span>
                                )}
                                {ICON_MAP[key]}
                                <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
                            </button>
                        )
                    })}
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" size="md" onClick={onClose} className="flex-1">
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        className="flex-1"
                        disabled={selected.length < 2}
                        onClick={() => onConfirm(selected)}
                    >
                        Confirmar
                    </Button>
                </div>
            </div>
        </BaseModal>
    )
}
