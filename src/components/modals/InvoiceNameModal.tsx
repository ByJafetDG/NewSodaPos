import React, { useState, useEffect, useMemo } from 'react'
import { UserCircle2, Search, Check, Plus, X, Building2 } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '../atoms/Button'
import { cn, normalizeStr, fuzzyMatch } from '@/lib/utils'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import type { Client, Company } from '@/types'

interface InvoiceNameModalProps {
    isOpen: boolean
    onClose: () => void
    onAccept: (data: { name: string; cedula: string; email: string; ccEmails?: string[]; existingId?: string }) => void
    clients: Client[]
    companies?: Company[]
    initialData?: { name: string; cedula: string; email: string; existingId?: string } | null
}

// Own component so each instance calls useKeyboardInput at component level (not in a loop)
function CcEmailInput({ value, onChange, onRemove }: {
    value: string
    onChange: (v: string) => void
    onRemove: () => void
}) {
    const kb = useKeyboardInput(value, onChange, { mode: 'alpha' })
    return (
        <div className="flex gap-2 items-center">
            <input
                type="text"
                {...kb}
                placeholder="correo adicional (CC)..."
                className="flex-1 h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
            />
            <button
                type="button"
                onClick={onRemove}
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-[#101520] border border-[#1E2A40] text-[#3D506A] hover:text-red-400 hover:border-red-500/30 transition-colors cursor-pointer"
            >
                <X size={13} />
            </button>
        </div>
    )
}

export function InvoiceNameModal({ isOpen, onClose, onAccept, clients, companies = [], initialData }: InvoiceNameModalProps) {
    const [name, setName] = useState(initialData?.name ?? '')
    const [cedula, setCedula] = useState(initialData?.cedula ?? '')
    const [email, setEmail] = useState(initialData?.email ?? '')
    const [ccEmails, setCcEmails] = useState<string[]>([])
    const [selectedId, setSelectedId] = useState<string | undefined>(initialData?.existingId)
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>()
    const [rightTab, setRightTab] = useState<'clientes' | 'empresas'>('clientes')

    useEffect(() => {
        if (!isOpen) return
        useKeyboardStore.getState().close()
        setName(initialData?.name ?? '')
        setCedula(initialData?.cedula ?? '')
        setEmail(initialData?.email ?? '')
        setCcEmails([])
        setSelectedId(initialData?.existingId)
        setSelectedCompanyId(undefined)
        setRightTab('clientes')
    }, [isOpen])

    const nameKb = useKeyboardInput(name, (v) => {
        setName(v)
        if (selectedId) setSelectedId(undefined)
        if (selectedCompanyId) setSelectedCompanyId(undefined)
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

    const activeCompanies = useMemo(() => companies.filter(c => c.isActive), [companies])

    function handleSelectClient(c: Client) {
        setName(c.name)
        setCedula(c.cedula || '')
        setEmail(c.email || '')
        setSelectedId(c.id)
        setSelectedCompanyId(undefined)
        useKeyboardStore.getState().close()
    }

    function handleSelectCompany(co: Company) {
        setName(co.name)
        setCedula('')
        setEmail(co.billingEmail || '')
        setSelectedCompanyId(co.id)
        setSelectedId(undefined)
        useKeyboardStore.getState().close()
    }

    function handleClear() {
        setName(''); setCedula(''); setEmail(''); setCcEmails([])
        setSelectedId(undefined); setSelectedCompanyId(undefined)
    }

    function handleClose() { useKeyboardStore.getState().close(); onClose() }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim()) return
        const validCc = ccEmails.map(s => s.trim()).filter(Boolean)
        onAccept({
            name: name.trim(),
            cedula: cedula.trim(),
            email: email.trim(),
            ccEmails: validCc.length > 0 ? validCc : undefined,
            existingId: selectedId,
        })
        useKeyboardStore.getState().close()
        onClose()
    }

    const inputClass = "w-full h-11 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
    const labelClass = "text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]"

    return (
        <BaseModal isOpen={isOpen} onClose={handleClose} title="Facturar a nombre de..." width="max-w-3xl">
            <div className="flex flex-col md:flex-row gap-0 p-1" style={{ maxHeight: 'calc(80vh - 80px)' }}>

                {/* Left Side: Form */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 pr-6">
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-1">
                        <div className="space-y-1.5">
                            <label className={labelClass}>Nombre Completo</label>
                            <input
                                type="text"
                                {...nameKb}
                                placeholder="Ej: Juan Pérez o Empresa S.A."
                                autoFocus
                                className={inputClass}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className={labelClass}>Cédula / RUC (Opcional)</label>
                            <input type="text" {...cedulaKb} placeholder="1-1234-5678" className={inputClass} />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className={labelClass}>Correo Principal (Opcional)</label>
                                <button
                                    type="button"
                                    onClick={() => setCcEmails(prev => [...prev, ''])}
                                    className="flex items-center gap-1 text-[10px] text-[#3D506A] hover:text-violet-400 transition-colors cursor-pointer"
                                >
                                    <Plus size={10} />
                                    Agregar CC
                                </button>
                            </div>
                            <input type="text" {...emailKb} placeholder="correo@ejemplo.com" className={inputClass} />

                            {ccEmails.length > 0 && (
                                <div className="space-y-2 pt-1">
                                    <p className="text-[10px] text-[#3D506A] uppercase tracking-wider font-semibold">Copia a (CC)</p>
                                    {ccEmails.map((cc, i) => (
                                        <CcEmailInput
                                            key={i}
                                            value={cc}
                                            onChange={v => setCcEmails(prev => prev.map((e, idx) => idx === i ? v : e))}
                                            onRemove={() => setCcEmails(prev => prev.filter((_, idx) => idx !== i))}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3 shrink-0 border-t border-[#192030]">
                        <Button type="button" variant="secondary" onClick={handleClear} className="flex-1 h-12">
                            Limpiar
                        </Button>
                        <Button type="submit" variant="primary" disabled={!name.trim()} className="flex-1 h-12">
                            Confirmar
                        </Button>
                    </div>
                </form>

                {/* Divider */}
                <div className="border-l border-[#192030] mx-0 shrink-0" />

                {/* Right Side */}
                <div className="w-full md:w-72 flex flex-col pl-6 min-h-0">
                    {/* Tabs */}
                    <div className="flex gap-1 p-1 rounded-xl bg-[#101520] border border-[#192030] mb-4 shrink-0">
                        <button
                            type="button"
                            onClick={() => setRightTab('clientes')}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-semibold transition-all cursor-pointer',
                                rightTab === 'clientes' ? 'bg-[#1E2A40] text-[#E4ECF7]' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                            )}
                        >
                            <UserCircle2 size={11} />
                            Clientes
                        </button>
                        {activeCompanies.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setRightTab('empresas')}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-semibold transition-all cursor-pointer',
                                    rightTab === 'empresas' ? 'bg-[#1E2A40] text-[#E4ECF7]' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                                )}
                            >
                                <Building2 size={11} />
                                Empresas
                            </button>
                        )}
                    </div>

                    <div className="flex items-center justify-between mb-3 shrink-0">
                        <p className={labelClass}>
                            {rightTab === 'clientes' ? 'Clientes existentes' : 'Empresas registradas'}
                        </p>
                        <Search size={14} className="text-[#3D506A]" />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                        {rightTab === 'clientes' && (
                            filteredClients.length > 0 ? filteredClients.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => handleSelectClient(c)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group",
                                        selectedId === c.id
                                            ? "bg-violet-500/10 border-violet-500/40"
                                            : "bg-[#101520] border-[#1E2A40] hover:bg-[#161D2E] hover:border-[#2A3B5A]"
                                    )}
                                >
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
                                        selectedId === c.id ? "bg-violet-500/20" : "bg-[#161D2E] group-hover:bg-[#1C263D]"
                                    )}>
                                        <UserCircle2 size={16} className={selectedId === c.id ? "text-violet-400" : "text-[#7A8FAA]"} />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className={cn("text-[13px] font-semibold truncate", selectedId === c.id ? "text-violet-300" : "text-[#E4ECF7]")}>
                                            {c.name}
                                        </p>
                                        <p className="text-[10px] text-[#3D506A] truncate">
                                            {c.cedula || c.code || 'Sin cédula'}
                                        </p>
                                    </div>
                                    {selectedId === c.id && <Check size={14} className="shrink-0 text-violet-400" />}
                                </button>
                            )) : (
                                <div className="flex flex-col items-center justify-center py-8 text-[#3D506A]">
                                    <UserCircle2 size={32} className="opacity-20 mb-2" />
                                    <p className="text-[11px] text-center">No se encontraron clientes</p>
                                </div>
                            )
                        )}

                        {rightTab === 'empresas' && (
                            activeCompanies.length > 0 ? activeCompanies.map(co => (
                                <button
                                    key={co.id}
                                    type="button"
                                    onClick={() => handleSelectCompany(co)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group",
                                        selectedCompanyId === co.id
                                            ? "bg-orange-500/10 border-orange-500/40"
                                            : "bg-[#101520] border-[#1E2A40] hover:bg-[#161D2E] hover:border-[#2A3B5A]"
                                    )}
                                >
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
                                        selectedCompanyId === co.id ? "bg-orange-500/20" : "bg-[#161D2E] group-hover:bg-[#1C263D]"
                                    )}>
                                        <Building2 size={16} className={selectedCompanyId === co.id ? "text-orange-400" : "text-[#7A8FAA]"} />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className={cn("text-[13px] font-semibold truncate", selectedCompanyId === co.id ? "text-orange-300" : "text-[#E4ECF7]")}>
                                            {co.name}
                                        </p>
                                        <p className="text-[10px] text-[#3D506A] truncate">
                                            {co.billingEmail || 'Sin correo de facturación'}
                                        </p>
                                    </div>
                                    {selectedCompanyId === co.id && <Check size={14} className="shrink-0 text-orange-400" />}
                                </button>
                            )) : (
                                <div className="flex flex-col items-center justify-center py-8 text-[#3D506A]">
                                    <Building2 size={32} className="opacity-20 mb-2" />
                                    <p className="text-[11px] text-center">Sin empresas registradas</p>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </BaseModal>
    )
}
