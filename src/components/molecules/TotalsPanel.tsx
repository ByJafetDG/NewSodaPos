import { formatCurrency } from '@/lib/utils'

interface TotalsPanelProps {
    itemCount: number
    subtotal: number
    discount: number
    total: number
    debtTotal?: number
}

export function TotalsPanel({ itemCount, subtotal, discount, total, debtTotal = 0 }: TotalsPanelProps) {
    const effectiveTotal = total + debtTotal
    return (
        <div className="space-y-2">
            <Row label="Artículos" value={String(itemCount)} />
            <Row label="Subtotal" value={formatCurrency(subtotal)} mono />
            {discount > 0 && (
                <Row label="Descuento" value={`-${formatCurrency(discount)}`} mono className="text-amber-400" />
            )}
            {debtTotal > 0 && (
                <Row label="Deuda pendiente" value={`+${formatCurrency(debtTotal)}`} mono className="text-violet-400" />
            )}
            <div className="flex items-center justify-between pt-2.5 border-t border-[#192030]">
                <span className="text-[15px] font-bold text-[#CBD5E1]">Total</span>
                <span className="text-[24px] font-bold text-orange-400 font-mono leading-none">
                    {formatCurrency(effectiveTotal)}
                </span>
            </div>
        </div>
    )
}

function Row({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-[12px] text-[#3D506A]">{label}</span>
            <span className={`text-[13px] font-medium text-[#7A8FAA] ${mono ? 'font-mono' : ''} ${className ?? ''}`}>
                {value}
            </span>
        </div>
    )
}
