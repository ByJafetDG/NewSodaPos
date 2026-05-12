import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'

interface DeleteConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title?: string
    description?: string
    isPending?: boolean
    confirmLabel?: string
    confirmVariant?: 'danger' | 'success' | 'primary'
}

export function DeleteConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirmar eliminación',
    description = '¿Estás seguro? Esta acción no se puede deshacer.',
    isPending,
    confirmLabel,
    confirmVariant = 'danger',
}: DeleteConfirmModalProps) {
    const isSuccess = confirmVariant === 'success'
    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title={title} width="max-w-sm">
            <div className="space-y-4">
                <div className={`flex items-start gap-3 p-3 rounded-xl border ${isSuccess ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
                    {isSuccess
                        ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                        : <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                    }
                    <p className="text-[13px] text-[#CBD5E1] leading-relaxed">{description}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" size="md" onClick={onClose} className="flex-1">
                        Cancelar
                    </Button>
                    <Button variant={confirmVariant} size="md" onClick={onConfirm} loading={isPending} className="flex-1">
                        {confirmLabel ?? (confirmVariant === 'danger' ? 'Eliminar' : 'Confirmar')}
                    </Button>
                </div>
            </div>
        </BaseModal>
    )
}
