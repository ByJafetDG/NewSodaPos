import { useState } from 'react'
import {
    Users, Search, Plus, Edit3, Trash2, UserCircle2,
    Phone, Mail, ChevronLeft, CheckCircle2, Receipt, Banknote,
} from 'lucide-react'
import { Button } from '@/components/atoms/Button'
import { EmptyState } from '@/components/atoms/EmptyState'
import { ClientFormModal } from '@/components/modals/ClientFormModal'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { SaleDetailModal } from '@/components/modals/SaleDetailModal'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import {
    useClients, useCreateClient, useUpdateClient, useDeleteClient,
    useCreditSales, useSettleSale, useSettleClientSales,
} from '@/hooks/useClients'
import { cn, formatCurrency, normalizeStr } from '@/lib/utils'
import type { Client, ClientType, Sale } from '@/types'

const TYPE_LABELS: Record<ClientType, string> = {
    TRABAJADOR: 'Trabajador',
    ASOCIACION: 'Asociación',
    GENERAL: 'General',
}

const TYPE_FILTER_OPTIONS = ['TODOS', 'TRABAJADOR', 'ASOCIACION', 'GENERAL'] as const
type TypeFilter = typeof TYPE_FILTER_OPTIONS[number]

const TYPE_BADGE: Record<ClientType, string> = {
    TRABAJADOR: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    ASOCIACION: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    GENERAL: 'bg-[#1C2438] text-[#7A8FAA] border-[#1E2A40]',
}

