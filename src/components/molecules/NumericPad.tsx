import { Delete } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

interface NumericPadProps {
    value: string
    onChange: (val: string) => void
    total?: number
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'DEL', 'C'] as const

export function NumericPad({ value, onChange, total }: NumericPadProps) {
    const handleKey = (key: string) => {
        if (key === 'C') { onChange(''); return }
        if (key === 'DEL') { onChange(value.slice(0, -1)); return }
        onChange(value + key)
    }

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
                {KEYS.map(key => (
                    <button
                        key={key}
                        onClick={() => handleKey(key)}
                        className={cn(
                            'h-12 flex items-center justify-center rounded-xl font-bold text-[16px]',
                            'transition-all active:scale-95 border cursor-pointer select-none',
                            key === 'C'
                                ? 'bg-amber-500/8 text-amber-400 border-amber-500/15 hover:bg-amber-500/15'
                                : key === 'DEL'
                                    ? 'bg-red-500/8 text-red-400 border-red-500/15 hover:bg-red-500/15'
                                    : 'bg-[#101520] text-[#E4ECF7] border-[#192030] hover:bg-[#1C2438] hover:border-[#283A56]'
                        )}
                    >
                        {key === 'DEL' ? <Delete size={18} /> : key}
                    </button>
                ))}
            </div>

            {total !== undefined && (
                <button
                    onClick={() => onChange(total.toString())}
                    className="w-full h-10 rounded-xl bg-orange-500/8 text-orange-400 border border-orange-500/15 text-[12px] font-bold uppercase tracking-widest hover:bg-orange-500/15 transition-all active:scale-95 cursor-pointer"
                >
                    Monto exacto — {formatCurrency(total)}
                </button>
            )}
        </div>
    )
}
