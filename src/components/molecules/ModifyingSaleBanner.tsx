import { Pencil, X } from 'lucide-react'

interface Props {
    saleNumber: number
    clientName?: string | null
    onCancel: () => void
}

export function ModifyingSaleBanner({ saleNumber, clientName, onCancel }: Props) {
    return (
        <div className="flex items-center gap-2.5 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
            <Pencil size={12} className="text-amber-400 shrink-0" />
            <span className="text-[12px] font-semibold text-amber-300 shrink-0">
                Modificando venta #{saleNumber}
            </span>
            {clientName && (
                <span className="text-[11px] text-amber-400/70 truncate">
                    — {clientName}
                </span>
            )}
            <button
                onClick={onCancel}
                className="ml-auto w-5 h-5 flex items-center justify-center rounded-full bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-all cursor-pointer shrink-0"
            >
                <X size={9} />
            </button>
        </div>
    )
}
