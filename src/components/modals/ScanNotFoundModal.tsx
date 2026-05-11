import { ScanLine, Plus } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'

interface ScanNotFoundModalProps {
    isOpen: boolean
    onClose: () => void
    barcode: string
    onCreateProduct: () => void
}

export function ScanNotFoundModal({ isOpen, onClose, barcode, onCreateProduct }: ScanNotFoundModalProps) {
    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="Producto no encontrado" width="max-w-sm">
            <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#101520] border border-[#1E2A40]">
                    <ScanLine size={16} className="text-[#3D506A] shrink-0" />
                    <div>
                        <p className="text-[10px] text-[#3D506A] uppercase tracking-widest mb-0.5">Código escaneado</p>
                        <p className="text-[14px] text-[#E4ECF7] font-mono font-medium">{barcode}</p>
                    </div>
                </div>

                <p className="text-[13px] text-[#7A8FAA]">
                    No existe ningún producto con ese código. ¿Deseas crearlo ahora?
                </p>

                <div className="flex gap-2">
                    <Button variant="ghost" size="md" className="flex-1" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button variant="primary" size="md" className="flex-1 gap-1.5" onClick={onCreateProduct}>
                        <Plus size={14} />
                        Crear producto
                    </Button>
                </div>
            </div>
        </BaseModal>
    )
}
