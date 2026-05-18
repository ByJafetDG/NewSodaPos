import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
    Users, Search, Plus, Edit3, Trash2, UserCircle2,
    Phone, Mail, ChevronLeft, CheckCircle2, Receipt, Banknote,
    Check, ChevronDown, CreditCard, History, IdCard,
    Building2, X, Pencil, Send, FileDown, ChevronRight, Printer,
    Smartphone, Banknote as BanknoteIcon, ArrowLeft, Landmark,
} from 'lucide-react'
import { Button } from '@/components/atoms/Button'
import { EmptyState } from '@/components/atoms/EmptyState'
import { ClientFormModal } from '@/components/modals/ClientFormModal'
import { CompanyFormModal } from '@/components/modals/CompanyFormModal'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { BaseModal } from '@/components/modals/BaseModal'
import { SaleDetailModal } from '@/components/modals/SaleDetailModal'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import {
    useClients, useCreateClient, useUpdateClient, useDeleteClient,
    useCreditSales, useSettleSale, useSettleSaleDirect, useSettleClientSales, useSalesByClient,
    useDeleteCreditSale, useConvertCreditPayment,
    useCompanies, useCreateCompany, useUpdateCompany, useDeleteCompany,
    useAllCompanySales, useCompanySales,
} from '@/hooks/useClients'
import { useActiveRegister } from '@/hooks/useCashRegister'
import { getSaleItemsForCart, getSaleDetails } from '@/services/sales'
import { deleteCreditSale, settleSaleDirect } from '@/services/clients'
import { sendCompanyStatementPDFEmail } from '@/services/emailReceipt'
import { generateCompanyStatementPDF } from '@/services/generateCompanyPDF'
import { usePendingSaleLoadStore } from '@/store/pendingSaleLoadStore'
import { cn, formatCurrency, normalizeStr } from '@/lib/utils'
import { usePendingSettleStore } from '@/store/pendingSettleStore'
import { useUIStore } from '@/store/uiStore'
import { useBusinessConfig } from '@/hooks/useConfig'
import { sendSettledEmail } from '@/services/emailReceipt'
import { toast } from '@/components/ui/Toast'
import type { Client, ClientType, Company, Sale } from '@/types'

function parseMixedNotes(notes: string | null | undefined): { ef?: number; sinpe?: number; cuenta: number } | null {
    if (!notes) return null
    const idx = notes.indexOf('||MIXED||')
    if (idx === -1) return null
    try { return JSON.parse(notes.slice(idx + 9)) } catch { return null }
}

