import { BaseModal } from './BaseModal'
import { NumericPad } from '@/components/molecules/NumericPad'
import { Button } from '@/components/atoms/Button'
import { formatCurrency } from '@/lib/utils'
import type { CartItem } from '@/types'

interface PriceEditModalProps {
    isOpen: boolean
    onClose: () => void
    editingId: string | null
    value: string
    onChange: (v: string) => void
    onConfirm: () => void
    items: CartItem[]
}

export function PriceEditModal({ isOpen, onClose, editingId, value, onChange, onConfirm, items }: PriceEditModalProps) {
    const item = items.find(i => i.id === editingId)
    const newPrice = parseFloat(value) || 0

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="Editar precio" description={item?.product.name} width="max-w-xs">
            <div className="space-y-4">
                {/* Current vs new */}
                <div className="flex items-center gap-3 justify-center text-center">
                    <div>
                        <p className="text-[10px] text-[#3D506A] uppercase tracking-wider">Original</p>
                        <p className="text-[16px] font-bold text-[#7A8FAA] font-mono">{formatCurrency(item?.unitPrice ?? 0)}</p>
                    </div>
                    <span className="text-[#3D506A]">→</span>
                    <div>
                        <p className="text-[10px] text-orange-400/70 uppercase tracking-wider">Nuevo</p>
                        <p className="text-[22px] font-bold text-orange-400 font-mono">{value ? formatCurrency(newPrice) : '—'}</p>
                    </div>
                </div>

                <NumericPad value={value} onChange={onChange} />

                <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={!value || newPrice <= 0}
                    onClick={onConfirm}
                >
                    Confirmar precio
                </Button>
            </div>
        </BaseModal>
    )
}