function statCount(clients: Client[], type?: ClientType) {
    return type ? clients.filter(c => c.type === type && c.isActive).length : clients.filter(c => c.isActive).length
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function BalancesPage() {
    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('TODOS')
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

    const [formOpen, setFormOpen] = useState(false)
    const [editingClient, setEditingClient] = useState<Client | null>(null)
    const [deletingClient, setDeletingClient] = useState<Client | null>(null)

    const { data: clients = [] } = useClients()
    const { data: allCreditSales = [] } = useCreditSales()
    const createClient = useCreateClient()
    const updateClient = useUpdateClient()
    const deleteClient = useDeleteClient()
    const settleSale = useSettleSale()
    const settleClientSales = useSettleClientSales()

    const searchKb = useKeyboardInput(search, setSearch, { mode: 'alpha' })

    const filtered = clients.filter(c => {
        const q = normalizeStr(search)
        const matchSearch = !search ||
            normalizeStr(c.name).includes(q) ||
            normalizeStr(c.code ?? '').includes(q) ||
            (c.phone ?? '').includes(search) ||
            normalizeStr(c.email ?? '').includes(q)
        const matchType = typeFilter === 'TODOS' || c.type === typeFilter
        return matchSearch && matchType
    })

    function pendingSalesFor(clientId: string): Sale[] {
        return allCreditSales.filter((s: Sale) => s.clientId === clientId)
    }

    function pendingTotalFor(clientId: string) {
        return pendingSalesFor(clientId).reduce((sum, s) => sum + s.total, 0)
    }

    async function handleSettleAll(clientIds: string[]) {
        for (const id of clientIds) await settleClientSales.mutateAsync(id)
    }

    async function handleSettleSale(saleId: string) {
        await settleSale.mutateAsync(saleId)
    }

    function handleNew() { setEditingClient(null); setFormOpen(true) }
    function handleEdit(client: Client) { setEditingClient(client); setFormOpen(true) }

    async function handleFormConfirm(data: Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) {
        if (editingClient) {
            await updateClient.mutateAsync({ id: editingClient.id, input: data })
        } else {
            await createClient.mutateAsync(data)
        }
        setFormOpen(false); setEditingClient(null)
    }

    async function handleToggle(client: Client) {
        await updateClient.mutateAsync({ id: client.id, input: { isActive: !client.isActive } })
    }

    async function handleDeleteConfirm() {
        if (!deletingClient) return
        await deleteClient.mutateAsync(deletingClient.id)
        setDeletingClient(null)
    }

    // Navigate to client detail
    const selectedClient = clients.find(c => c.id === selectedClientId) ?? null
    if (selectedClient) {
        return (
            <>
                <ClientDetailView
                    client={selectedClient}
                    sales={pendingSalesFor(selectedClient.id)}
                    onBack={() => setSelectedClientId(null)}
                    onSettle={handleSettleSale}
                    onSettleAll={() => handleSettleAll([selectedClient.id])}
                />
            </>
        )
    }

    // Asociación clients
    const asociacionIds = clients.filter(c => c.type === 'ASOCIACION' && c.isActive).map(c => c.id)
    const asociacionPendingTotal = asociacionIds.reduce((sum, id) => sum + pendingTotalFor(id), 0)
    const hasAsociacionPending = asociacionPendingTotal > 0

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10">
                        <Users size={18} className="text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E4ECF7]">Clientes</h1>
                        <p className="text-[12px] text-[#3D506A]">Saldos y créditos</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {hasAsociacionPending && (
                        <button
                            onClick={() => handleSettleAll(asociacionIds)}
                            disabled={settleClientSales.isPending}
                            className="flex items-center gap-2 px-4 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[13px] font-semibold hover:bg-amber-500/25 transition-colors cursor-pointer disabled:opacity-60"
                        >
                            <CheckCircle2 size={14} />
                            Saldar Asociación — {formatCurrency(asociacionPendingTotal)}
                        </button>
                    )}
                    <Button variant="primary" size="sm" onClick={handleNew} className="gap-1.5">
                        <Plus size={14} />
                        Nuevo cliente
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-[#192030] shrink-0">
                {([
                    { label: 'Total activos', value: statCount(clients), color: 'text-violet-400', bg: 'bg-violet-500/10' },
                    { label: 'Trabajadores', value: statCount(clients, 'TRABAJADOR'), color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    { label: 'Asociación', value: statCount(clients, 'ASOCIACION'), color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    { label: 'Generales', value: statCount(clients, 'GENERAL'), color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                ] as const).map(stat => (
                    <div key={stat.label} className={cn('rounded-xl p-3', stat.bg)}>
                        <p className={cn('text-[22px] font-bold', stat.color)}>{stat.value}</p>
                        <p className="text-[11px] text-[#3D506A] mt-0.5">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Search + filter */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-[#192030] shrink-0">
                <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none" />
                    <input
                        type="text"
                        {...searchKb}
                        placeholder="Buscar por nombre, teléfono o correo..."
                        className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
                    />
                </div>
                <div className="flex items-center gap-1">
                    {TYPE_FILTER_OPTIONS.map(opt => (
                        <button
                            key={opt}
                            onClick={() => setTypeFilter(opt)}
                            className={cn(
                                'px-3 h-8 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
                                typeFilter === opt
                                    ? 'bg-violet-500/15 text-violet-400'
                                    : 'text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#1C2438]'
                            )}
                        >
                            {opt === 'TODOS' ? 'Todos' : TYPE_LABELS[opt as ClientType]}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                    <EmptyState
                        icon={<Users size={28} className="text-violet-400" />}
                        title={search || typeFilter !== 'TODOS' ? 'Sin resultados' : 'Sin clientes'}
                        description={search || typeFilter !== 'TODOS' ? 'Prueba con otro filtro' : 'Crea el primer cliente con el botón de arriba'}
                    />
                ) : (
                    <table className="w-full">
                        <thead className="sticky top-0 bg-[#0B0E19]/95 backdrop-blur-sm z-10">
                            <tr className="border-b border-[#192030]">
                                <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] px-6 py-3">Cliente</th>
                                <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] px-4 py-3">Código</th>
                                <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] px-4 py-3">Tipo</th>
                                <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] px-4 py-3">Contacto</th>
                                <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] px-4 py-3">Saldo pendiente</th>
                                <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] px-4 py-3">Estado</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#192030]">
                            {filtered.map(client => {
                                const pending = pendingTotalFor(client.id)
                                const pendingCount = pendingSalesFor(client.id).length
                                return (
                                    <ClientRow
                                        key={client.id}
                                        client={client}
                                        pendingTotal={pending}
                                        pendingCount={pendingCount}
                                        onSelect={() => setSelectedClientId(client.id)}
                                        onEdit={() => handleEdit(client)}
                                        onDelete={() => setDeletingClient(client)}
                                        onToggle={() => handleToggle(client)}
                                    />
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modals */}
            <ClientFormModal
                isOpen={formOpen}
                onClose={() => { setFormOpen(false); setEditingClient(null) }}
                onConfirm={handleFormConfirm}
                client={editingClient}
                isPending={createClient.isPending || updateClient.isPending}
            />
            <DeleteConfirmModal
                isOpen={deletingClient !== null}
                onClose={() => setDeletingClient(null)}
                onConfirm={handleDeleteConfirm}
                title="Eliminar cliente"
                description={`¿Eliminar a "${deletingClient?.name}"? Esta acción no se puede deshacer.`}
                isPending={deleteClient.isPending}
            />
        </div>
    )
}

// ─── Client list row ──────────────────────────────────────────────────────────

function ClientRow({ client, pendingTotal, pendingCount, onSelect, onEdit, onDelete, onToggle }: {
    client: Client
    pendingTotal: number
    pendingCount: number
    onSelect: () => void
    onEdit: () => void
    onDelete: () => void
    onToggle: () => void
}) {
    return (
        <tr
            onClick={onSelect}
            className={cn('group transition-colors cursor-pointer', client.isActive ? 'hover:bg-[#0F1624]' : 'opacity-50 hover:bg-[#0F1624]')}
        >
            <td className="px-6 py-3">
                <div className="flex items-center gap-2.5">
                    <UserCircle2 size={18} className="text-[#3D506A] shrink-0" />
                    <p className="text-[13px] font-medium text-[#E4ECF7]">{client.name}</p>
                </div>
            </td>
            <td className="px-4 py-3">
                {client.code
                    ? <span className="text-[12px] font-mono font-medium text-[#7A8FAA] bg-[#1C2438] px-2 py-0.5 rounded-md">{client.code}</span>
                    : <span className="text-[12px] text-[#3D506A]">—</span>
                }
            </td>
            <td className="px-4 py-3">
                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border', TYPE_BADGE[client.type])}>
                    {TYPE_LABELS[client.type]}
                </span>
            </td>
            <td className="px-4 py-3">
                <div className="space-y-0.5">
                    {client.phone && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                            <Phone size={10} className="text-[#3D506A]" />{client.phone}
                        </div>
                    )}
                    {client.email && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                            <Mail size={10} className="text-[#3D506A]" />{client.email}
                        </div>
                    )}
                    {!client.phone && !client.email && <span className="text-[12px] text-[#3D506A]">—</span>}
                </div>
            </td>
            <td className="px-4 py-3">
                {pendingCount > 0 ? (
                    <div>
                        <p className="text-[13px] font-semibold text-red-400">{formatCurrency(pendingTotal)}</p>
                        <p className="text-[11px] text-[#3D506A]">{pendingCount} cuenta{pendingCount !== 1 ? 's' : ''}</p>
                    </div>
                ) : (
                    <span className="text-[12px] text-emerald-400 font-medium">Al día</span>
                )}
            </td>
            <td className="px-4 py-3">
                <button
                    onClick={e => { e.stopPropagation(); onToggle() }}
                    className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer',
                        client.isActive ? 'bg-violet-500' : 'bg-[#1C2438]'
                    )}
                >
                    <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', client.isActive ? 'translate-x-4.5' : 'translate-x-0.5')} />
                </button>
            </td>
            <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                    <button
                        onClick={e => { e.stopPropagation(); onEdit() }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-[#3D506A] hover:text-violet-400 hover:bg-violet-500/10 transition-colors cursor-pointer"
                    >
                        <Edit3 size={13} />
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); onDelete() }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            </td>
        </tr>
    )
}

// ─── Client detail view ───────────────────────────────────────────────────────

function ClientDetailView({ client, sales, onBack, onSettle, onSettleAll }: {
    client: Client
    sales: Sale[]
    onBack: () => void
    onSettle: (id: string) => void
    onSettleAll: () => void
}) {
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null)

    const total = sales.reduce((sum, s) => sum + s.total, 0)
    const isAsociacion = client.type === 'ASOCIACION'

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 transition-all cursor-pointer"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2.5">
                        <UserCircle2 size={20} className="text-violet-400" />
                        <div>
                            <h1 className="text-[16px] font-semibold text-[#E4ECF7]">{client.name}</h1>
                            <p className="text-[12px] text-[#3D506A]">{TYPE_LABELS[client.type]}</p>
                        </div>
                    </div>
                </div>
                {sales.length > 0 && (
                    <div className="flex items-center gap-2">
                        <div className="text-right mr-2">
                            <p className="text-[12px] text-[#3D506A]">Total pendiente</p>
                            <p className="text-[18px] font-bold text-red-400">{formatCurrency(total)}</p>
                        </div>
                        <button
                            onClick={onSettleAll}
                            className={cn(
                                'flex items-center gap-2 px-4 h-9 rounded-xl text-[13px] font-semibold border transition-colors cursor-pointer',
                                isAsociacion
                                    ? 'bg-amber-500/15 border-amber-500/25 text-amber-400 hover:bg-amber-500/25'
                                    : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25'
                            )}
                        >
                            <CheckCircle2 size={14} />
                            {isAsociacion ? 'Saldar Asociación' : 'Saldar todo'}
                        </button>
                    </div>
                )}
            </div>

            {/* Sales list */}
            <div className="flex-1 overflow-y-auto p-6">
                {sales.length === 0 ? (
                    <EmptyState
                        icon={<CheckCircle2 size={28} className="text-emerald-400" />}
                        title="Sin cuentas pendientes"
                        description="Este cliente no tiene deudas activas"
                    />
                ) : (
                    <div className="space-y-2">
                        {sales.map(s => {
                            const sDate = s.date instanceof Date ? s.date : new Date(s.date)
                            const dateStr = sDate.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
                            const itemCount = s.items?.length ?? 0
                            return (
                                <div
                                    key={s.id}
                                    onClick={() => setSelectedSale(s)}
                                    className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-[#0F1623] border border-[#192030] hover:bg-[#141C2E] hover:border-violet-500/20 transition-all cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1C2438]">
                                            <Receipt size={14} className="text-[#3D506A]" />
                                        </div>
                                        <div>
                                            <p className="text-[13px] font-semibold text-[#E4ECF7]">Cuenta #{s.saleNumber}</p>
                                            <p className="text-[11px] text-[#3D506A]">{dateStr} · {itemCount} producto{itemCount !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <p className="text-[14px] font-bold text-[#E4ECF7]">{formatCurrency(s.total)}</p>
                                        <button
                                            onClick={e => { e.stopPropagation(); onSettle(s.id) }}
                                            className="flex items-center gap-1.5 px-3 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/20 transition-colors cursor-pointer"
                                        >
                                            <Banknote size={12} />
                                            Saldar
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Sale detail modal */}
            <SaleDetailModal
                isOpen={selectedSale !== null}
                onClose={() => setSelectedSale(null)}
                sale={selectedSale}
            />
        </div>
    )
}
