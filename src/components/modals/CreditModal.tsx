import { useState } from 'react'
import { Search, UserCircle2, Check } from 'lucide-react'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { TotalsPanel } from '@/components/molecules/TotalsPanel'
import { cn, formatCurrency, normalizeStr } from '@/lib/utils'
import type { Client } from '@/types'

interface CreditModalProps {
    isOpen: boolean
    onClose: () => void
    total: number
    subtotal: number
    discount: number
    itemCount: number
    clients: Client[]
    selectedClientId: string | null
    onSelectClient: (id: string) => void
    onConfirm: () => void
    isPending: boolean
}

const TYPE_LABEL: Record<string, string> = {
    TRABAJADOR: 'Trabajador', ASOCIACION: 'Asociación', GENERAL: 'General',
}

export function CreditModal({ isOpen, onClose, total, subtotal, discount, itemCount, clients, selectedClientId, onSelectClient, onConfirm, isPending }: CreditModalProps) {
    const [search, setSearch] = useState('')
    const searchKb = useKeyboardInput(search, setSearch)

    const filtered = clients.filter(c =>
        c.isActive && (
            !search || normalizeStr(c.name).includes(normalizeStr(search))
        )
    )

    const selected = clients.find(c => c.id === selectedClientId)

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="Venta a crédito" description="Selecciona el cliente" width="max-w-lg">
            <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A]" />
                    <input
                        type="text"
                        placeholder="Buscar cliente..."
                        {...searchKb}
                        className="w-full h-10 pl-9 pr-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/50"
                        autoFocus
                    />
                </div>

                {/* Client list */}
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {filtered.map(client => {
                        const isSelected = selectedClientId === client.id
                        return (
                            <button
                                key={client.id}
                                onClick={() => { useKeyboardStore.getState().close(); onSelectClient(client.id) }}
                                className={cn(
                                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left',
                                    isSelected
                                        ? 'bg-violet-500/10 border-violet-500/30'
                                        : 'bg-[#101520] border-[#192030] hover:bg-[#161D2E]'
                                )}
                            >
                                <UserCircle2 size={16} className={isSelected ? 'text-violet-400' : 'text-[#3D506A]'} />
                                <div className="flex-1 min-w-0">
                                    <p className={cn('text-[13px] font-medium truncate', isSelected ? 'text-[#E4ECF7]' : 'text-[#7A8FAA]')}>{client.name}</p>
                                    <p className="text-[11px] text-[#3D506A]">{TYPE_LABEL[client.type]}{client.notes ? ` · ${client.notes}` : ''}</p>
                                </div>
                                {isSelected && <Check size={14} className="text-violet-400 shrink-0" />}
                            </button>
                        )
                    })}
                </div>

                {/* Summary */}
                <div className="bg-[#101520] rounded-xl border border-[#192030] p-4">
                    <TotalsPanel itemCount={itemCount} subtotal={subtotal} discount={discount} total={total} />
                </div>

                <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={!selectedClientId || isPending}
                    loading={isPending}
                    onClick={onConfirm}
                >
                    {selected ? `Cargar a ${selected.name} — ${formatCurrency(total)}` : 'Selecciona un cliente'}
                </Button>
            </div>
        </BaseModal>
    )
}
