import { UserCircle2, Trophy } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { cn } from '@/lib/utils'
import type { Employee } from '@/types'

interface CashierModalProps {
    isOpen: boolean
    onClose: () => void
    employees: Employee[]
    selected: Employee | null
    onSelect: (emp: Employee) => void
}

const ROLE_LABEL: Record<string, string> = {
    CAJERO: 'Cajero', ADMIN: 'Admin', COCINERO: 'Cocinero',
}

export function CashierModal({ isOpen, onClose, employees, selected, onSelect }: CashierModalProps) {
    const active = employees.filter(e => e.isActive)

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="¿Quién atiende?" description="Selecciona el cajero activo">
            <div className="space-y-2">
                {active.map(emp => {
                    const isSelected = selected?.id === emp.id
                    return (
                        <button
                            key={emp.id}
                            onClick={() => { onSelect(emp); onClose() }}
                            className={cn(
                                'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer',
                                isSelected
                                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                                    : 'bg-[#101520] border-[#192030] text-[#7A8FAA] hover:bg-[#161D2E]'
                            )}
                        >
                            <div className={cn(
                                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                                isSelected ? 'bg-orange-500/15' : 'bg-[#1C2438]'
                            )}>
                                <UserCircle2 size={18} />
                            </div>
                            <div className="flex-1 text-left">
                                <p className={cn('text-[14px] font-semibold', isSelected ? 'text-[#E4ECF7]' : '')}>{emp.name}</p>
                                <p className="text-[11px] text-[#3D506A]">{ROLE_LABEL[emp.role]}</p>
                            </div>
                            {(emp.monthlySales ?? 0) > 0 && (
                                <div className="flex items-center gap-1 text-[11px] text-amber-400">
                                    <Trophy size={12} />
                                    {emp.monthlySales}
                                </div>
                            )}
                        </button>
                    )
                })}
            </div>

            {selected && (
                <div className="mt-4 pt-4 border-t border-[#192030]">
                    <Button variant="ghost" size="sm" className="text-[#3D506A]" onClick={() => { onSelect(null as unknown as Employee); onClose() }}>
                        Continuar sin cajero
                    </Button>
                </div>
            )}
        </BaseModal>
    )
}
