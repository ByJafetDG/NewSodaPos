import { ShoppingBag } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { formatCurrency } from '@/lib/utils'
import type { Sale } from '@/types'

interface SaleDetailModalProps {
    isOpen: boolean
    onClose: () => void
    sale: Sale | null
}

export function SaleDetailModal({ isOpen, onClose, sale }: SaleDetailModalProps) {
    if (!sale) return null

    const dateStr = sale.date.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Consumo #${sale.saleNumber}`}
            description={dateStr}
            width="max-w-md"
        >
            <div className="space-y-3">
                {/* Items */}
                <div className="space-y-1.5">
                    {sale.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#101520] border border-[#192030]">
                            <div className="flex items-center gap-2.5">
                                <ShoppingBag size={13} className="text-[#3D506A] shrink-0" />
                                <div>
                                    <p className="text-[13px] text-[#E4ECF7] font-medium">{item.product?.name ?? item.productId}</p>
                                    <p className="text-[11px] text-[#3D506A]">{formatCurrency(item.unitPrice)} × {item.quantity}</p>
                                </div>
                            </div>
                            <p className="text-[13px] font-semibold text-[#E4ECF7]">{formatCurrency(item.subtotal)}</p>
                        </div>
                    ))}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-violet-500/8 border border-violet-500/20">
                    <p className="text-[13px] font-semibold text-[#7A8FAA]">Total de la cuenta</p>
                    <p className="text-[16px] font-bold text-violet-400">{formatCurrency(sale.total)}</p>
                </div>
            </div>
        </BaseModal>
    )
}
