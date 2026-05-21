import { useState } from 'react'
import { ArrowDownToLine, History } from 'lucide-react'
import { Badge } from '@/components/atoms/Badge'
import { EmptyState } from '@/components/atoms/EmptyState'
import { crDateStr, crTime } from '@/lib/utils'
import type { InventoryMovement, Product } from '@/types'

interface MovementBatch {
    reference: string
    date: Date
    type: InventoryMovement['type']
    movements: InventoryMovement[]
}

interface MovementsPanelProps {
    movements: InventoryMovement[]
    products: Product[]
    onOpenBatch: (batch: MovementBatch) => void
}

function groupMovements(movements: InventoryMovement[]): MovementBatch[] {
    const map = new Map<string, MovementBatch>()
    for (const mv of movements) {
        const key = mv.reference ?? mv.id
        if (!map.has(key)) {
            const rawDate = mv.date as any
            let date: Date
            if (typeof rawDate === 'string') {
                const s = (rawDate as string).replace(' ', 'T')
                date = new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z')
            } else {
                date = rawDate as Date
            }
            map.set(key, { reference: key, date, type: mv.type, movements: [] })
        }
        map.get(key)!.movements.push(mv)
    }
    return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime())
}

const typeLabel: Record<InventoryMovement['type'], string> = {
    ENTRADA: 'Entrada',
    SALIDA: 'Salida',
    AJUSTE: 'Ajuste',
    VENTA: 'Venta',
}

const typeVariant: Record<InventoryMovement['type'], 'success' | 'danger' | 'warning' | 'default'> = {
    ENTRADA: 'success',
    SALIDA: 'danger',
    AJUSTE: 'warning',
    VENTA: 'default',
}

export function MovementsPanel({ movements, products, onOpenBatch }: MovementsPanelProps) {
    const batches = groupMovements(movements)

    if (batches.length === 0) {
        return (
            <EmptyState
                icon={<History size={32} />}
                title="Sin movimientos"
                description="Los ingresos y ajustes aparecerán aquí"
            />
        )
    }

    return (
        <div className="flex-1 overflow-y-auto">
            <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-10 bg-[#0B0E19]">
                    <tr className="border-b border-[#192030]">
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Fecha</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Tipo</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Productos</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Unidades</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Nota</th>
                    </tr>
                </thead>
                <tbody>
                    {batches.map(batch => {
                        const totalUnits = batch.movements.reduce((s, m) => s + m.quantity, 0)
                        const note = batch.movements[0]?.notes
                        return (
                            <tr
                                key={batch.reference}
                                onClick={() => onOpenBatch(batch)}
                                className="border-b border-[#0F1523] hover:bg-[#101828]/60 cursor-pointer transition-colors"
                            >
                                <td className="px-4 py-3">
                                    <p className="text-[13px] text-[#E4ECF7]">
                                        {crDateStr(batch.date)}
                                    </p>
                                    <p className="text-[11px] text-[#3D506A] mt-0.5">
                                        {crTime(batch.date)}
                                    </p>
                                </td>
                                <td className="px-3 py-3">
                                    <Badge variant={typeVariant[batch.type]}>
                                        <ArrowDownToLine size={10} />
                                        {typeLabel[batch.type]}
                                    </Badge>
                                </td>
                                <td className="px-3 py-3 text-center">
                                    <span className="text-[#E4ECF7] font-medium">{batch.movements.length}</span>
                                </td>
                                <td className="px-3 py-3 text-center">
                                    <span className="text-emerald-400 font-bold font-mono">+{totalUnits}</span>
                                </td>
                                <td className="px-3 py-3 text-[#7A8FAA] truncate max-w-[180px]">
                                    {note ?? <span className="text-[#283A56]">—</span>}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

export type { MovementBatch }
