import { useState, useEffect } from 'react'
import { User, ChefHat, Crown, Clock } from 'lucide-react'
import { BaseModal } from '@/components/modals/BaseModal'
import { Button } from '@/components/atoms/Button'
import { cn } from '@/lib/utils'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useCreateEmployee, useUpdateEmployee } from '@/hooks/useEmployees'
import type { Employee, EmployeeRole } from '@/types'

interface Props {
    isOpen: boolean
    onClose: () => void
    editing?: Employee | null
}

const ROLES: { value: EmployeeRole; label: string; icon: React.ElementType; color: string; bg: string }[] = [
    { value: 'CAJERO',   label: 'Cajero',   icon: User,    color: 'text-violet-400', bg: 'bg-violet-500/15 border-violet-500/30' },
    { value: 'DUEÑO',    label: 'Dueño',    icon: Crown,   color: 'text-amber-400',  bg: 'bg-amber-500/15 border-amber-500/30' },
    { value: 'COCINERO', label: 'Cocinero', icon: ChefHat, color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' },
    { value: 'TEMPORAL', label: 'Temporal', icon: Clock,   color: 'text-slate-400',  bg: 'bg-slate-500/15 border-slate-500/30' },
]

const INACTIVE = 'bg-[#101520] border-[#1E2A40] text-[#3D506A]'

export function EmployeeFormModal({ isOpen, onClose, editing }: Props) {
    const createEmployee = useCreateEmployee()
    const updateEmployee = useUpdateEmployee()

    const [name, setName] = useState('')
    const [role, setRole] = useState<EmployeeRole>('CAJERO')
    const [activeFrom, setActiveFrom] = useState('')
    const [activeTo, setActiveTo] = useState('')

    const nameKb = useKeyboardInput(name, setName, { mode: 'alpha' })

    useEffect(() => {
        if (isOpen) {
            if (editing) {
                setName(editing.name)
                setRole(editing.role)
                setActiveFrom(editing.activeFrom ?? '')
                setActiveTo(editing.activeTo ?? '')
            } else {
                setName('')
                setRole('CAJERO')
                setActiveFrom('')
                setActiveTo('')
            }
        }
    }, [isOpen, editing])

    const isEdit = !!editing
    const isPending = createEmployee.isPending || updateEmployee.isPending
    const canSubmit = name.trim().length > 0 && (role !== 'TEMPORAL' || (!!activeFrom && !!activeTo))

    async function handleSubmit() {
        if (!canSubmit) return
        const payload = {
            name: name.trim(),
            role,
            activeFrom: role === 'TEMPORAL' ? activeFrom : null,
            activeTo: role === 'TEMPORAL' ? activeTo : null,
        }
        if (isEdit) {
            await updateEmployee.mutateAsync({ id: editing!.id, updates: payload })
        } else {
            await createEmployee.mutateAsync(payload)
        }
        onClose()
    }

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={isEdit ? 'Editar Empleado' : 'Nuevo Empleado'}
            width="max-w-sm"
        >
            <div className="space-y-5">
                {/* Name */}
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">Nombre</p>
                    <input
                        type="text"
                        {...nameKb}
                        placeholder="Nombre completo..."
                        className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
                    />
                </div>

                {/* Role */}
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">Rol</p>
                    <div className="grid grid-cols-2 gap-2">
                        {ROLES.map(r => {
                            const Icon = r.icon
                            const active = role === r.value
                            return (
                                <button
                                    key={r.value}
                                    onClick={() => setRole(r.value)}
                                    className={cn(
                                        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left',
                                        active ? r.bg : INACTIVE
                                    )}
                                >
                                    <Icon size={15} className={active ? r.color : 'text-[#3D506A]'} />
                                    <span className={cn('text-[13px] font-medium', active ? r.color : 'text-[#3D506A]')}>
                                        {r.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Temporal date range */}
                {role === 'TEMPORAL' && (
                    <div className="space-y-3 p-3 rounded-xl bg-slate-500/5 border border-slate-500/15">
                        <p className="text-[11px] text-[#3D506A]">
                            El empleado se desactivará automáticamente al vencer la fecha final.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">Desde</p>
                                <input
                                    type="date"
                                    value={activeFrom}
                                    onChange={e => setActiveFrom(e.target.value)}
                                    className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] outline-none focus:border-slate-500/40 transition-colors"
                                />
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">Hasta</p>
                                <input
                                    type="date"
                                    value={activeTo}
                                    min={activeFrom}
                                    onChange={e => setActiveTo(e.target.value)}
                                    className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] outline-none focus:border-slate-500/40 transition-colors"
                                />
                            </div>
                        </div>
                    </div>
                )}

                <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={handleSubmit}
                    disabled={!canSubmit || isPending}
                >
                    {isEdit ? 'Guardar cambios' : 'Agregar empleado'}
                </Button>
            </div>
        </BaseModal>
    )
}
