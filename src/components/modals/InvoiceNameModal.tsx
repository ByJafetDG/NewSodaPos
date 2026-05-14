import React, { useState, useEffect, useMemo } from 'react'
import { UserCircle2, Search, Check } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '../atoms/Button'
import { cn, normalizeStr, fuzzyMatch } from '@/lib/utils'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import type { Client } from '@/types'

interface InvoiceNameModalProps {
    isOpen: boolean
    onClose: () => void
    onAccept: (data: { name: string; cedula: string; email: string; existingId?: string }) => void
    clients: Client[]
    initialData?: { name: string; cedula: string; email: string; existingId?: string } | null
}

export function InvoiceNameModal({ isOpen, onClose, onAccept, clients, initialData }: InvoiceNameModalProps) {
    const [name, setName] = useState(initialData?.name ?? '')
    const [cedula, setCedula] = useState(initialData?.cedula ?? '')
    const [email, setEmail] = useState(initialData?.email ?? '')
    const [selectedId, setSelectedId] = useState<string | undefined>(initialData?.existingId)

    useEffect(() => {
        if (!isOpen) return
        useKeyboardStore.getState().close()
        setName(initialData?.name ?? '')
        setCedula(initialData?.cedula ?? '')
        setEmail(initialData?.email ?? '')
        setSelectedId(initialData?.existingId)
    }, [isOpen])

    const nameKb = useKeyboardInput(name, (v) => {
        setName(v)
        if (selectedId) setSelectedId(undefined)
    }, { mode: 'alpha' })
    const cedulaKb = useKeyboardInput(cedula, setCedula, { mode: 'alpha' })
    const emailKb = useKeyboardInput(email, setEmail, { mode: 'alpha' })

    const filteredClients = useMemo(() => {
        if (!name.trim()) return clients.slice(0, 10)
        return clients
            .filter(c =>
                normalizeStr(c.name).includes(normalizeStr(name)) ||
                fuzzyMatch(name, c.name) ||
                (c.cedula && c.cedula.includes(name)) ||
                (c.code && c.code.includes(name))
            )
            .slice(0, 15)
    }, [name, clients])

    const handleSelectClient = (c: Client) => {
        setName(c.name)
        setCedula(c.cedula || '')
        setEmail(c.email || '')
        setSelectedId(c.id)
        useKeyboardStore.getState().close()
    }

    const handleClear = () => {
        setName('')
        setCedula('')
        setEmail('')
        setSelectedId(undefined)
    }

    const handleClose = () => {
        useKeyboardStore.getState().close()
        onClose()
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
        onAccept({ name: name.trim(), cedula: cedula.trim(), email: email.trim(), existingId: selectedId })
        useKeyboardStore.getState().close()
        onClose()
    }

    const inputClass = "w-full h-11 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
    const labelClass = "text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]"

    return (
        <BaseModal isOpen={isOpen} onClose={handleClose} title="Facturar a nombre de..." width="max-w-3xl">
            <div className="flex flex-col md:flex-row gap-6 p-1">
                {/* Left Side: Form */}
                <form onSubmit={handleSubmit} className="flex-1 space-y-4">
                    <div className="space-y-1.5">
                        <label className={labelClass}>Nombre Completo</label>
                        <input
                            type="text"
                            {...nameKb}
                            placeholder="Ej: Juan Pérez..."
                            autoFocus
                            className={inputClass}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className={labelClass}>Cédula (Opcional)</label>
                        <input type="text" {...cedulaKb} placeholder="1-1234-5678" className={inputClass} />
                    </div>

                    <div className="space-y-1.5">
                        <label className={labelClass}>Correo (Opcional)</label>
                        <input
                            type="text"
                            {...emailKb}
                            placeholder="cliente@ejemplo.com"
                            className={inputClass}
                        />
                    </div>

                    <div className="pt-2 flex gap-3">
                        <Button type="button" variant="secondary" onClick={handleClear} className="flex-1 h-12">
                            Limpiar
                        </Button>
                        <Button type="submit" variant="primary" disabled={!name.trim()} className="flex-1 h-12">
                            Confirmar
                        </Button>
                    </div>
                </form>

                {/* Right Side: Quick Selection */}
                <div className="w-full md:w-72 flex flex-col border-l border-[#192030] pl-6">
                    <div className="flex items-center justify-between mb-4">
                        <p className={labelClass}>Clientes Existentes</p>
                        <Search size={14} className="text-[#3D506A]" />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[300px]">
                        {filteredClients.length > 0 ? (
                            filteredClients.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => handleSelectClient(c)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group",
                                        selectedId === c.id
                                            ? "bg-violet-500/10 border-violet-500/40"
                                            : "bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#161D2E] hover:border-[#2A3B5A]"
                                    )}
                                >
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                        selectedId === c.id ? "bg-violet-500/20" : "bg-[#161D2E] group-hover:bg-[#1C263D]"
                                    )}>
                                        <UserCircle2 size={16} className={selectedId === c.id ? "text-violet-400" : "text-[#7A8FAA]"} />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className={cn(
                                            "text-[13px] font-semibold truncate",
                                            selectedId === c.id ? "text-violet-300" : "text-[#E4ECF7]"
                                        )}>
                                            {c.name}
                                        </p>
                                        <p className="text-[10px] text-[#3D506A] truncate">
                                            {c.cedula || c.code || 'Sin cédula'}
                                        </p>
                                    </div>
                                    {selectedId === c.id && <Check size={14} className="shrink-0 text-violet-400" />}
                                </button>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-[#3D506A]">
                                <UserCircle2 size={32} className="opacity-20 mb-2" />
                                <p className="text-[11px] text-center">No se encontraron clientes</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </BaseModal>
    )
}
