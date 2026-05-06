import { AlertTriangle } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'

interface DeleteConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title?: string
    description?: string
    isPending?: boolean
}

export function DeleteConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirmar eliminación',
    description = '¿Estás seguro? Esta acción no se puede deshacer.',
    isPending,
}: DeleteConfirmModalProps) {
    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title={title} width="max-w-sm">
            <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                    <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[13px] text-[#CBD5E1] leading-relaxed">{description}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" size="md" onClick={onClose} className="flex-1">
                        Cancelar
                    </Button>
                    <Button variant="danger" size="md" onClick={onConfirm} loading={isPending} className="flex-1">
                        Eliminar
                    </Button>
                </div>
            </div>
        </BaseModal>
    )
}
