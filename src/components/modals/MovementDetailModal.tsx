import { useState } from 'react'
import { Minus, Plus, Trash2, ArrowDownToLine } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { Badge } from '@/components/atoms/Badge'
import type { InventoryMovement, Product } from '@/types'
import type { MovementBatch } from '@/components/organisms/inventory/MovementsPanel'

interface MovementDetailModalProps {
    isOpen: boolean
    onClose: () => void
    batch: MovementBatch | null
    products: Product[]
    onUpdateQty: (mv: InventoryMovement, newQty: number) => void
    onDelete: (mv: InventoryMovement) => void
}

export function MovementDetailModal({
    isOpen, onClose, batch, products, onUpdateQty, onDelete,
}: MovementDetailModalProps) {
    if (!batch) return null

    const date = batch.date.toLocaleDateString('es-CR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const time = batch.date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })
    const totalUnits = batch.movements.reduce((s, m) => s + m.quantity, 0)
    const note = batch.movements[0]?.notes

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Detalle del movimiento"
            description={`${date} · ${time}`}
            width="max-w-lg"
        >
            <div className="space-y-3">
                {/* Meta */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="success">
                        <ArrowDownToLine size={10} />
                        Entrada
                    </Badge>
                    <span className="text-[12px] text-[#7A8FAA]">
                        {batch.movements.length} producto{batch.movements.length !== 1 ? 's' : ''} · {totalUnits} unidades
                    </span>
                    {note && (
                        <span className="text-[12px] text-[#3D506A] italic">"{note}"</span>
                    )}
                </div>

                {/* Movement rows */}
                <div className="divide-y divide-[#192030] rounded-xl border border-[#1E2A40] overflow-hidden">
                    {batch.movements.map(mv => (
                        <MovementRow
                            key={mv.id}
                            movement={mv}
                            products={products}
                            onUpdateQty={onUpdateQty}
                            onDelete={onDelete}
                        />
                    ))}
                </div>

                <Button variant="secondary" size="md" onClick={onClose} className="w-full">
                    Cerrar
                </Button>
            </div>
        </BaseModal>
    )
}

function MovementRow({ movement, products, onUpdateQty, onDelete }: {
    movement: InventoryMovement
    products: Product[]
    onUpdateQty: (mv: InventoryMovement, newQty: number) => void
    onDelete: (mv: InventoryMovement) => void
}) {
    const [localQty, setLocalQty] = useState(movement.quantity)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const product = products.find(p => p.id === movement.productId)
    const isDirty = localQty !== movement.quantity

    return (
        <div className="flex flex-col px-4 py-3 gap-2">
            <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#E4ECF7] truncate">
                        {product?.name ?? 'Producto eliminado'}
                    </p>
                    {product && (
                        <p className="text-[11px] text-[#3D506A] mt-0.5">
                            Stock actual: {product.stockQty}
                        </p>
                    )}
                </div>

                {/* Qty stepper — local state only */}
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => localQty > 1 && setLocalQty(q => q - 1)}
                        className={`w-7 h-7 rounded-lg bg-[#1C2438] border border-[#283A56] text-[#E4ECF7] flex items-center justify-center transition-all ${localQty > 1 ? 'hover:bg-[#243050] cursor-pointer' : 'opacity-30 cursor-not-allowed'}`}
                    >
                        <Minus size={11} />
                    </button>
                    <span className={`w-8 text-center text-[14px] font-bold ${isDirty ? 'text-orange-400' : 'text-emerald-400'}`}>
                        +{localQty}
                    </span>
                    <button
                        onClick={() => setLocalQty(q => q + 1)}
                        className="w-7 h-7 rounded-lg bg-[#1C2438] border border-[#283A56] text-[#E4ECF7] flex items-center justify-center hover:bg-[#243050] transition-all cursor-pointer"
                    >
                        <Plus size={11} />
                    </button>
                </div>

                {/* Delete */}
                {confirmingDelete ? (
                    <div className="flex gap-1 shrink-0">
                        <button
                            onClick={() => setConfirmingDelete(false)}
                            className="h-7 px-2 rounded-lg text-[11px] text-[#7A8FAA] bg-[#1C2438] border border-[#283A56] cursor-pointer hover:bg-[#243050]"
                        >
                            No
                        </button>
                        <button
                            onClick={() => { onDelete(movement); setConfirmingDelete(false) }}
                            className="h-7 px-2 rounded-lg text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20"
                        >
                            Sí
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setConfirmingDelete(true)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer shrink-0"
                    >
                        <Trash2 size={13} />
                    </button>
                )}
            </div>

            {/* Confirm qty change */}
            {isDirty && (
                <div className="flex items-center gap-2 pl-0">
                    <span className="text-[11px] text-orange-400 flex-1">
                        Cambio pendiente: +{movement.quantity} → +{localQty}
                    </span>
                    <button
                        onClick={() => setLocalQty(movement.quantity)}
                        className="h-6 px-2 rounded-md text-[11px] text-[#7A8FAA] bg-[#1C2438] border border-[#283A56] cursor-pointer hover:bg-[#243050]"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onUpdateQty(movement, localQty)}
                        className="h-6 px-2 rounded-md text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20"
                    >
                        Confirmar
                    </button>
                </div>
            )}
        </div>
    )
}