const SETTLE_METHOD_LABEL: Record<string, string> = {
    EFECTIVO: 'Efectivo', SINPE: 'SINPE', DEPOSITO: 'Depósito',
    TARJETA: 'Tarjeta', TRANSFERENCIA: 'Trans.',
}

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
    const [mainTab, setMainTab] = useState<'clientes' | 'empresas'>('clientes')
    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('TODOS')
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)

    const [formOpen, setFormOpen] = useState(false)
    const [editingClient, setEditingClient] = useState<Client | null>(null)
    const [deletingClient, setDeletingClient] = useState<Client | null>(null)
    const [confirmSettleAsociacion, setConfirmSettleAsociacion] = useState(false)

    const [companyFormOpen, setCompanyFormOpen] = useState(false)
    const [editingCompany, setEditingCompany] = useState<Company | null>(null)
    const [deletingCompany, setDeletingCompany] = useState<Company | null>(null)


    const { data: clients = [] } = useClients()
    const { data: companies = [] } = useCompanies()
    const { data: allCreditSales = [] } = useCreditSales()
    const { data: allCompanySales = [] } = useAllCompanySales()
    const { data: config } = useBusinessConfig()
    const createClient = useCreateClient()
    const updateClient = useUpdateClient()
    const deleteClient = useDeleteClient()
    const settleSale = useSettleSale()
    const settleClientSales = useSettleClientSales()
    const createCompany = useCreateCompany()
    const updateCompany = useUpdateCompany()
    const deleteCompany = useDeleteCompany()

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
        const businessName = config?.name ?? ''
        for (const id of clientIds) {
            const client = clients.find(c => c.id === id)
            const sales = pendingSalesFor(id)
            await settleClientSales.mutateAsync(id)
            if (client?.email && sales.length > 0) {
                sendSettledEmail({
                    to: client.email,
                    clientName: client.name,
                    businessName,
                    sales: sales.map(s => ({
                        saleNumber: s.saleNumber,
                        date: s.date instanceof Date ? s.date.toISOString() : String(s.date),
                        items: (s.items ?? []).map((item: any) => ({
                            name: item.product?.name ?? item.name ?? 'Producto',
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            subtotal: item.subtotal,
                        })),
                        subtotal: s.subtotal,
                        discount: s.discount,
                        total: s.total,
                    })),
                }).catch(() => {})
            }
        }
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

    async function handleCompanyFormConfirm(data: Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) {
        if (editingCompany) {
            await updateCompany.mutateAsync({ id: editingCompany.id, input: data })
        } else {
            await createCompany.mutateAsync(data)
        }
        setCompanyFormOpen(false); setEditingCompany(null)
    }

    async function handleDeleteCompanyConfirm() {
        if (!deletingCompany) return
        await deleteCompany.mutateAsync(deletingCompany.id)
        setDeletingCompany(null)
    }

    // Navigate to client detail
    const selectedClient = clients.find(c => c.id === selectedClientId) ?? null
    if (selectedClient) {
        return (
            <>
                <ClientDetailView
                    client={selectedClient}
                    onBack={() => setSelectedClientId(null)}
                    onEdit={() => handleEdit(selectedClient)}
                />
                <ClientFormModal
                    isOpen={formOpen}
                    onClose={() => { setFormOpen(false); setEditingClient(null) }}
                    onConfirm={handleFormConfirm}
                    client={editingClient}
                    isPending={createClient.isPending || updateClient.isPending}
                />
            </>
        )
    }

    const selectedCompany = companies.find(c => c.id === selectedCompanyId) ?? null
    if (selectedCompany) {
        return (
            <>
                <CompanyDetailView
                    company={selectedCompany}
                    onBack={() => setSelectedCompanyId(null)}
                    onEdit={() => { setEditingCompany(selectedCompany); setCompanyFormOpen(true) }}
                />
                <CompanyFormModal
                    isOpen={companyFormOpen}
                    onClose={() => { setCompanyFormOpen(false); setEditingCompany(null) }}
                    onConfirm={handleCompanyFormConfirm}
                    company={editingCompany}
                    isPending={createCompany.isPending || updateCompany.isPending}
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
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10">
                            <Users size={18} className="text-violet-400" />
                        </div>
                        <div>
                            <h1 className="text-[16px] font-semibold text-[#E4ECF7]">Clientes</h1>
                            <p className="text-[12px] text-[#3D506A]">Saldos y créditos</p>
                        </div>
                    </div>
                    {/* Main tabs */}
                    <div className="flex gap-1 p-1 rounded-xl bg-[#101520] border border-[#192030]">
                        <button
                            onClick={() => setMainTab('clientes')}
                            className={cn('flex items-center gap-1.5 px-3 h-7 rounded-lg text-[12px] font-semibold transition-all cursor-pointer', mainTab === 'clientes' ? 'bg-[#1E2A40] text-[#E4ECF7]' : 'text-[#3D506A] hover:text-[#7A8FAA]')}
                        >
                            <Users size={12} />
                            Clientes
                        </button>
                        <button
                            onClick={() => setMainTab('empresas')}
                            className={cn('flex items-center gap-1.5 px-3 h-7 rounded-lg text-[12px] font-semibold transition-all cursor-pointer', mainTab === 'empresas' ? 'bg-[#1E2A40] text-[#E4ECF7]' : 'text-[#3D506A] hover:text-[#7A8FAA]')}
                        >
                            <Building2 size={12} />
                            Empresas
                            {companies.length > 0 && <span className="bg-orange-500/20 text-orange-400 text-[10px] px-1.5 rounded-full">{companies.length}</span>}
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {mainTab === 'clientes' && hasAsociacionPending && (
                        <button
                            onClick={() => setConfirmSettleAsociacion(true)}
                            disabled={settleClientSales.isPending}
                            className="flex items-center gap-2 px-4 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-[13px] font-semibold hover:bg-amber-500/25 transition-colors cursor-pointer disabled:opacity-60"
                        >
                            <CheckCircle2 size={14} />
                            Saldar Asociación — {formatCurrency(asociacionPendingTotal)}
                        </button>
                    )}
                    {mainTab === 'clientes' && (
                        <Button variant="primary" size="sm" onClick={handleNew} className="gap-1.5">
                            <Plus size={14} />
                            Nuevo cliente
                        </Button>
                    )}
                    {mainTab === 'empresas' && (
                        <Button variant="primary" size="sm" onClick={() => { setEditingCompany(null); setCompanyFormOpen(true) }} className="gap-1.5">
                            <Plus size={14} />
                            Nueva empresa
                        </Button>
                    )}
                </div>
            </div>

            {/* ── EMPRESAS TAB ─────────────────────────────────────────── */}
            {mainTab === 'empresas' && (
                <div className="flex-1 overflow-y-auto">
                    {companies.length === 0 ? (
                        <EmptyState
                            icon={<Building2 size={28} className="text-orange-400" />}
                            title="Sin empresas"
                            description="Crea la primera empresa con el botón de arriba"
                        />
                    ) : (
                        <div className="p-6 space-y-3">
                            {companies.map(co => {
                                const coSales = allCompanySales.filter((s: any) => s.companyId === co.id)
                                const debt = coSales.filter((s: any) => s.isCredit && !s.paidAt).reduce((sum: number, s: any) => sum + s.total, 0)
                                const invoiceCount = coSales.filter((s: any) => s.status !== 'ANULADA').length
                                return (
                                    <div
                                        key={co.id}
                                        onClick={() => setSelectedCompanyId(co.id)}
                                        className="flex items-center gap-4 px-5 py-4 rounded-xl bg-[#0F1623] border border-[#192030] hover:bg-[#141C2E] hover:border-[#283A56] transition-all cursor-pointer"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center shrink-0">
                                            <Building2 size={18} className="text-orange-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[14px] font-semibold text-[#E4ECF7] truncate">{co.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[11px] text-[#3D506A]">{invoiceCount} factura{invoiceCount !== 1 ? 's' : ''}</span>
                                                {co.billingEmail && <span className="text-[11px] text-[#3D506A]">· {co.billingEmail}</span>}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            {debt > 0 ? (
                                                <>
                                                    <p className="text-[15px] font-bold text-red-400">{formatCurrency(debt)}</p>
                                                    <p className="text-[11px] text-[#3D506A]">deuda pendiente</p>
                                                </>
                                            ) : (
                                                <span className="text-[13px] font-medium text-emerald-400">Al día</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={e => { e.stopPropagation(); setEditingCompany(co); setCompanyFormOpen(true) }}
                                                className="w-7 h-7 rounded-lg text-orange-400 bg-orange-500/10 flex items-center justify-center cursor-pointer"
                                            >
                                                <Edit3 size={13} />
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); setDeletingCompany(co) }}
                                                className="w-7 h-7 rounded-lg text-red-400 bg-red-500/10 flex items-center justify-center cursor-pointer"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── CLIENTES TAB ─────────────────────────────────────────── */}
            {mainTab === 'clientes' && <>

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

            </>}

            {/* Modals */}
            <ClientFormModal
                isOpen={formOpen}
                onClose={() => { setFormOpen(false); setEditingClient(null) }}
                onConfirm={handleFormConfirm}
                client={editingClient}
                isPending={createClient.isPending || updateClient.isPending}
            />
            <CompanyFormModal
                isOpen={companyFormOpen}
                onClose={() => { setCompanyFormOpen(false); setEditingCompany(null) }}
                onConfirm={handleCompanyFormConfirm}
                company={editingCompany}
                isPending={createCompany.isPending || updateCompany.isPending}
            />
            <DeleteConfirmModal
                isOpen={deletingCompany !== null}
                onClose={() => setDeletingCompany(null)}
                onConfirm={handleDeleteCompanyConfirm}
                title="Eliminar empresa"
                description={`¿Eliminar "${deletingCompany?.name}"? Los colaboradores quedarán sin empresa asignada.`}
                isPending={deleteCompany.isPending}
            />
            <DeleteConfirmModal
                isOpen={deletingClient !== null}
                onClose={() => setDeletingClient(null)}
                onConfirm={handleDeleteConfirm}
                title="Eliminar cliente"
                description={`¿Eliminar a "${deletingClient?.name}"? Esta acción no se puede deshacer.`}
                isPending={deleteClient.isPending}
            />
            <DeleteConfirmModal
                isOpen={confirmSettleAsociacion}
                onClose={() => setConfirmSettleAsociacion(false)}
                onConfirm={async () => {
                    await handleSettleAll(asociacionIds)
                    setConfirmSettleAsociacion(false)
                }}
                title="Saldar Asociación"
                description={`¿Marcar todas las cuentas pendientes de los clientes de Asociación como pagadas? Total: ${formatCurrency(asociacionPendingTotal)}`}
                confirmLabel="Saldar todo"
                confirmVariant="success"
                isPending={settleClientSales.isPending}
            />
        </div>
    )
}

// ─── Company detail view ──────────────────────────────────────────────────────

function CompanyDetailView({ company, onBack, onEdit }: {
    company: Company
    onBack: () => void
    onEdit: () => void
}) {
    const [tab, setTab] = useState<'pending' | 'history'>('pending')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [confirmSettle, setConfirmSettle] = useState<string[] | null>(null)
    const [settleMethod, setSettleMethod] = useState<'EFECTIVO' | 'SINPE' | 'DEPOSITO'>('EFECTIVO')
    const [isSettling, setIsSettling] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [isPrinting, setIsPrinting] = useState(false)
    const [invoiceSearch, setInvoiceSearch] = useState('')
    const [coCompareTarget, setCoCompareTarget] = useState<any | null>(null)
    const [coCompareOriginal, setCoCompareOriginal] = useState<any | null>(null)
    const [coCompareLoading, setCoCompareLoading] = useState(false)

    const { data: sales = [], isLoading } = useCompanySales(company.id)
    const { data: config } = useBusinessConfig()
    const qc = useQueryClient()
    const invoiceSearchKb = useKeyboardInput(invoiceSearch, setInvoiceSearch, { mode: 'alpha' })

    const pendingSales = (sales as any[]).filter(s => s.isCredit && !s.paidAt)
    const nonVoidedCount = (sales as any[]).filter((s: any) => s.status !== 'ANULADA').length
    const pendingDebt = pendingSales.reduce((sum: number, s: any) => sum + s.total, 0)
    const selectedPendingTotal = pendingSales.filter((s: any) => selectedIds.has(s.id)).reduce((sum: number, s: any) => sum + s.total, 0)
    const allPendingSelected = pendingSales.length > 0 && pendingSales.every((s: any) => selectedIds.has(s.id))

    const searchQ = invoiceSearch.trim().toLowerCase()
    function matchesSearch(s: any) {
        if (!searchQ) return true
        if (String(s.saleNumber).includes(searchQ)) return true
        if ((s.consumerName ?? '').toLowerCase().includes(searchQ)) return true
        if ((s.items ?? []).some((it: any) => (it.productName ?? it.product?.name ?? '').toLowerCase().includes(searchQ))) return true
        return false
    }
    const filteredPending = pendingSales.filter(matchesSearch)
    const filteredHistory = (sales as any[]).filter(matchesSearch)

    function toggleExpand(id: string) { setExpandedId(prev => prev === id ? null : id) }
    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }
    function toggleAllPending() {
        if (allPendingSelected) setSelectedIds(new Set())
        else setSelectedIds(new Set(pendingSales.map((s: any) => s.id)))
    }

    async function handleSettle(ids: string[], method: string) {
        setIsSettling(true)
        try {
            for (const id of ids) await settleSaleDirect(id, { paymentMethod: method })
            qc.invalidateQueries({ queryKey: ['company-sales', company.id] })
            qc.invalidateQueries({ queryKey: ['all-company-sales'] })
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            setSelectedIds(new Set())
            setConfirmSettle(null)
            setExpandedId(null)
            toast.success(ids.length === 1 ? 'Factura saldada' : `${ids.length} facturas saldadas`)
        } catch {
            toast.error('Error al saldar')
        } finally {
            setIsSettling(false)
        }
    }

    async function handleSendPDF() {
        if (!company.billingEmail || pendingDebt === 0) return
        setIsSending(true)
        try {
            const groups: Record<string, { name: string; phone: null; pendingTotal: number; pendingCount: number }> = {}
            for (const s of pendingSales) {
                const key = (s as any).consumerName || 'Empresa'
                if (!groups[key]) groups[key] = { name: key, phone: null, pendingTotal: 0, pendingCount: 0 }
                groups[key].pendingTotal += (s as any).total
                groups[key].pendingCount += 1
            }
            const employees = Object.values(groups)
            const pdfBase64 = generateCompanyStatementPDF({
                companyName: company.name,
                businessName: config?.name ?? '',
                employees,
                totalDebt: pendingDebt,
            })
            const res = await sendCompanyStatementPDFEmail({
                to: company.billingEmail,
                companyName: company.name,
                businessName: config?.name ?? '',
                pdfBase64,
                totalDebt: pendingDebt,
                employeeCount: employees.length,
            })
            if (res.success) toast.success('Estado de cuenta enviado a ' + company.billingEmail)
            else toast.error(res.error ?? 'Error al enviar')
        } catch {
            toast.error('Error al generar PDF')
        } finally {
            setIsSending(false)
        }
    }

    async function handlePrint() {
        if (!config?.printerPort || pendingDebt === 0) return
        setIsPrinting(true)
        try {
            const res = await window.electronAPI!.printCompanyStatement(config.printerPort, {
                businessName: config.name,
                address: config.address,
                phone: config.phone,
                currencySymbol: config.currencySymbol,
                showDecimals: config.showDecimals,
                companyName: company.name,
                date: new Date().toISOString(),
                invoices: pendingSales.map((s: any) => ({
                    saleNumber: s.saleNumber,
                    date: s.date,
                    consumerName: s.consumerName ?? null,
                    items: (s.items ?? []).map((it: any) => ({
                        name: it.productName ?? it.product?.name ?? '',
                        quantity: it.quantity,
                        subtotal: it.subtotal,
                    })),
                    total: s.total,
                })),
                totalPending: pendingDebt,
                footer: config.ticketFooter,
            })
            if (res.success) toast.success('Ticket impreso')
            else toast.error(res.error ?? 'Error al imprimir')
        } catch {
            toast.error('Error al imprimir')
        } finally {
            setIsPrinting(false)
        }
    }

    function fmtDate(d: any) {
        try { return new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) }
        catch { return String(d) }
    }

    async function openCoCompare(sale: any) {
        const origId = sale.modifiedFromSaleId
        if (!origId) return
        setCoCompareTarget(sale)
        setCoCompareOriginal(null)
        setCoCompareLoading(true)
        try {
            const orig = await getSaleDetails(origId)
            setCoCompareOriginal(orig)
        } catch {
            toast.error('No se pudo cargar la factura original')
        } finally {
            setCoCompareLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 transition-all cursor-pointer">
                        <ChevronLeft size={18} />
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center shrink-0">
                        <Building2 size={20} className="text-orange-400" />
                    </div>
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E4ECF7]">{company.name}</h1>
                        <p className="text-[11px] text-[#3D506A]">{nonVoidedCount} factura{nonVoidedCount !== 1 ? 's' : ''} · {pendingSales.length} pendiente{pendingSales.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {config?.printerPort && pendingDebt > 0 && (
                        <button
                            onClick={handlePrint}
                            disabled={isPrinting}
                            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] text-[12px] hover:text-[#E4ECF7] hover:border-[#283A56] transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Printer size={12} />
                            {isPrinting ? 'Imprimiendo...' : 'Imprimir'}
                        </button>
                    )}
                    {company.billingEmail && pendingDebt > 0 && (
                        <button
                            onClick={handleSendPDF}
                            disabled={isSending}
                            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] text-[12px] hover:text-orange-400 hover:border-orange-500/30 hover:bg-orange-500/5 transition-all cursor-pointer disabled:opacity-50"
                        >
                            <Send size={12} />
                            {isSending ? 'Enviando...' : 'Enviar PDF'}
                        </button>
                    )}
                    <button onClick={onEdit} className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] text-[12px] hover:text-[#E4ECF7] hover:border-[#283A56] transition-all cursor-pointer">
                        <Edit3 size={13} />
                        Editar
                    </button>
                </div>
            </div>

            {/* Info + balance */}
            <div className="px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 flex flex-col justify-center gap-1.5">
                        {company.billingEmail && (
                            <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                                <Mail size={12} className="text-[#3D506A] shrink-0" />
                                {company.billingEmail}
                            </div>
                        )}
                        {company.phone && (
                            <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                                <Phone size={12} className="text-[#3D506A] shrink-0" />
                                {company.phone}
                            </div>
                        )}
                        {company.notes && (
                            <p className="text-[12px] text-[#7A8FAA] italic">"{company.notes}"</p>
                        )}
                        {!company.billingEmail && !company.phone && !company.notes && (
                            <span className="text-[12px] text-[#3D506A]">Sin datos de contacto</span>
                        )}
                    </div>
                    <div className={cn(
                        'rounded-xl border px-4 py-3 flex flex-col gap-0.5',
                        pendingDebt > 0 ? 'bg-red-500/5 border-red-500/15' : 'bg-emerald-500/5 border-emerald-500/15'
                    )}>
                        <span className={cn('text-[10px] uppercase tracking-wider font-semibold', pendingDebt > 0 ? 'text-red-400/70' : 'text-emerald-400/70')}>
                            {pendingDebt > 0 ? 'Deuda pendiente' : 'Estado'}
                        </span>
                        <span className={cn('text-[20px] font-bold tabular-nums leading-tight', pendingDebt > 0 ? 'text-red-400' : 'text-emerald-400')}>
                            {pendingDebt > 0 ? formatCurrency(pendingDebt) : 'Al día'}
                        </span>
                        {pendingSales.length > 0 && (
                            <span className="text-[11px] text-[#3D506A]">
                                {pendingSales.length} factura{pendingSales.length !== 1 ? 's' : ''} pendiente{pendingSales.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-6 py-2.5 border-b border-[#192030] shrink-0">
                {([
                    { id: 'pending' as const, label: 'Pendientes', count: pendingSales.length },
                    { id: 'history' as const, label: 'Historial completo', count: sales.length },
                ]).map(t => (
                    <button
                        key={t.id}
                        onClick={() => { setTab(t.id); setSelectedIds(new Set()); setExpandedId(null); setInvoiceSearch('') }}
                        className={cn(
                            'flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
                            tab === t.id ? 'bg-orange-500/15 text-orange-400' : 'text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#1C2438]'
                        )}
                    >
                        {t.label}
                        {t.count > 0 && (
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', tab === t.id ? 'bg-orange-500/20 text-orange-300' : 'bg-[#1C2438] text-[#3D506A]')}>
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="px-6 py-2.5 border-b border-[#192030] shrink-0">
                <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none" />
                    <input
                        type="text"
                        {...invoiceSearchKb}
                        placeholder="Buscar por # factura, consumidor o producto..."
                        className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                    />
                    {invoiceSearch && (
                        <button onClick={() => setInvoiceSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3D506A] hover:text-[#7A8FAA] cursor-pointer">
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {/* ── Pendientes ── */}
                {tab === 'pending' && (
                    <div className="p-6 space-y-3">
                        {isLoading ? (
                            <p className="text-center text-[12px] text-[#3D506A] py-12">Cargando...</p>
                        ) : pendingSales.length === 0 ? (
                            <EmptyState
                                icon={<CheckCircle2 size={28} className="text-emerald-400" />}
                                title="Sin facturas pendientes"
                                description="Esta empresa no tiene deudas activas"
                            />
                        ) : (
                            <>
                                {/* Actions bar */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={toggleAllPending}
                                        className={cn(
                                            'flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium border transition-all cursor-pointer',
                                            allPendingSelected
                                                ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                                                : 'bg-[#101828] border-[#1E2A40] text-[#7A8FAA] hover:text-[#E4ECF7]'
                                        )}
                                    >
                                        <div className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center', allPendingSelected ? 'bg-orange-500 border-orange-500' : 'border-[#3D506A]')}>
                                            {allPendingSelected && <Check size={9} className="text-white" />}
                                        </div>
                                        {allPendingSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                    </button>

                                    {selectedIds.size > 0 && (
                                        <>
                                            <span className="text-[12px] text-[#7A8FAA]">
                                                {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''} — <span className="font-semibold text-[#E4ECF7]">{formatCurrency(selectedPendingTotal)}</span>
                                            </span>
                                            <button
                                                onClick={() => setConfirmSettle(Array.from(selectedIds))}
                                                disabled={isSettling}
                                                className="ml-auto flex items-center gap-1.5 px-3 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-semibold hover:bg-emerald-500/20 transition-all cursor-pointer disabled:opacity-60"
                                            >
                                                <CheckCircle2 size={13} />
                                                Saldar seleccionadas
                                            </button>
                                        </>
                                    )}
                                    {selectedIds.size === 0 && (
                                        <button
                                            onClick={() => setConfirmSettle(pendingSales.map((s: any) => s.id))}
                                            disabled={isSettling}
                                            className="ml-auto flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] text-[12px] font-medium hover:text-emerald-400 hover:border-emerald-500/25 hover:bg-emerald-500/8 transition-all cursor-pointer disabled:opacity-60"
                                        >
                                            <CheckCircle2 size={13} />
                                            Saldar todo
                                        </button>
                                    )}
                                </div>

                                {/* Pending sale cards */}
                                {filteredPending.length === 0 && searchQ ? (
                                    <p className="text-center text-[12px] text-[#3D506A] py-8">Sin resultados para "{invoiceSearch}"</p>
                                ) : filteredPending.map((s: any) => {
                                    const isSelected = selectedIds.has(s.id)
                                    const isExpanded = expandedId === s.id
                                    return (
                                        <div
                                            key={s.id}
                                            className={cn(
                                                'rounded-xl border transition-all',
                                                isSelected ? 'bg-orange-500/8 border-orange-500/25' : 'bg-[#0F1623] border-[#192030]'
                                            )}
                                        >
                                            <div className="flex items-center gap-3 p-4">
                                                {/* Checkbox */}
                                                <button
                                                    onClick={() => toggleSelect(s.id)}
                                                    className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer', isSelected ? 'bg-orange-500 border-orange-500' : 'border-[#3D506A] hover:border-orange-500/50')}
                                                >
                                                    {isSelected && <Check size={10} className="text-white" />}
                                                </button>

                                                {/* Main info — clickable to expand */}
                                                <button onClick={() => toggleExpand(s.id)} className="flex-1 flex items-center gap-3 text-left cursor-pointer min-w-0">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-[13px] font-mono font-bold text-[#E4ECF7]">#{s.saleNumber}</span>
                                                            <span className="text-[11px] text-[#3D506A]">{fmtDate(s.date)}</span>
                                                            {s.consumerName && (
                                                                <span className="text-[11px] text-orange-400/80 truncate">· {s.consumerName}</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-[#3D506A] truncate">
                                                            {(s.items ?? []).map((it: any) => `${it.quantity}× ${it.productName ?? it.product?.name ?? 'Producto'}`).join(', ') || 'Sin detalles'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-[15px] font-bold text-[#E4ECF7]">{formatCurrency(s.total)}</p>
                                                    </div>
                                                    <ChevronRight size={14} className={cn('text-[#3D506A] shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                                                </button>
                                            </div>

                                            {/* Expanded detail */}
                                            {isExpanded && (
                                                <div className="px-4 pb-4 border-t border-[#192030] pt-3 space-y-3">
                                                    <div className="space-y-1">
                                                        {(s.items ?? []).map((it: any, i: number) => (
                                                            <div key={i} className="flex items-center justify-between text-[12px]">
                                                                <span className="text-[#7A8FAA]">{it.quantity}× {it.productName ?? it.product?.name ?? 'Producto'}</span>
                                                                <span className="text-[#E4ECF7] font-medium tabular-nums">{formatCurrency(it.subtotal)}</span>
                                                            </div>
                                                        ))}
                                                        {s.discount > 0 && (
                                                            <div className="flex items-center justify-between text-[12px] text-emerald-400">
                                                                <span>Descuento</span>
                                                                <span>-{formatCurrency(s.discount)}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center justify-between text-[13px] font-bold border-t border-[#192030] pt-2 mt-1">
                                                            <span className="text-[#7A8FAA]">Total</span>
                                                            <span className="text-[#E4ECF7]">{formatCurrency(s.total)}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setConfirmSettle([s.id])}
                                                        disabled={isSettling}
                                                        className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-semibold hover:bg-emerald-500/20 transition-all cursor-pointer disabled:opacity-60"
                                                    >
                                                        <CheckCircle2 size={13} />
                                                        Marcar como pagada
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                )}

                {/* ── Historial ── */}
                {tab === 'history' && (
                    <div className="p-6 space-y-2">
                        {isLoading ? (
                            <p className="text-center text-[12px] text-[#3D506A] py-12">Cargando...</p>
                        ) : sales.length === 0 ? (
                            <EmptyState
                                icon={<Receipt size={28} className="text-orange-400/40" />}
                                title="Sin facturas"
                                description="Las facturas emitidas a esta empresa aparecerán aquí"
                            />
                        ) : filteredHistory.length === 0 && searchQ ? (
                            <p className="text-center text-[12px] text-[#3D506A] py-8">Sin resultados para "{invoiceSearch}"</p>
                        ) : filteredHistory.map((s: any) => {
                            const isVoided = s.status === 'ANULADA'
                            const isPending = !isVoided && s.isCredit && !s.paidAt
                            const isExpanded = expandedId === s.id
                            const isModified = !!s.modifiedFromSaleId
                            return (
                                <div
                                    key={s.id}
                                    className={cn(
                                        'rounded-xl border transition-all',
                                        isVoided ? 'bg-[#0A0D14] border-[#131820] opacity-60' : isPending ? 'bg-[#0F1623] border-[#192030]' : 'bg-[#0B1019] border-[#141C28]'
                                    )}
                                >
                                    <button
                                        onClick={() => toggleExpand(s.id)}
                                        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                <span className="text-[13px] font-mono font-bold text-[#E4ECF7]">#{s.saleNumber}</span>
                                                <span className="text-[11px] text-[#3D506A]">{fmtDate(s.date)}</span>
                                                {s.consumerName && <span className="text-[11px] text-orange-400/80">· {s.consumerName}</span>}
                                                {isModified && <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-md">Modificada</span>}
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-[11px] text-[#3D506A] truncate">
                                                    {(s.items ?? []).map((it: any) => `${it.quantity}× ${it.productName ?? it.product?.name ?? 'Producto'}`).join(', ') || 'Sin detalles'}
                                                </p>
                                                {isModified && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); openCoCompare(s) }}
                                                        className="text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors cursor-pointer shrink-0"
                                                    >
                                                        Ver cambios →
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 flex flex-col items-end gap-1">
                                            <p className="text-[14px] font-bold text-[#E4ECF7]">{formatCurrency(s.total)}</p>
                                            <span className={cn('text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded', isVoided ? 'bg-[#1C2438] text-[#3D506A]' : isPending ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400')}>
                                                {isVoided ? 'Anulada' : isPending ? 'Crédito' : SETTLE_METHOD_LABEL[s.paymentMethod] ? `Pagado · ${SETTLE_METHOD_LABEL[s.paymentMethod]}` : 'Pagado'}
                                            </span>
                                        </div>
                                        <ChevronRight size={14} className={cn('text-[#3D506A] shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                                    </button>

                                    {isExpanded && (
                                        <div className="px-4 pb-4 border-t border-[#192030] pt-3 space-y-1">
                                            {(s.items ?? []).map((it: any, i: number) => (
                                                <div key={i} className="flex items-center justify-between text-[12px]">
                                                    <span className="text-[#7A8FAA]">{it.quantity}× {it.productName ?? it.product?.name ?? 'Producto'}</span>
                                                    <span className="text-[#E4ECF7] font-medium tabular-nums">{formatCurrency(it.subtotal)}</span>
                                                </div>
                                            ))}
                                            {s.discount > 0 && (
                                                <div className="flex items-center justify-between text-[12px] text-emerald-400">
                                                    <span>Descuento</span>
                                                    <span>-{formatCurrency(s.discount)}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between text-[13px] font-bold border-t border-[#192030] pt-2 mt-1">
                                                <span className="text-[#7A8FAA]">Total</span>
                                                <span className="text-[#E4ECF7]">{formatCurrency(s.total)}</span>
                                            </div>
                                            {!isPending && s.paidAt && (
                                                <p className="text-[11px] text-[#3D506A] pt-1">Pagado el {fmtDate(s.paidAt)}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Compare modal */}
            <BaseModal
                isOpen={coCompareTarget !== null}
                onClose={() => { setCoCompareTarget(null); setCoCompareOriginal(null) }}
                title={`Cambios · Factura #${coCompareTarget?.saleNumber}`}
                width="max-w-2xl"
            >
                {coCompareLoading ? (
                    <p className="text-center text-[12px] text-[#3D506A] py-8">Cargando factura original...</p>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <p className="text-[11px] text-[#3D506A] uppercase tracking-wider font-semibold">Factura original</p>
                            <div className="rounded-xl bg-[#0F1623] border border-[#192030] p-3 space-y-1">
                                {coCompareOriginal ? (coCompareOriginal.items ?? []).map((it: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[12px]">
                                        <span className="text-[#7A8FAA]">{it.quantity}× {it.product?.name ?? it.productName ?? 'Producto'}</span>
                                        <span className="text-[#E4ECF7] tabular-nums">{formatCurrency(it.subtotal)}</span>
                                    </div>
                                )) : <p className="text-[12px] text-[#3D506A]">No disponible</p>}
                                {(coCompareOriginal?.discount ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-[12px] text-emerald-400 border-t border-[#192030] pt-1">
                                        <span>Descuento</span><span>-{formatCurrency(coCompareOriginal.discount)}</span>
                                    </div>
                                )}
                                {coCompareOriginal && (
                                    <div className="flex items-center justify-between text-[13px] font-bold border-t border-[#192030] pt-2">
                                        <span className="text-[#7A8FAA]">Total</span>
                                        <span className="text-[#E4ECF7] tabular-nums">{formatCurrency(coCompareOriginal.total)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="text-[11px] text-amber-400/70 uppercase tracking-wider font-semibold">Factura modificada</p>
                            <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-3 space-y-1">
                                {(coCompareTarget?.items ?? []).map((it: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[12px]">
                                        <span className="text-[#7A8FAA]">{it.quantity}× {it.productName ?? it.product?.name ?? 'Producto'}</span>
                                        <span className="text-[#E4ECF7] tabular-nums">{formatCurrency(it.subtotal)}</span>
                                    </div>
                                ))}
                                {(coCompareTarget?.discount ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-[12px] text-emerald-400 border-t border-amber-500/15 pt-1">
                                        <span>Descuento</span><span>-{formatCurrency(coCompareTarget?.discount ?? 0)}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between text-[13px] font-bold border-t border-amber-500/15 pt-2">
                                    <span className="text-[#7A8FAA]">Total</span>
                                    <span className={cn('tabular-nums', coCompareOriginal && coCompareTarget && coCompareTarget.total !== coCompareOriginal.total ? 'text-amber-400' : 'text-[#E4ECF7]')}>
                                        {formatCurrency(coCompareTarget?.total ?? 0)}
                                        {coCompareOriginal && coCompareTarget && coCompareTarget.total !== coCompareOriginal.total && (
                                            <span className="text-[11px] ml-1 opacity-70">
                                                ({coCompareTarget.total > coCompareOriginal.total ? '+' : ''}{formatCurrency(coCompareTarget.total - coCompareOriginal.total)})
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </BaseModal>

            {/* Settle payment method modal */}
            <BaseModal
                isOpen={confirmSettle !== null}
                onClose={() => setConfirmSettle(null)}
                title="Método de pago"
                description={`${confirmSettle?.length === 1 ? '1 factura' : `${confirmSettle?.length ?? 0} facturas`} · Total: ${formatCurrency(confirmSettle?.reduce((s, id) => s + ((sales as any[]).find((x: any) => x.id === id)?.total ?? 0), 0) ?? 0)}`}
                width="max-w-sm"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            { id: 'EFECTIVO' as const, label: 'Efectivo',  Icon: Banknote   },
                            { id: 'SINPE'    as const, label: 'SINPE',     Icon: Smartphone },
                            { id: 'DEPOSITO' as const, label: 'Depósito',  Icon: Landmark   },
                        ]).map(({ id, label, Icon }) => (
                            <button
                                key={id}
                                onClick={() => setSettleMethod(id)}
                                className={cn(
                                    'flex flex-col items-center gap-2 py-3 rounded-xl border text-[12px] font-medium transition-all cursor-pointer',
                                    settleMethod === id
                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                        : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:border-[#283A56] hover:text-[#E4ECF7]'
                                )}
                            >
                                <Icon size={18} />
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="md" onClick={() => setConfirmSettle(null)} className="flex-1">
                            Cancelar
                        </Button>
                        <Button
                            variant="success"
                            size="md"
                            loading={isSettling}
                            onClick={() => confirmSettle && handleSettle(confirmSettle, settleMethod)}
                            className="flex-1"
                        >
                            Saldar
                        </Button>
                    </div>
                </div>
            </BaseModal>
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
                    <div>
                        <p className="text-[13px] font-medium text-[#E4ECF7]">{client.name}</p>
                        {client.notes && <p className="text-[11px] text-[#3D506A] truncate max-w-[180px]">{client.notes}</p>}
                    </div>
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
                    {client.cedula && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                            <IdCard size={10} className="text-[#3D506A]" />{client.cedula}
                        </div>
                    )}
                    {!client.phone && !client.email && !client.cedula && <span className="text-[12px] text-[#3D506A]">—</span>}
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

function ClientDetailView({ client, onBack, onEdit }: {
    client: Client
    onBack: () => void
    onEdit: () => void
}) {
    const [tab, setTab] = useState<'pending' | 'history'>('pending')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
    const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null)
    const [confirmSettleSale, setConfirmSettleSale] = useState<Sale | null>(null)
    const [confirmSettleSelected, setConfirmSettleSelected] = useState(false)
    const [confirmSettleAll, setConfirmSettleAll] = useState(false)
    const [editingSale, setEditingSale] = useState<Sale | null>(null)
    const [editStep, setEditStep] = useState<'main' | 'method'>('main')
    const [editingInPOS, setEditingInPOS] = useState(false)
    const [compareTarget, setCompareTarget] = useState<Sale | null>(null)
    const [compareOriginal, setCompareOriginal] = useState<any | null>(null)
    const [compareLoading, setCompareLoading] = useState(false)

    const { data: pendingSales = [] } = useCreditSales(client.id)
    const { data: allSales = [] } = useSalesByClient(client.id)
    const { data: config } = useBusinessConfig()
    const { data: activeRegister } = useActiveRegister()
    const settleSale = useSettleSaleDirect()
    const settleClientSales = useSettleClientSales()
    const deleteCreditSaleHook = useDeleteCreditSale()
    const convertCredit = useConvertCreditPayment()
    const pendingStore = usePendingSettleStore()
    const pendingSaleLoad = usePendingSaleLoadStore()
    const setCurrentPage = useUIStore(s => s.setCurrentPage)

    function toSaleInfo(s: Sale) {
        return {
            saleNumber: s.saleNumber,
            date: s.date instanceof Date ? s.date.toISOString() : String(s.date),
            items: (s.items ?? []).map((item: any) => ({
                name: item.product?.name ?? item.name ?? 'Producto',
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
            })),
            subtotal: s.subtotal,
            discount: s.discount,
            total: s.total,
        }
    }

    const pendingTotal = pendingSales.reduce((s, sale) => s + sale.total, 0)
    const selectedTotal = pendingSales.filter(s => selectedIds.has(s.id)).reduce((s, sale) => s + sale.total, 0)
    const allSelected = pendingSales.length > 0 && selectedIds.size === pendingSales.length

    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }

    function toggleAll() {
        if (allSelected) setSelectedIds(new Set())
        else setSelectedIds(new Set(pendingSales.map(s => s.id)))
    }

    async function handleSettleSingleSale(sale: Sale) {
        await settleSale.mutateAsync(sale.id)
        if (client.email) {
            sendSettledEmail({
                to: client.email,
                clientName: client.name,
                businessName: config?.name ?? '',
                sales: [toSaleInfo(sale)],
            }).catch(() => {})
        }
    }

    async function handleSettleSelected() {
        const salesToSettle = pendingSales.filter((s: Sale) => selectedIds.has(s.id))
        for (const id of selectedIds) await settleSale.mutateAsync(id)
        setSelectedIds(new Set())
        if (client.email && salesToSettle.length > 0) {
            sendSettledEmail({
                to: client.email,
                clientName: client.name,
                businessName: config?.name ?? '',
                sales: salesToSettle.map(toSaleInfo),
            }).catch(() => {})
        }
    }

    async function handleSettleAll() {
        await settleClientSales.mutateAsync(client.id)
        if (client.email && pendingSales.length > 0) {
            sendSettledEmail({
                to: client.email,
                clientName: client.name,
                businessName: config?.name ?? '',
                sales: (pendingSales as Sale[]).map(toSaleInfo),
            }).catch(() => {})
        }
    }

    function handleChargeInPOS() {
        const selectedSales = pendingSales.filter((s: Sale) => selectedIds.has(s.id))
        pendingStore.set(client.id, client.name, Array.from(selectedIds), selectedTotal, selectedSales)
        setCurrentPage('pos')
    }

    function openEditSale(sale: Sale) {
        setEditingSale(sale)
        setEditStep('main')
    }

    function closeEditSale() {
        setEditingSale(null)
        setEditStep('main')
        setEditingInPOS(false)
    }

    async function openCompare(sale: Sale) {
        const origId = (sale as any).modifiedFromSaleId
        if (!origId) return
        setCompareTarget(sale)
        setCompareOriginal(null)
        setCompareLoading(true)
        try {
            const orig = await getSaleDetails(origId)
            setCompareOriginal(orig)
        } catch {
            toast.error('No se pudo cargar la venta original')
        } finally {
            setCompareLoading(false)
        }
    }

    async function handleConvertPayment(method: 'EFECTIVO' | 'SINPE') {
        if (!editingSale) return
        await convertCredit.mutateAsync({
            saleId: editingSale.id,
            method,
            cashRegisterId: activeRegister?.id ?? null,
        })
        toast.success(`Cuenta #${editingSale.saleNumber} convertida a ${method === 'EFECTIVO' ? 'Efectivo' : 'SINPE'}`)
        closeEditSale()
    }

    async function handleEditInPOS() {
        if (!editingSale) return
        setEditingInPOS(true)
        try {
            const items = await getSaleItemsForCart(editingSale.id)
            if (items.length === 0) {
                toast.error('No se pudieron cargar los items de esta cuenta')
                setEditingInPOS(false)
                return
            }
            const snapshot = JSON.stringify({
                saleNumber: editingSale.saleNumber,
                items: items.map(i => ({ name: i.product.name, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
                subtotal: editingSale.subtotal,
                discount: editingSale.discount,
                total: editingSale.total,
            })
            await deleteCreditSale(editingSale.id)
            pendingSaleLoad.set(items, editingSale.discount, editingSale.id, editingSale.saleNumber, client.name, snapshot)
            setCurrentPage('pos')
        } catch (err) {
            toast.error('Error al cargar la cuenta al POS')
            setEditingInPOS(false)
        }
    }

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
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
                            <UserCircle2 size={20} className="text-violet-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-[16px] font-semibold text-[#E4ECF7]">{client.name}</h1>
                                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border uppercase tracking-wide', TYPE_BADGE[client.type])}>
                                    {TYPE_LABELS[client.type]}
                                </span>
                            </div>
                            <p className="text-[11px] text-[#3D506A]">
                                {client.code && <span className="font-mono mr-2">{client.code}</span>}
                                {allSales.length > 0 && `${allSales.length} venta${allSales.length !== 1 ? 's' : ''} en historial`}
                            </p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onEdit}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] text-[12px] hover:text-[#E4ECF7] hover:border-[#283A56] transition-all cursor-pointer"
                >
                    <Edit3 size={13} />
                    Editar
                </button>
            </div>

            {/* Client info card */}
            <div className="px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="grid grid-cols-3 gap-3">
                    {/* Contact */}
                    <div className="col-span-2 flex flex-col gap-2">
                        <div className="flex flex-wrap gap-3">
                            {client.phone && (
                                <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                                    <Phone size={12} className="text-[#3D506A] shrink-0" />
                                    {client.phone}
                                </div>
                            )}
                            {client.email && (
                                <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                                    <Mail size={12} className="text-[#3D506A] shrink-0" />
                                    {client.email}
                                </div>
                            )}
                            {client.cedula && (
                                <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                                    <IdCard size={12} className="text-[#3D506A] shrink-0" />
                                    {client.cedula}
                                </div>
                            )}
                            {!client.phone && !client.email && !client.cedula && (
                                <span className="text-[12px] text-[#3D506A]">Sin contacto registrado</span>
                            )}
                        </div>
                        {client.notes && (
                            <p className="text-[12px] text-[#7A8FAA] italic">"{client.notes}"</p>
                        )}
                    </div>

                    {/* Pending balance */}
                    <div className={cn(
                        'rounded-xl border px-4 py-3 flex flex-col gap-0.5',
                        pendingTotal > 0 ? 'bg-red-500/5 border-red-500/15' : 'bg-emerald-500/5 border-emerald-500/15'
                    )}>
                        <span className={cn('text-[10px] uppercase tracking-wider font-semibold', pendingTotal > 0 ? 'text-red-400/70' : 'text-emerald-400/70')}>
                            {pendingTotal > 0 ? 'Deuda pendiente' : 'Estado'}
                        </span>
                        <span className={cn('text-[22px] font-bold tabular-nums leading-tight', pendingTotal > 0 ? 'text-red-400' : 'text-emerald-400')}>
                            {pendingTotal > 0 ? formatCurrency(pendingTotal) : 'Al día'}
                        </span>
                        {pendingSales.length > 0 && (
                            <span className="text-[11px] text-[#3D506A]">
                                {pendingSales.length} cuenta{pendingSales.length !== 1 ? 's' : ''} pendiente{pendingSales.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-6 py-2.5 border-b border-[#192030] shrink-0">
                {([
                    { id: 'pending', label: 'Cuentas pendientes', count: pendingSales.length },
                    { id: 'history', label: 'Historial completo', count: allSales.length },
                ] as const).map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                            'flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
                            tab === t.id
                                ? 'bg-violet-500/15 text-violet-400'
                                : 'text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#1C2438]'
                        )}
                    >
                        {t.label}
                        {t.count > 0 && (
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', tab === t.id ? 'bg-violet-500/20 text-violet-300' : 'bg-[#1C2438] text-[#3D506A]')}>
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {tab === 'pending' && (
                    <div className="p-6 space-y-3">
                        {pendingSales.length === 0 ? (
                            <EmptyState
                                icon={<CheckCircle2 size={28} className="text-emerald-400" />}
                                title="Sin cuentas pendientes"
                                description="Este cliente no tiene deudas activas"
                            />
                        ) : (
                            <>
                                {/* Multiselect actions bar */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={toggleAll}
                                        className={cn(
                                            'flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium border transition-all cursor-pointer',
                                            allSelected
                                                ? 'bg-violet-500/15 border-violet-500/30 text-violet-400'
                                                : 'bg-[#101828] border-[#1E2A40] text-[#7A8FAA] hover:text-[#E4ECF7]'
                                        )}
                                    >
                                        <div className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center', allSelected ? 'bg-violet-500 border-violet-500' : 'border-[#3D506A]')}>
                                            {allSelected && <Check size={9} className="text-white" />}
                                        </div>
                                        {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                    </button>

                                    {selectedIds.size > 0 && (
                                        <>
                                            <span className="text-[12px] text-[#7A8FAA]">
                                                {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''} — <span className="font-semibold text-[#E4ECF7]">{formatCurrency(selectedTotal)}</span>
                                            </span>
                                            <div className="flex items-center gap-1.5 ml-auto">
                                                <button
                                                    onClick={() => setConfirmSettleSelected(true)}
                                                    disabled={settleSale.isPending}
                                                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-semibold hover:bg-emerald-500/20 transition-all cursor-pointer disabled:opacity-60"
                                                >
                                                    <CheckCircle2 size={13} />
                                                    Saldar
                                                </button>
                                                <button
                                                    onClick={handleChargeInPOS}
                                                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-400 text-[12px] font-semibold hover:bg-violet-500/25 transition-all cursor-pointer"
                                                >
                                                    <CreditCard size={13} />
                                                    Cobrar en POS
                                                </button>
                                            </div>
                                        </>
                                    )}
                                    {selectedIds.size === 0 && (
                                        <button
                                            onClick={() => setConfirmSettleAll(true)}
                                            disabled={settleClientSales.isPending}
                                            className="ml-auto flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] text-[12px] font-medium hover:text-emerald-400 hover:border-emerald-500/25 hover:bg-emerald-500/8 transition-all cursor-pointer disabled:opacity-60"
                                        >
                                            <CheckCircle2 size={13} />
                                            Saldar todo
                                        </button>
                                    )}
                                </div>

                                {/* Sale cards */}
                                {pendingSales.map((s: Sale) => {
                                    const sDate = s.date instanceof Date ? s.date : new Date(s.date)
                                    const dateStr = sDate.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
                                    const isSelected = selectedIds.has(s.id)
                                    const isExpanded = expandedId === s.id
                                    const mixed = parseMixedNotes((s as any).notes)
                                    const isSplitCredit = (s as any).notes?.startsWith('Crédito dividido') ?? false

                                    return (
                                        <div
                                            key={s.id}
                                            className={cn(
                                                'rounded-xl border transition-all',
                                                isSelected
                                                    ? 'bg-violet-500/8 border-violet-500/30'
                                                    : 'bg-[#0F1623] border-[#192030]'
                                            )}
                                        >
                                            <div className="flex items-center gap-3 px-4 py-3">
                                                {/* Checkbox */}
                                                <button
                                                    onClick={() => toggleSelect(s.id)}
                                                    className="shrink-0 cursor-pointer"
                                                >
                                                    <div className={cn('w-4 h-4 rounded border flex items-center justify-center transition-all', isSelected ? 'bg-violet-500 border-violet-500' : 'border-[#283A56] hover:border-violet-500/50')}>
                                                        {isSelected && <Check size={10} className="text-white" />}
                                                    </div>
                                                </button>

                                                {/* Icon */}
                                                <div className="w-8 h-8 rounded-lg bg-[#1C2438] flex items-center justify-center shrink-0">
                                                    <Receipt size={14} className={mixed ? 'text-orange-400' : 'text-[#3D506A]'} />
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-[13px] font-semibold text-[#E4ECF7]">Cuenta #{s.saleNumber}</p>
                                                        {mixed
                                                            ? <span className="text-[10px] bg-orange-500/12 text-orange-400 border border-orange-500/25 px-1.5 py-0.5 rounded-md">Pago mixto</span>
                                                            : isSplitCredit
                                                                ? <span className="text-[10px] bg-orange-500/12 text-orange-400 border border-orange-500/25 px-1.5 py-0.5 rounded-md">Dividido</span>
                                                                : <span className="text-[10px] text-[#3D506A] bg-[#1C2438] px-1.5 py-0.5 rounded-md">Crédito</span>
                                                        }
                                                    </div>
                                                    {mixed ? (
                                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                            {mixed.ef != null && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-md">Efectivo {formatCurrency(mixed.ef)}</span>}
                                                            {mixed.sinpe != null && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-md">SINPE {formatCurrency(mixed.sinpe)}</span>}
                                                            <span className="text-[10px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-md">Cuenta {formatCurrency(mixed.cuenta)}</span>
                                                        </div>
                                                    ) : (
                                                        <p className="text-[11px] text-[#3D506A]">{dateStr} · {s.items?.length ?? 0} producto{(s.items?.length ?? 0) !== 1 ? 's' : ''}</p>
                                                    )}
                                                    {mixed && <p className="text-[10px] text-[#3D506A] mt-0.5">{dateStr} · {s.items?.length ?? 0} producto{(s.items?.length ?? 0) !== 1 ? 's' : ''}</p>}
                                                </div>

                                                {/* Amount + actions */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <p className="text-[15px] font-bold text-[#E4ECF7]">{formatCurrency(s.total)}</p>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setConfirmSettleSale(s) }}
                                                        className="flex items-center gap-1 px-2.5 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/20 transition-colors cursor-pointer"
                                                    >
                                                        <Banknote size={11} />
                                                        Saldar
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openEditSale(s) }}
                                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer"
                                                        title="Editar cuenta"
                                                    >
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setDeletingSaleId(s.id) }}
                                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                                                        title="Eliminar cuenta"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5 transition-all cursor-pointer"
                                                    >
                                                        <ChevronDown size={13} className={cn('transition-transform', isExpanded ? 'rotate-180' : '')} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded items */}
                                            {isExpanded && s.items && s.items.length > 0 && (
                                                <div className="px-4 pb-3 border-t border-[#192030] pt-2.5 space-y-1">
                                                    {s.items.map((item: any) => (
                                                        <div key={item.id} className="text-[12px]">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[#7A8FAA]">
                                                                    {item.product?.name ?? item.name ?? 'Producto'} × {item.quantity}
                                                                </span>
                                                                <span className="text-[#4A6A8A] tabular-nums">{formatCurrency(item.subtotal)}</span>
                                                            </div>
                                                            {item.notes && (
                                                                <p className="text-[10px] text-orange-400/70 mt-0.5">{item.notes}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {s.discount > 0 && (
                                                        <div className="flex items-center justify-between text-[12px] pt-1 border-t border-[#192030]">
                                                            <span className="text-[#3D506A]">Descuento</span>
                                                            <span className="text-red-400">-{formatCurrency(s.discount)}</span>
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() => setSelectedSale(s)}
                                                        className="text-[11px] text-violet-400/70 hover:text-violet-400 transition-colors cursor-pointer mt-1"
                                                    >
                                                        Ver detalle completo →
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                )}

                {tab === 'history' && (
                    <div className="p-6 space-y-2">
                        {allSales.length === 0 ? (
                            <EmptyState
                                icon={<History size={28} className="text-[#283A56]" />}
                                title="Sin historial"
                                description="Aún no hay ventas registradas para este cliente"
                            />
                        ) : (
                            allSales.map((s: Sale) => {
                                const sDate = s.date instanceof Date ? s.date : new Date(s.date)
                                const dateStr = sDate.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
                                const isPending = s.isCredit
                                const isAnulada = s.status === 'ANULADA'
                                const mixed = parseMixedNotes((s as any).notes)
                                const isModified = !!(s as any).modifiedFromSaleId

                                return (
                                    <div
                                        key={s.id}
                                        onClick={() => setSelectedSale(s)}
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0F1623] border border-[#192030] hover:bg-[#141C2E] hover:border-violet-500/20 transition-all cursor-pointer"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-[#1C2438] flex items-center justify-center shrink-0">
                                            <Receipt size={14} className={mixed ? 'text-orange-400' : isPending ? 'text-amber-400' : isAnulada ? 'text-red-400' : 'text-emerald-400'} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-[13px] font-semibold text-[#E4ECF7]">
                                                    {isPending ? `Cuenta #${s.saleNumber}` : `Venta #${s.saleNumber}`}
                                                </p>
                                                <span className={cn(
                                                    'text-[10px] px-1.5 py-0.5 rounded-md font-semibold',
                                                    isAnulada ? 'bg-red-500/10 text-red-400' :
                                                    isPending ? 'bg-amber-500/10 text-amber-400' :
                                                    'bg-emerald-500/10 text-emerald-400'
                                                )}>
                                                    {isAnulada ? 'Anulada' : isPending ? 'Pendiente' : 'Pagada'}
                                                </span>
                                                {mixed && <span className="text-[10px] bg-orange-500/12 text-orange-400 border border-orange-500/25 px-1.5 py-0.5 rounded-md">Pago mixto</span>}
                                                {!mixed && <span className="text-[10px] text-[#3D506A] bg-[#1C2438] px-1.5 py-0.5 rounded-md">{s.paymentMethod}</span>}
                                                {isModified && <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-md">Modificada</span>}
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {mixed ? (
                                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                        {mixed.ef != null && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-md">Efectivo {formatCurrency(mixed.ef)}</span>}
                                                        {mixed.sinpe != null && <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-md">SINPE {formatCurrency(mixed.sinpe)}</span>}
                                                        <span className="text-[10px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-md">Cuenta {formatCurrency(mixed.cuenta)}</span>
                                                        <span className="text-[10px] text-[#3D506A]">· {dateStr}</span>
                                                    </div>
                                                ) : (
                                                    <p className="text-[11px] text-[#3D506A]">{dateStr} · {s.items?.length ?? 0} producto{(s.items?.length ?? 0) !== 1 ? 's' : ''}</p>
                                                )}
                                                {isModified && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); openCompare(s) }}
                                                        className="text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors cursor-pointer"
                                                    >
                                                        Ver cambios →
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className={cn('text-[14px] font-bold tabular-nums shrink-0', isAnulada ? 'text-[#3D506A] line-through' : 'text-[#E4ECF7]')}>
                                            {formatCurrency(s.total)}
                                        </p>
                                    </div>
                                )
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Edit credit sale modal */}
            {editingSale && (
                <>
                    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={closeEditSale} />
                    <div className="fixed z-50 inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-sm px-4">
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                                <div className="flex items-center gap-2">
                                    {editStep === 'method' && (
                                        <button
                                            onClick={() => setEditStep('main')}
                                            className="w-7 h-7 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                                        >
                                            <ArrowLeft size={14} />
                                        </button>
                                    )}
                                    <div>
                                        <h2 className="text-[15px] font-semibold text-[#E4ECF7]">Editar cuenta #{editingSale.saleNumber}</h2>
                                        <p className="text-[11px] text-[#3D506A] mt-0.5">{formatCurrency(editingSale.total)} · {client.name}</p>
                                    </div>
                                </div>
                                <button onClick={closeEditSale} className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="px-5 pb-5 space-y-3">
                                {editStep === 'main' ? (
                                    <>
                                        <p className="text-[11px] text-[#3D506A] uppercase tracking-wider font-semibold">¿Qué deseas hacer?</p>
                                        <button
                                            onClick={() => setEditStep('method')}
                                            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border bg-[#101520] border-[#1E2A40] hover:bg-[#161D2E] hover:border-emerald-500/30 transition-all cursor-pointer text-left group"
                                        >
                                            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                                <BanknoteIcon size={16} className="text-emerald-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-semibold text-[#E4ECF7]">Cambiar método de pago</p>
                                                <p className="text-[11px] text-[#3D506A] mt-0.5">Cliente paga en efectivo o SINPE ahora</p>
                                            </div>
                                        </button>
                                        <button
                                            onClick={handleEditInPOS}
                                            disabled={editingInPOS}
                                            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border bg-[#101520] border-[#1E2A40] hover:bg-[#161D2E] hover:border-amber-500/30 transition-all cursor-pointer text-left disabled:opacity-60 disabled:pointer-events-none group"
                                        >
                                            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                                                <Pencil size={16} className="text-amber-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-semibold text-[#E4ECF7]">
                                                    {editingInPOS ? 'Cargando al POS...' : 'Editar items en POS'}
                                                </p>
                                                <p className="text-[11px] text-[#3D506A] mt-0.5">Anula la cuenta y carga items al carrito para corregir</p>
                                            </div>
                                        </button>
                                        <p className="text-[10px] text-[#3D506A] text-center pt-1">
                                            "Editar en POS" elimina esta cuenta y restaura el stock
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-[11px] text-[#3D506A] uppercase tracking-wider font-semibold">¿Cómo paga el cliente?</p>
                                        <div className="text-center py-3 rounded-xl bg-[#101520] border border-[#192030]">
                                            <p className="text-[11px] text-[#3D506A] uppercase tracking-wider mb-1">Total a cobrar</p>
                                            <p className="text-[26px] font-bold text-[#E4ECF7] font-mono">{formatCurrency(editingSale.total)}</p>
                                        </div>
                                        <button
                                            onClick={() => handleConvertPayment('EFECTIVO')}
                                            disabled={convertCredit.isPending}
                                            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border bg-emerald-500/8 border-emerald-500/25 hover:bg-emerald-500/15 transition-all cursor-pointer text-left disabled:opacity-60 disabled:pointer-events-none"
                                        >
                                            <BanknoteIcon size={18} className="text-emerald-400 shrink-0" />
                                            <span className="text-[14px] font-semibold text-emerald-400">Efectivo</span>
                                        </button>
                                        <button
                                            onClick={() => handleConvertPayment('SINPE')}
                                            disabled={convertCredit.isPending}
                                            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border bg-blue-500/8 border-blue-500/25 hover:bg-blue-500/15 transition-all cursor-pointer text-left disabled:opacity-60 disabled:pointer-events-none"
                                        >
                                            <Smartphone size={18} className="text-blue-400 shrink-0" />
                                            <span className="text-[14px] font-semibold text-blue-400">SINPE</span>
                                        </button>
                                        {convertCredit.isPending && (
                                            <p className="text-[11px] text-center text-[#3D506A]">Procesando...</p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            <SaleDetailModal
                isOpen={selectedSale !== null}
                onClose={() => setSelectedSale(null)}
                sale={selectedSale}
            />
            <DeleteConfirmModal
                isOpen={deletingSaleId !== null}
                onClose={() => setDeletingSaleId(null)}
                onConfirm={async () => {
                    if (!deletingSaleId) return
                    await deleteCreditSaleHook.mutateAsync(deletingSaleId)
                    setDeletingSaleId(null)
                }}
                title="Eliminar cuenta pendiente"
                description="Se eliminará esta cuenta y se repondrá el stock. Esta acción no se puede deshacer."
                isPending={deleteCreditSaleHook.isPending}
            />
            <DeleteConfirmModal
                isOpen={confirmSettleSale !== null}
                onClose={() => setConfirmSettleSale(null)}
                onConfirm={async () => {
                    if (!confirmSettleSale) return
                    await handleSettleSingleSale(confirmSettleSale)
                    setConfirmSettleSale(null)
                }}
                title="Saldar cuenta"
                description={`¿Marcar la cuenta #${confirmSettleSale?.saleNumber} (${formatCurrency(confirmSettleSale?.total ?? 0)}) como pagada?`}
                confirmLabel="Saldar"
                confirmVariant="success"
                isPending={settleSale.isPending}
            />
            <DeleteConfirmModal
                isOpen={confirmSettleSelected}
                onClose={() => setConfirmSettleSelected(false)}
                onConfirm={async () => {
                    await handleSettleSelected()
                    setConfirmSettleSelected(false)
                }}
                title="Saldar seleccionadas"
                description={`¿Marcar ${selectedIds.size} cuenta${selectedIds.size !== 1 ? 's' : ''} como pagadas? Total: ${formatCurrency(selectedTotal)}`}
                confirmLabel="Saldar"
                confirmVariant="success"
                isPending={settleSale.isPending}
            />
            <DeleteConfirmModal
                isOpen={confirmSettleAll}
                onClose={() => setConfirmSettleAll(false)}
                onConfirm={async () => {
                    await handleSettleAll()
                    setConfirmSettleAll(false)
                }}
                title="Saldar todo"
                description={`¿Marcar las ${pendingSales.length} cuentas de ${client.name} como pagadas? Total: ${formatCurrency(pendingTotal)}`}
                confirmLabel="Saldar todo"
                confirmVariant="success"
                isPending={settleClientSales.isPending}
            />

            <BaseModal
                isOpen={compareTarget !== null}
                onClose={() => { setCompareTarget(null); setCompareOriginal(null) }}
                title={`Cambios · Venta #${compareTarget?.saleNumber}`}
                width="max-w-2xl"
            >
                {compareLoading ? (
                    <p className="text-center text-[12px] text-[#3D506A] py-8">Cargando venta original...</p>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <p className="text-[11px] text-[#3D506A] uppercase tracking-wider font-semibold">Venta original</p>
                            <div className="rounded-xl bg-[#0F1623] border border-[#192030] p-3 space-y-1">
                                {compareOriginal ? (compareOriginal.items ?? []).map((it: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[12px]">
                                        <span className="text-[#7A8FAA]">{it.quantity}× {it.product?.name ?? it.productName ?? 'Producto'}</span>
                                        <span className="text-[#E4ECF7] tabular-nums">{formatCurrency(it.subtotal)}</span>
                                    </div>
                                )) : <p className="text-[12px] text-[#3D506A]">No disponible</p>}
                                {(compareOriginal?.discount ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-[12px] text-emerald-400 border-t border-[#192030] pt-1">
                                        <span>Descuento</span><span>-{formatCurrency(compareOriginal.discount)}</span>
                                    </div>
                                )}
                                {compareOriginal && (
                                    <div className="flex items-center justify-between text-[13px] font-bold border-t border-[#192030] pt-2">
                                        <span className="text-[#7A8FAA]">Total</span>
                                        <span className="text-[#E4ECF7] tabular-nums">{formatCurrency(compareOriginal.total)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="text-[11px] text-amber-400/70 uppercase tracking-wider font-semibold">Venta modificada</p>
                            <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-3 space-y-1">
                                {(compareTarget?.items ?? []).map((it: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[12px]">
                                        <span className="text-[#7A8FAA]">{it.quantity}× {it.product?.name ?? (it as any).productName ?? 'Producto'}</span>
                                        <span className="text-[#E4ECF7] tabular-nums">{formatCurrency(it.subtotal)}</span>
                                    </div>
                                ))}
                                {(compareTarget?.discount ?? 0) > 0 && (
                                    <div className="flex items-center justify-between text-[12px] text-emerald-400 border-t border-amber-500/15 pt-1">
                                        <span>Descuento</span><span>-{formatCurrency(compareTarget?.discount ?? 0)}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between text-[13px] font-bold border-t border-amber-500/15 pt-2">
                                    <span className="text-[#7A8FAA]">Total</span>
                                    <span className={cn('tabular-nums', compareOriginal && compareTarget && compareTarget.total !== compareOriginal.total ? 'text-amber-400' : 'text-[#E4ECF7]')}>
                                        {formatCurrency(compareTarget?.total ?? 0)}
                                        {compareOriginal && compareTarget && compareTarget.total !== compareOriginal.total && (
                                            <span className="text-[11px] ml-1 opacity-70">
                                                ({compareTarget.total > compareOriginal.total ? '+' : ''}{formatCurrency(compareTarget.total - compareOriginal.total)})
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </BaseModal>
        </div>
    )
}
