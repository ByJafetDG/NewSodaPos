import { useState } from 'react'
import {
    Users, Search, Plus, Edit3, Trash2, UserCircle2,
    Phone, Mail, ChevronLeft, CheckCircle2, Receipt, Banknote,
    Check, ChevronDown, CreditCard, History, IdCard,
    Building2, Send, AlertTriangle, X, FileDown, Pencil,
    Smartphone, Banknote as BanknoteIcon, ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/atoms/Button'
import { EmptyState } from '@/components/atoms/EmptyState'
import { ClientFormModal } from '@/components/modals/ClientFormModal'
import { CompanyFormModal } from '@/components/modals/CompanyFormModal'
import { SettlePaymentModal } from '@/components/modals/SettlePaymentModal'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { SaleDetailModal } from '@/components/modals/SaleDetailModal'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import {
    useClients, useCreateClient, useUpdateClient, useDeleteClient,
    useCreditSales, useSettleSale, useSettleSaleDirect, useSettleClientSales, useSalesByClient,
    useDeleteCreditSale, useSettleClientSalesWithMethod, useConvertCreditPayment,
    useCompanies, useCreateCompany, useUpdateCompany, useDeleteCompany,
} from '@/hooks/useClients'
import { useActiveRegister } from '@/hooks/useCashRegister'
import { getSaleItemsForCart } from '@/services/sales'
import { deleteCreditSale } from '@/services/clients'
import { usePendingSaleLoadStore } from '@/store/pendingSaleLoadStore'
import { cn, formatCurrency, normalizeStr } from '@/lib/utils'
import { usePendingSettleStore } from '@/store/pendingSettleStore'
import { useUIStore } from '@/store/uiStore'
import { useBusinessConfig } from '@/hooks/useConfig'
import { sendSettledEmail, sendCompanyBillingEmail, sendCompanyStatementPDFEmail } from '@/services/emailReceipt'
import { generateCompanyStatementPDF } from '@/services/generateCompanyPDF'
import { toast } from '@/components/ui/Toast'
import type { Client, ClientType, Company, Sale } from '@/types'

function parseMixedNotes(notes: string | null | undefined): { ef?: number; sinpe?: number; cuenta: number } | null {
    if (!notes) return null
    const idx = notes.indexOf('||MIXED||')
    if (idx === -1) return null
    try { return JSON.parse(notes.slice(idx + 9)) } catch { return null }
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
    const [newClientCompanyId, setNewClientCompanyId] = useState<string | null>(null)

    const { data: clients = [] } = useClients()
    const { data: companies = [] } = useCompanies()
    const { data: allCreditSales = [] } = useCreditSales()
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

    function handleNew() { setEditingClient(null); setNewClientCompanyId(null); setFormOpen(true) }
    function handleEdit(client: Client) { setEditingClient(client); setFormOpen(true) }

    async function handleFormConfirm(data: Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) {
        if (editingClient) {
            await updateClient.mutateAsync({ id: editingClient.id, input: data })
        } else {
            await createClient.mutateAsync(data)
        }
        setFormOpen(false); setEditingClient(null); setNewClientCompanyId(null)
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
                    companies={companies}
                    isPending={createClient.isPending || updateClient.isPending}
                />
            </>
        )
    }

    const selectedCompany = companies.find(c => c.id === selectedCompanyId) ?? null
    if (selectedCompany) {
        const employees = clients.filter(cl => cl.companyId === selectedCompany.id)
        const availableClients = clients.filter(cl => !cl.companyId && cl.isActive)
        return (
            <>
                <CompanyDetailView
                    company={selectedCompany}
                    employees={employees}
                    allCreditSales={allCreditSales}
                    config={config}
                    onBack={() => setSelectedCompanyId(null)}
                    onEdit={() => { setEditingCompany(selectedCompany); setCompanyFormOpen(true) }}
                    onSelectEmployee={(id) => setSelectedClientId(id)}
                    onNewEmployee={() => { setEditingClient(null); setNewClientCompanyId(selectedCompany.id); setFormOpen(true) }}
                    onAssignEmployees={async (ids) => {
                        for (const id of ids) {
                            await updateClient.mutateAsync({ id, input: { companyId: selectedCompany.id } as any })
                        }
                    }}
                    availableClients={availableClients}
                />
                <CompanyFormModal
                    isOpen={companyFormOpen}
                    onClose={() => { setCompanyFormOpen(false); setEditingCompany(null) }}
                    onConfirm={handleCompanyFormConfirm}
                    company={editingCompany}
                    isPending={createCompany.isPending || updateCompany.isPending}
                />
                <ClientFormModal
                    isOpen={formOpen}
                    onClose={() => { setFormOpen(false); setEditingClient(null); setNewClientCompanyId(null) }}
                    onConfirm={handleFormConfirm}
                    client={editingClient}
                    companies={companies}
                    defaultCompanyId={newClientCompanyId ?? undefined}
                    isPending={createClient.isPending || updateClient.isPending}
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
                                const emps = clients.filter(cl => cl.companyId === co.id)
                                const empDebt = emps.reduce((sum, emp) => {
                                    return sum + allCreditSales.filter((s: Sale) => s.clientId === emp.id).reduce((s2, sale) => s2 + sale.total, 0)
                                }, 0)
                                const empCount = emps.filter(e => e.isActive).length
                                return (
                                    <div
                                        key={co.id}
                                        onClick={() => setSelectedCompanyId(co.id)}
                                        className="flex items-center gap-4 px-5 py-4 rounded-xl bg-[#0F1623] border border-[#192030] cursor-pointer"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center shrink-0">
                                            <Building2 size={18} className="text-orange-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[14px] font-semibold text-[#E4ECF7] truncate">{co.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                <span className="text-[11px] text-[#3D506A]">{empCount} colaborador{empCount !== 1 ? 'es' : ''}</span>
                                                {co.billingEmail && <span className="text-[11px] text-[#3D506A]">· {co.billingEmail}</span>}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            {empDebt > 0 ? (
                                                <>
                                                    <p className="text-[15px] font-bold text-red-400">{formatCurrency(empDebt)}</p>
                                                    <p className="text-[11px] text-[#3D506A]">deuda total</p>
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
                onClose={() => { setFormOpen(false); setEditingClient(null); setNewClientCompanyId(null) }}
                onConfirm={handleFormConfirm}
                client={editingClient}
                companies={companies}
                defaultCompanyId={newClientCompanyId ?? undefined}
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

function CompanyDetailView({ company, employees, allCreditSales, config, onBack, onEdit, onSelectEmployee, onNewEmployee, onAssignEmployees, availableClients }: {
    company: Company
    employees: Client[]
    allCreditSales: Sale[]
    config: any
    onBack: () => void
    onEdit: () => void
    onSelectEmployee: (id: string) => void
    onNewEmployee: () => void
    onAssignEmployees: (ids: string[]) => Promise<void>
    availableClients: Client[]
}) {
    const [settleAllOpen, setSettleAllOpen] = useState(false)
    const [settleEmployeeId, setSettleEmployeeId] = useState<string | null>(null)

    const [assignOpen, setAssignOpen] = useState(false)
    const [assignSearch, setAssignSearch] = useState('')
    const [assignSelectedIds, setAssignSelectedIds] = useState<Set<string>>(new Set())
    const [assigning, setAssigning] = useState(false)

    // Unified billing/pdf two-step flow
    const [flowType, setFlowType] = useState<null | 'billing' | 'pdf'>(null)
    const [flowStep, setFlowStep] = useState<'select' | 'confirm'>('select')
    const [flowSearch, setFlowSearch] = useState('')
    const [flowPage, setFlowPage] = useState(0)
    const [flowSelectedIds, setFlowSelectedIds] = useState<Set<string>>(new Set())
    const [flowEmailAddress, setFlowEmailAddress] = useState('')
    const [flowSending, setFlowSending] = useState(false)

    const settleWithMethod = useSettleClientSalesWithMethod()
    const flowSearchKb = useKeyboardInput(flowSearch, (v) => { setFlowSearch(v); setFlowPage(0) }, { mode: 'alpha' })
    const flowEmailKb = useKeyboardInput(flowEmailAddress, setFlowEmailAddress, { mode: 'alpha' })

    function employeePendingSales(empId: string): Sale[] {
        return allCreditSales.filter((s: Sale) => s.clientId === empId)
    }
    function employeePendingTotal(empId: string): number {
        return employeePendingSales(empId).reduce((s, sale) => s + sale.total, 0)
    }

    const activeEmployees = employees.filter(e => e.isActive)
    const employeesWithDebt = activeEmployees.filter(e => employeePendingTotal(e.id) > 0)
    const totalDebt = activeEmployees.reduce((s, e) => s + employeePendingTotal(e.id), 0)

    const settleEmployee = employees.find(e => e.id === settleEmployeeId) ?? null
    const settleEmployeeAmount = settleEmployeeId ? employeePendingTotal(settleEmployeeId) : 0

    async function handleSettleEmployee(method: string) {
        if (!settleEmployeeId) return
        await settleWithMethod.mutateAsync({ clientId: settleEmployeeId, method })
        setSettleEmployeeId(null)
        toast.success(`Cuenta de ${settleEmployee?.name} saldada`)
    }

    async function handleSettleAll(method: string) {
        for (const emp of employeesWithDebt) {
            await settleWithMethod.mutateAsync({ clientId: emp.id, method })
        }
        setSettleAllOpen(false)
        toast.success(`Todas las cuentas de ${company.name} saldadas`)
    }

    function openFlow(type: 'billing' | 'pdf') {
        setFlowType(type); setFlowStep('select')
        setFlowSearch(''); setFlowPage(0); setFlowSelectedIds(new Set()); setFlowEmailAddress('')
    }
    function closeFlow() {
        setFlowType(null); setFlowStep('select')
        setFlowSearch(''); setFlowPage(0); setFlowSelectedIds(new Set()); setFlowEmailAddress('')
    }

    async function handleFlowConfirmBilling() {
        if (!company.billingEmail || flowSelectedIds.size === 0) return
        setFlowSending(true)
        try {
            const targets = employeesWithDebt.filter(e => flowSelectedIds.has(e.id))
            const result = await sendCompanyBillingEmail({
                to: company.billingEmail,
                companyName: company.name,
                businessName: config?.name ?? 'Mi Soda',
                employees: targets.map(e => ({ employeeName: e.name, pendingTotal: employeePendingTotal(e.id) })),
                logoUrl: config?.emailLogoUrl,
            })
            if (result.success) toast.success('Cobro enviado a ' + company.billingEmail)
            else toast.error(result.error ?? 'Error al enviar')
        } finally { setFlowSending(false); closeFlow() }
    }

    async function handleFlowConfirmPDF() {
        const addr = flowEmailAddress.trim()
        if (!addr || flowSelectedIds.size === 0) return
        setFlowSending(true)
        try {
            const selectedEmps = employeesWithDebt.filter(e => flowSelectedIds.has(e.id))
            const selectedDebt = selectedEmps.reduce((s, e) => s + employeePendingTotal(e.id), 0)
            const pdfBase64 = generateCompanyStatementPDF({
                companyName: company.name,
                businessName: config?.name ?? 'Mi Soda',
                employees: selectedEmps.map(e => ({
                    name: e.name, phone: e.phone,
                    pendingTotal: employeePendingTotal(e.id),
                    pendingCount: employeePendingSales(e.id).length,
                })),
                totalDebt: selectedDebt,
            })
            const result = await sendCompanyStatementPDFEmail({
                to: addr, companyName: company.name, businessName: config?.name ?? 'Mi Soda',
                pdfBase64, logoUrl: config?.emailLogoUrl,
                employeeCount: selectedEmps.length, totalDebt: selectedDebt,
            })
            if (result.success) toast.success('PDF enviado a ' + addr)
            else toast.error(result.error ?? 'Error al enviar PDF')
        } finally { setFlowSending(false); closeFlow() }
    }

    async function handleConfirmAssign() {
        if (assignSelectedIds.size === 0) return
        setAssigning(true)
        try {
            await onAssignEmployees(Array.from(assignSelectedIds))
            toast.success(`${assignSelectedIds.size} colaborador${assignSelectedIds.size !== 1 ? 'es' : ''} asignado${assignSelectedIds.size !== 1 ? 's' : ''}`)
        } finally {
            setAssigning(false)
            setAssignOpen(false)
            setAssignSelectedIds(new Set())
            setAssignSearch('')
        }
    }

    const filteredAvailable = availableClients.filter(c =>
        !assignSearch || normalizeStr(c.name).includes(normalizeStr(assignSearch))
    )

    const FLOW_PAGE_SIZE = 10
    const flowFiltered = employeesWithDebt.filter(e =>
        !flowSearch || normalizeStr(e.name).includes(normalizeStr(flowSearch))
    )
    const flowPageCount = Math.max(1, Math.ceil(flowFiltered.length / FLOW_PAGE_SIZE))
    const flowPageItems = flowFiltered.slice(flowPage * FLOW_PAGE_SIZE, (flowPage + 1) * FLOW_PAGE_SIZE)
    const flowSelectedTotal = employeesWithDebt.filter(e => flowSelectedIds.has(e.id)).reduce((s, e) => s + employeePendingTotal(e.id), 0)

    async function handleSendPDF() {
        const addr = pdfEmailAddress.trim()
        if (!addr || pdfSelectedIds.size === 0) return
        setSendingPdf(true)
        try {
            const selectedEmps = employeesWithDebt.filter(e => pdfSelectedIds.has(e.id))
            const selectedDebt = selectedEmps.reduce((s, e) => s + employeePendingTotal(e.id), 0)
            const pdfBase64 = generateCompanyStatementPDF({
                companyName: company.name,
                businessName: config?.name ?? 'Mi Soda',
                employees: selectedEmps.map(e => ({
                    name: e.name,
                    phone: e.phone,
                    pendingTotal: employeePendingTotal(e.id),
                    pendingCount: employeePendingSales(e.id).length,
                })),
                totalDebt: selectedDebt,
            })
            const result = await sendCompanyStatementPDFEmail({
                to: addr,
                companyName: company.name,
                businessName: config?.name ?? 'Mi Soda',
                pdfBase64,
                logoUrl: config?.emailLogoUrl,
                employeeCount: selectedEmps.length,
                totalDebt: selectedDebt,
            })
            if (result.success) toast.success('PDF enviado a ' + addr)
            else toast.error(result.error ?? 'Error al enviar PDF')
        } finally {
            setSendingPdf(false)
            setPdfEmailOpen(false)
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
                        <p className="text-[11px] text-[#3D506A]">{activeEmployees.length} colaborador{activeEmployees.length !== 1 ? 'es' : ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {company.billingEmail && employeesWithDebt.length > 0 && (
                        <button
                            onClick={() => openFlow('billing')}
                            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[12px] font-semibold hover:bg-blue-500/20 transition-all cursor-pointer"
                        >
                            <Send size={12} />
                            Enviar cobro
                        </button>
                    )}
                    {employeesWithDebt.length > 0 && (
                        <button
                            onClick={() => openFlow('pdf')}
                            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[12px] font-semibold hover:bg-violet-500/20 transition-all cursor-pointer"
                        >
                            <FileDown size={12} />
                            PDF
                        </button>
                    )}
                    {employeesWithDebt.length > 0 && (
                        <button
                            onClick={() => setSettleAllOpen(true)}
                            className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-semibold hover:bg-emerald-500/20 transition-all cursor-pointer"
                        >
                            <CheckCircle2 size={12} />
                            Saldar todo — {formatCurrency(totalDebt)}
                        </button>
                    )}
                    <button onClick={onEdit} className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] text-[12px] hover:text-[#E4ECF7] transition-all cursor-pointer">
                        <Edit3 size={13} />
                        Editar
                    </button>
                </div>
            </div>

            {/* Company info */}
            <div className="px-6 py-3 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-6">
                    {company.billingEmail && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                            <Mail size={12} className="text-[#3D506A]" />
                            {company.billingEmail}
                        </div>
                    )}
                    {company.phone && (
                        <div className="flex items-center gap-1.5 text-[12px] text-[#7A8FAA]">
                            <Phone size={12} className="text-[#3D506A]" />
                            {company.phone}
                        </div>
                    )}
                    {!company.billingEmail && !company.phone && (
                        <span className="text-[12px] text-[#3D506A]">Sin datos de contacto</span>
                    )}
                    {totalDebt > 0 && (
                        <div className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-xl bg-red-500/8 border border-red-500/15">
                            <span className="text-[11px] text-red-400/70 uppercase tracking-wider">Deuda total</span>
                            <span className="text-[18px] font-bold text-red-400">{formatCurrency(totalDebt)}</span>
                        </div>
                    )}
                    {totalDebt === 0 && (
                        <div className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
                            <span className="text-[13px] font-semibold text-emerald-400">Empresa al día</span>
                        </div>
                    )}
                </div>
                {!company.billingEmail && (
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-400/70">
                        <AlertTriangle size={11} />
                        Sin correo de facturación — edita la empresa para agregar uno
                    </div>
                )}
            </div>

            {/* Employees toolbar */}
            <div className="flex items-center justify-between px-6 py-2.5 border-b border-[#192030] shrink-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Colaboradores</p>
                <div className="flex items-center gap-1.5">
                    {availableClients.length > 0 && (
                        <button
                            onClick={() => setAssignOpen(true)}
                            className="flex items-center gap-1.5 px-3 h-7 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] text-[11px] font-medium hover:text-orange-400 hover:border-orange-500/25 hover:bg-orange-500/5 transition-all cursor-pointer"
                        >
                            <Users size={11} />
                            Asignar existente
                        </button>
                    )}
                    <button
                        onClick={onNewEmployee}
                        className="flex items-center gap-1.5 px-3 h-7 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[11px] font-semibold hover:bg-orange-500/15 transition-all cursor-pointer"
                    >
                        <Plus size={11} />
                        Nuevo colaborador
                    </button>
                </div>
            </div>

            {/* Employees list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-2">
                {activeEmployees.length === 0 ? (
                    <EmptyState
                        icon={<Users size={28} className="text-[#283A56]" />}
                        title="Sin colaboradores"
                        description="Crea un nuevo colaborador o asigna clientes existentes a esta empresa"
                    />
                ) : (
                    activeEmployees.map(emp => {
                        const debt = employeePendingTotal(emp.id)
                        const debtCount = employeePendingSales(emp.id).length
                        return (
                            <div key={emp.id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[#0F1623] border border-[#192030] hover:bg-[#141C2E] hover:border-[#283A56] transition-all group">
                                <UserCircle2 size={18} className="text-[#3D506A] shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-[#E4ECF7] truncate">{emp.name}</p>
                                    {emp.phone && <p className="text-[11px] text-[#3D506A]">{emp.phone}</p>}
                                </div>
                                <div className="text-right shrink-0 mr-2">
                                    {debt > 0 ? (
                                        <>
                                            <p className="text-[14px] font-bold text-red-400">{formatCurrency(debt)}</p>
                                            <p className="text-[10px] text-[#3D506A]">{debtCount} cuenta{debtCount !== 1 ? 's' : ''}</p>
                                        </>
                                    ) : (
                                        <span className="text-[12px] text-emerald-400">Al día</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => onSelectEmployee(emp.id)}
                                        className="px-2.5 h-7 rounded-lg bg-[#1C2438] text-[#7A8FAA] text-[11px] font-medium hover:text-[#E4ECF7] hover:bg-[#283A56] transition-all cursor-pointer"
                                    >
                                        Historial
                                    </button>
                                    {debt > 0 && (
                                        <button
                                            onClick={() => setSettleEmployeeId(emp.id)}
                                            className="flex items-center gap-1 px-2.5 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/20 transition-all cursor-pointer"
                                        >
                                            <CheckCircle2 size={11} />
                                            Saldar
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Unified billing / PDF two-step flow modal */}
            {flowType && (
                <>
                    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={closeFlow} />
                    <div className="fixed z-50 inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-md px-4">
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 80px)' }}>

                            {flowStep === 'select' ? (
                                <>
                                    {/* Step 1 header */}
                                    <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                                        <div>
                                            <h2 className="text-[15px] font-semibold text-[#E4ECF7]">Seleccionar colaboradores</h2>
                                            <p className="text-[11px] text-[#3D506A] mt-0.5">
                                                {flowType === 'pdf' ? 'PDF del estado de cuenta' : `Cobro a ${company.billingEmail}`}
                                            </p>
                                        </div>
                                        <button onClick={closeFlow} className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                                            <X size={16} />
                                        </button>
                                    </div>

                                    {/* Search + select-all */}
                                    <div className="px-5 pb-2 shrink-0 space-y-2">
                                        <div className="relative">
                                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none" />
                                            <input
                                                type="text"
                                                {...flowSearchKb}
                                                placeholder="Buscar colaborador..."
                                                className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-[#3D506A]">{flowFiltered.length} colaborador{flowFiltered.length !== 1 ? 'es' : ''}</span>
                                            <button
                                                onClick={() => setFlowSelectedIds(
                                                    flowSelectedIds.size === employeesWithDebt.length
                                                        ? new Set()
                                                        : new Set(employeesWithDebt.map(e => e.id))
                                                )}
                                                className={cn('text-[11px] font-semibold cursor-pointer transition-colors', flowType === 'pdf' ? 'text-violet-400 hover:text-violet-300' : 'text-blue-400 hover:text-blue-300')}
                                            >
                                                {flowSelectedIds.size === employeesWithDebt.length ? 'Quitar todos' : 'Seleccionar todos'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Scrollable employee list */}
                                    <div className="flex-1 overflow-y-auto px-5 space-y-1.5 pb-2 min-h-0">
                                        {flowPageItems.length === 0 && (
                                            <p className="text-center text-[12px] text-[#3D506A] py-8">Sin resultados</p>
                                        )}
                                        {flowPageItems.map(emp => {
                                            const checked = flowSelectedIds.has(emp.id)
                                            const accent = flowType === 'pdf'
                                                ? checked ? 'bg-violet-500/8 border-violet-500/20' : 'bg-[#101520] border-[#192030] hover:bg-[#141C2E]'
                                                : checked ? 'bg-blue-500/8 border-blue-500/20' : 'bg-[#101520] border-[#192030] hover:bg-[#141C2E]'
                                            const chk = flowType === 'pdf'
                                                ? checked ? 'bg-violet-500 border-violet-500' : 'border-[#3D506A]'
                                                : checked ? 'bg-blue-500 border-blue-500' : 'border-[#3D506A]'
                                            return (
                                                <button
                                                    key={emp.id}
                                                    onClick={() => setFlowSelectedIds(prev => {
                                                        const next = new Set(prev)
                                                        if (next.has(emp.id)) next.delete(emp.id); else next.add(emp.id)
                                                        return next
                                                    })}
                                                    className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left', accent)}
                                                >
                                                    <div className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors', chk)}>
                                                        {checked && <Check size={10} className="text-white" />}
                                                    </div>
                                                    <p className="text-[12px] font-semibold text-[#E4ECF7] flex-1 truncate">{emp.name}</p>
                                                    <span className="text-[12px] font-bold text-red-400 shrink-0">{formatCurrency(employeePendingTotal(emp.id))}</span>
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {/* Pagination */}
                                    {flowPageCount > 1 && (
                                        <div className="flex items-center justify-between px-5 py-2 border-t border-[#192030] shrink-0">
                                            <button
                                                onClick={() => setFlowPage(p => Math.max(0, p - 1))}
                                                disabled={flowPage === 0}
                                                className="px-3 h-7 rounded-lg text-[11px] font-medium text-[#7A8FAA] hover:text-[#E4ECF7] hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                                            >
                                                ← Anterior
                                            </button>
                                            <span className="text-[11px] text-[#3D506A]">{flowPage + 1} / {flowPageCount}</span>
                                            <button
                                                onClick={() => setFlowPage(p => Math.min(flowPageCount - 1, p + 1))}
                                                disabled={flowPage >= flowPageCount - 1}
                                                className="px-3 h-7 rounded-lg text-[11px] font-medium text-[#7A8FAA] hover:text-[#E4ECF7] hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                                            >
                                                Siguiente →
                                            </button>
                                        </div>
                                    )}

                                    {/* Footer */}
                                    <div className="px-5 py-4 border-t border-[#192030] shrink-0 space-y-3">
                                        {flowSelectedIds.size > 0 && (
                                            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#101520] border border-[#1E2A40]">
                                                <span className="text-[11px] text-[#7A8FAA]">{flowSelectedIds.size} seleccionado{flowSelectedIds.size !== 1 ? 's' : ''}</span>
                                                <span className="text-[13px] font-bold text-[#E4ECF7]">{formatCurrency(flowSelectedTotal)}</span>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setFlowStep('confirm')}
                                            disabled={flowSelectedIds.size === 0}
                                            className={cn(
                                                'w-full h-11 rounded-xl text-white text-[13px] font-bold disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-2',
                                                flowType === 'pdf' ? 'bg-violet-500 hover:bg-violet-600' : 'bg-blue-500 hover:bg-blue-600'
                                            )}
                                        >
                                            Continuar →
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Step 2 header */}
                                    <div className="flex items-center gap-2 px-5 pt-5 pb-4 shrink-0">
                                        <button
                                            onClick={() => setFlowStep('select')}
                                            className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <h2 className="flex-1 text-[15px] font-semibold text-[#E4ECF7]">
                                            {flowType === 'pdf' ? 'Enviar PDF' : 'Confirmar cobro'}
                                        </h2>
                                        <button onClick={closeFlow} className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                                            <X size={16} />
                                        </button>
                                    </div>

                                    <div className="px-5 pb-5 space-y-4">
                                        {/* Summary */}
                                        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#101520] border border-[#1E2A40]">
                                            <div>
                                                <p className="text-[11px] text-[#3D506A]">Colaboradores incluidos</p>
                                                <p className="text-[14px] font-bold text-[#E4ECF7] mt-0.5">{flowSelectedIds.size} de {employeesWithDebt.length}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[11px] text-[#3D506A]">Total</p>
                                                <p className="text-[16px] font-bold text-red-400 mt-0.5">{formatCurrency(flowSelectedTotal)}</p>
                                            </div>
                                        </div>

                                        {flowType === 'pdf' ? (
                                            <>
                                                <div className="space-y-1.5">
                                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Enviar a correo</p>
                                                    <input
                                                        type="email"
                                                        {...flowEmailKb}
                                                        onKeyDown={e => { if (e.key === 'Enter') handleFlowConfirmPDF() }}
                                                        placeholder="tucorreo@ejemplo.com"
                                                        className="w-full h-11 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
                                                        autoFocus
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleFlowConfirmPDF}
                                                    disabled={!flowEmailAddress.trim() || flowSending}
                                                    className="w-full h-11 rounded-xl bg-violet-500 text-white text-[13px] font-bold hover:bg-violet-600 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-2"
                                                >
                                                    <FileDown size={14} />
                                                    {flowSending ? 'Generando y enviando...' : 'Enviar PDF'}
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
                                                    <p className="text-[11px] text-blue-400/70">Destino: <span className="font-semibold text-blue-400">{company.billingEmail}</span></p>
                                                </div>
                                                <button
                                                    onClick={handleFlowConfirmBilling}
                                                    disabled={flowSending}
                                                    className="w-full h-11 rounded-xl bg-blue-500 text-white text-[13px] font-bold hover:bg-blue-600 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-2"
                                                >
                                                    <Send size={14} />
                                                    {flowSending ? 'Enviando...' : 'Enviar cobro'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Assign employees modal */}
            {assignOpen && (
                <>
                    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => { setAssignOpen(false); setAssignSearch(''); setAssignSelectedIds(new Set()) }} />
                    <div className="fixed z-50 inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-sm px-4">
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                                <h2 className="text-[15px] font-semibold text-[#E4ECF7]">Asignar colaboradores</h2>
                                <button onClick={() => { setAssignOpen(false); setAssignSearch(''); setAssignSelectedIds(new Set()) }} className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="px-5 pb-5 space-y-3">
                                <div className="relative">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none" />
                                    <input
                                        type="text"
                                        value={assignSearch}
                                        onChange={e => setAssignSearch(e.target.value)}
                                        placeholder="Buscar cliente sin empresa..."
                                        className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                                    />
                                </div>
                                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                                    {filteredAvailable.length === 0 ? (
                                        <p className="text-center text-[12px] text-[#3D506A] py-6">Sin clientes sin empresa disponibles</p>
                                    ) : filteredAvailable.map(cl => {
                                        const checked = assignSelectedIds.has(cl.id)
                                        return (
                                            <button
                                                key={cl.id}
                                                onClick={() => setAssignSelectedIds(prev => {
                                                    const next = new Set(prev)
                                                    if (next.has(cl.id)) next.delete(cl.id); else next.add(cl.id)
                                                    return next
                                                })}
                                                className={cn(
                                                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left',
                                                    checked ? 'bg-orange-500/8 border-orange-500/20' : 'bg-[#101520] border-[#192030] hover:bg-[#141C2E]'
                                                )}
                                            >
                                                <div className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors', checked ? 'bg-orange-500 border-orange-500' : 'border-[#3D506A]')}>
                                                    {checked && <Check size={10} className="text-white" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[12px] font-semibold text-[#E4ECF7] truncate">{cl.name}</p>
                                                    {cl.phone && <p className="text-[10px] text-[#3D506A]">{cl.phone}</p>}
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                                <button
                                    onClick={handleConfirmAssign}
                                    disabled={assignSelectedIds.size === 0 || assigning}
                                    className="w-full h-11 rounded-xl bg-orange-500 text-white text-[13px] font-bold hover:bg-orange-600 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <Check size={14} />
                                    {assigning ? 'Asignando...' : `Asignar ${assignSelectedIds.size > 0 ? assignSelectedIds.size + ' ' : ''}colaborador${assignSelectedIds.size !== 1 ? 'es' : ''}`}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <SettlePaymentModal
                isOpen={settleAllOpen}
                onClose={() => setSettleAllOpen(false)}
                onConfirm={handleSettleAll}
                title={`Saldar toda la empresa`}
                amount={totalDebt}
                isPending={settleWithMethod.isPending}
            />
            <SettlePaymentModal
                isOpen={settleEmployeeId !== null}
                onClose={() => setSettleEmployeeId(null)}
                onConfirm={handleSettleEmployee}
                title={`Saldar cuenta de ${settleEmployee?.name ?? ''}`}
                amount={settleEmployeeAmount}
                isPending={settleWithMethod.isPending}
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
            await deleteCreditSale(editingSale.id)
            pendingSaleLoad.set(items, editingSale.discount, editingSale.id, editingSale.saleNumber, client.name)
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
                                            </div>
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
        </div>
    )
}
