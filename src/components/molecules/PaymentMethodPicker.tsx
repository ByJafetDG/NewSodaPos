import { Banknote, Smartphone, CreditCard } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaymentMethod } from '@/types'

interface PaymentMethodPickerProps {
    value: PaymentMethod
    onChange: (method: PaymentMethod) => void
}

const METHODS = [
    { id: 'EFECTIVO' as PaymentMethod, label: 'Efectivo', icon: Banknote, color: 'emerald' },
    { id: 'SINPE'    as PaymentMethod, label: 'SINPE',    icon: Smartphone, color: 'blue' },
    { id: 'CREDITO'  as PaymentMethod, label: 'Crédito',  icon: CreditCard, color: 'violet' },
] as const

const activeColors: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    blue:    'bg-blue-500/10 border-blue-500/30 text-blue-400',
    violet:  'bg-violet-500/10 border-violet-500/30 text-violet-400',
}

export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ id, label, icon: Icon, color }) => {
                const isActive = value === id
                return (
                    <button
                        key={id}
                        onClick={() => onChange(id)}
                        className={cn(
                            'flex flex-col items-center gap-2 py-3.5 rounded-xl border transition-all duration-150 cursor-pointer select-none',
                            isActive
                                ? activeColors[color]
                                : 'bg-[#101520] border-[#192030] text-[#3D506A] hover:bg-[#161D2E] hover:text-[#7A8FAA]'
                        )}
                    >
                        <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                        <span className="text-[12px] font-semibold leading-none">{label}</span>
                    </button>
                )
            })}
        </div>
    )
}
