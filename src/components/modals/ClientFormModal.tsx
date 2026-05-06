import { useState, useEffect } from 'react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { cn } from '@/lib/utils'
import type { Client, ClientType } from '@/types'

interface ClientFormModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (data: Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => void
    client?: Client | null
    isPending?: boolean
}

const TYPES: ClientType[] = ['TRABAJADOR', 'ASOCIACION', 'GENERAL']
const TYPE_LABELS: Record<ClientType, string> = {
    TRABAJADOR: 'Trabajador',
    ASOCIACION: 'Asociación',
    GENERAL: 'General',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">{children}</p>
}

function TextInput({ value, onChange, placeholder, mode = 'alpha' }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    mode?: 'alpha' | 'numeric'
}) {
    const kb = useKeyboardInput(value, onChange, { mode })
    return (
        <input
            type="text"
            {...kb}
            placeholder={placeholder}
            className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
        />
    )
}

export function ClientFormModal({ isOpen, onClose, onConfirm, client, isPending }: ClientFormModalProps) {
    const [name, setName] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [code, setCode] = useState('')
    const [type, setType] = useState<ClientType>('GENERAL')
    const [company, setCompany] = useState('')
    const [notes, setNotes] = useState('')
    const [isActive, setIsActive] = useState(true)

    useEffect(() => {
        if (isOpen) {
            if (client) {
                setName(client.name)
                setPhone(client.phone ?? '')
                setEmail(client.email ?? '')
                setCode(client.code ?? '')
                setType(client.type)
                setCompany(client.company ?? '')
                setNotes(client.notes ?? '')
                setIsActive(client.isActive)
            } else {
                setName(''); setPhone(''); setEmail(''); setCode('')
                setType('GENERAL'); setCompany(''); setNotes('')
                setIsActive(true)
            }
        }
    }, [isOpen, client])

    const isValid = name.trim().length > 0

    function handleConfirm() {
        if (!isValid || isPending) return
        onConfirm({
            name: name.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            code: code.trim() || null,
            type,
            company: type === 'ASOCIACION' ? (company.trim() || null) : null,
            notes: notes.trim() || null,
            isActive,
        })
    }

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={client ? 'Editar cliente' : 'Nuevo cliente'}
            width="max-w-lg"
        >
            <div className="space-y-4">
                {/* Name */}
                <div>
                    <FieldLabel>Nombre *</FieldLabel>
                    <TextInput value={name} onChange={setName} placeholder="Nombre del cliente" />
                </div>

                {/* Type */}
                <div>
                    <FieldLabel>Tipo *</FieldLabel>
                    <div className="flex gap-2">
                        {TYPES.map(t => (
                            <button
                                key={t}
                                onClick={() => setType(t)}
                                className={cn(
                                    'flex-1 h-10 rounded-xl text-[12px] font-medium border transition-all cursor-pointer',
                                    type === t
                                        ? 'bg-violet-500/15 border-violet-500/30 text-violet-400'
                                        : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#1C2438]'
                                )}
                            >
                                {TYPE_LABELS[t]}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Phone + Email */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <FieldLabel>Teléfono</FieldLabel>
                        <TextInput value={phone} onChange={setPhone} placeholder="8888-0000" mode="numeric" />
                    </div>
                    <div>
                        <FieldLabel>Correo</FieldLabel>
                        <TextInput value={email} onChange={setEmail} placeholder="correo@ejemplo.com" />
                    </div>
                </div>

                {/* Code */}
                <div>
                    <FieldLabel>Código</FieldLabel>
                    <TextInput value={code} onChange={setCode} placeholder="Ej: EMP-001" />
                </div>


                {/* Notes */}
                <div>
                    <FieldLabel>Notas</FieldLabel>
                    <TextInput value={notes} onChange={setNotes} placeholder="Observaciones opcionales" />
                </div>

                {/* Active toggle */}
                <button
                    onClick={() => setIsActive(!isActive)}
                    className={cn(
                        'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left',
                        isActive
                            ? 'bg-violet-500/8 border-violet-500/20'
                            : 'bg-[#101520] border-[#1E2A40]'
                    )}
                >
                    <div>
                        <p className={cn('text-[12px] font-semibold', isActive ? 'text-violet-400' : 'text-[#E4ECF7]')}>Cliente activo</p>
                        <p className="text-[11px] text-[#3D506A]">Visible al seleccionar crédito</p>
                    </div>
                    <div className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                        isActive ? 'bg-violet-500' : 'bg-[#1C2438]'
                    )}>
                        <span className={cn(
                            'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                            isActive ? 'translate-x-4.5' : 'translate-x-0.5'
                        )} />
                    </div>
                </button>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={onClose} className="flex-1">
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        onClick={handleConfirm}
                        disabled={!isValid}
                        loading={isPending}
                        className="flex-1"
                    >
                        {client ? 'Guardar cambios' : 'Crear cliente'}
                    </Button>
                </div>
            </div>
        </BaseModal>
    )
}
