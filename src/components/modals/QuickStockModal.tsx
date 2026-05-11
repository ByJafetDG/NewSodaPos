import { useState, useEffect } from 'react'
import { Package, Infinity } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { cn } from '@/lib/utils'
import type { Product } from '@/types'

interface QuickStockModalProps {
    isOpen: boolean
    onClose: () => void
    product: Product | null
    onConfirm: (qty: number, makeInfinite: boolean) => void
    isPending?: boolean
}

export function QuickStockModal({ isOpen, onClose, product, onConfirm, isPending }: QuickStockModalProps) {
    const [qty, setQty] = useState('1')
    const [makeInfinite, setMakeInfinite] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setQty('1')
            setMakeInfinite(false)
        }
    }, [isOpen])

    if (!product) return null

    const parsed = parseInt(qty) || 0
    const canConfirm = makeInfinite || parsed > 0

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Producto agotado"
            description="Actualiza el stock para continuar"
            width="max-w-sm"
        >
            <div className="space-y-4">
                {/* Product info */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#101520] border border-[#1E2A40]">
                    <Package size={16} className="text-[#3D506A] shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[13px] text-[#E4ECF7] font-medium truncate">{product.name}</p>
                        <p className="text-[11px] text-orange-400">
                            Stock actual: {product.stockQty} unidades
                        </p>
                    </div>
                </div>

                {/* Qty input */}
                {!makeInfinite && (
                    <div className="space-y-1.5">
                        <label className="text-[11px] text-[#3D506A] uppercase tracking-widest">
                            Unidades a agregar
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={qty}
                            onChange={e => setQty(e.target.value)}
                            autoFocus
                            className="w-full h-11 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[18px] text-center outline-none focus:border-orange-500/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                    </div>
                )}

                {/* Infinite toggle */}
                <button
                    onClick={() => setMakeInfinite(v => !v)}
                    className={cn(
                        'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer',
                        makeInfinite
                            ? 'bg-orange-500/10 border-orange-500/30'
                            : 'bg-[#101520] border-[#1E2A40] hover:bg-[#161D2E]'
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Infinity size={15} className={makeInfinite ? 'text-orange-400' : 'text-[#3D506A]'} />
                        <span className={cn('text-[13px]', makeInfinite ? 'text-[#E4ECF7]' : 'text-[#7A8FAA]')}>
                            Hacer stock infinito
                        </span>
                    </div>
                    <div className={cn(
                        'w-9 h-5 rounded-full relative transition-colors',
                        makeInfinite ? 'bg-orange-500' : 'bg-[#1E2A40]'
                    )}>
                        <div className={cn(
                            'w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all',
                            makeInfinite ? 'left-[19px]' : 'left-[3px]'
                        )} />
                    </div>
                </button>

                <div className="flex gap-2">
                    <Button variant="ghost" size="md" className="flex-1" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        className="flex-1"
                        disabled={!canConfirm || isPending}
                        loading={isPending}
                        onClick={() => onConfirm(parsed, makeInfinite)}
                    >
                        {makeInfinite ? 'Hacer infinito y agregar' : `Agregar ${parsed} und.`}
                    </Button>
                </div>
            </div>
        </BaseModal>
    )
}
