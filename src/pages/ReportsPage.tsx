import { useState, useRef, useEffect, useMemo } from 'react'
import {
    BarChart3, Banknote, Smartphone, CreditCard, Landmark,
    TrendingUp, ShoppingBag, PackageX, AlertTriangle, Calendar,
    Receipt, Search, Clock, X, Ban, UserCircle2, Pencil, ChevronDown,
} from 'lucide-react'
import { useProductsStock } from '@/hooks/useInventory'
import { useReportData, useCashierLeaderboard } from '@/hooks/useReports'
import { CashierPodium } from '@/components/organisms/pos/CashierPodium'
import { useVoidSale } from '@/hooks/useSales'
import { getSaleItemsForCart } from '@/services/sales'
import { deleteCreditSale } from '@/services/clients'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { cn, formatCurrency, crTime, toCR } from '@/lib/utils'
import { ReportSaleModal } from '@/components/modals/ReportSaleModal'
import { TimeWheelPicker, HOURS, MINUTES } from '@/components/ui/TimeWheelPicker'
import { usePendingSaleLoadStore } from '@/store/pendingSaleLoadStore'
import { useUIStore } from '@/store/uiStore'
import { toast } from '@/components/ui/Toast'
import { sileo } from 'sileo'

function toLocalISO(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3,'0')}`
}

function getDateRange(filter: string, customFrom: string, customTo: string, showCustom: boolean): [string, string] {
    if (showCustom && customFrom && customTo)
        return [`${customFrom}T00:00:00.000`, `${customTo}T23:59:59.999`]
    const now = new Date()
    const from = new Date(now)
    const to = new Date(now)
    to.setHours(23, 59, 59, 999)
    if (filter === 'Hoy') from.setHours(0, 0, 0, 0)
    else if (filter === 'Semana') { from.setDate(from.getDate() - 7); from.setHours(0, 0, 0, 0) }
    else if (filter === 'Mes')   { from.setDate(from.getDate() - 30); from.setHours(0, 0, 0, 0) }
    else if (filter === 'Año')   { from.setFullYear(from.getFullYear() - 1); from.setHours(0, 0, 0, 0) }
    else { from.setFullYear(2000, 0, 1); from.setHours(0, 0, 0, 0) }
    return [toLocalISO(from), toLocalISO(to)]
}


const PM_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    EFECTIVO:      { label: 'Efectivo',  color: 'text-emerald-400', bg: 'bg-emerald-500', icon: <Banknote size={13} /> },
    SINPE:         { label: 'SINPE',     color: 'text-blue-400',    bg: 'bg-blue-500',    icon: <Smartphone size={13} /> },
    CREDITO:       { label: 'Crédito',   color: 'text-violet-400',  bg: 'bg-violet-500',  icon: <CreditCard size={13} /> },
    DEPOSITO:      { label: 'Depósito',  color: 'text-amber-400',   bg: 'bg-amber-500',   icon: <Landmark size={13} /> },
    TARJETA:       { label: 'Tarjeta',   color: 'text-cyan-400',    bg: 'bg-cyan-500',    icon: <CreditCard size={13} /> },
    TRANSFERENCIA: { label: 'Transfer.', color: 'text-orange-400',  bg: 'bg-orange-500',  icon: <Landmark size={13} /> },
}

const DATE_FILTERS = ['Hoy', 'Semana', 'Mes', 'Año', 'Todo'] as const
type DateFilter = typeof DATE_FILTERS[number]

function extractCajero(notes: string | null | undefined): string {
    const idx = (notes ?? '').indexOf('Cajero:')
    if (idx === -1) return 'Sin cajero'
    return (notes as string).slice(idx + 8).split('||')[0].trim() || 'Sin cajero'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ReportsPage() {
    const [dateFilter, setDateFilter] = useState<DateFilter>('Hoy')
    const [customFrom, setCustomFrom] = useState('')
    const [customTo, setCustomTo] = useState('')
    const [showCustom, setShowCustom] = useState(false)
    const [selectedHour, setSelectedHour] = useState<number | null>(null)

    // Sale detail
    const [selectedSale, setSelectedSale] = useState<any | null>(null)

    const voidSaleMutation = useVoidSale()
    const pendingSaleLoad = usePendingSaleLoadStore()
    const setCurrentPage = useUIStore(s => s.setCurrentPage)

    const handleVoidSale = async (saleId: string) => {
        await voidSaleMutation.mutateAsync(saleId)
        setSelectedSale(null)
        toast.success('Venta anulada')
    }

    const handleModifySale = async (saleId: string) => {
        const saleInfo = sales.find((s: any) => s.id === saleId)
        const items = await getSaleItemsForCart(saleId)
        if (items.length === 0) {
            throw new Error('No se pudieron recuperar los productos de esta venta')
        }
        const snapshot = JSON.stringify({
            saleNumber: saleInfo?.saleNumber ?? 0,
            items: items.map(i => ({ name: i.product.name, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
            subtotal: saleInfo?.subtotal ?? 0,
            discount: saleInfo?.discount ?? 0,
            total: saleInfo?.total ?? 0,
            date: saleInfo?.date ?? null,
            cashier: saleInfo?.notes?.match(/Cajero:\s*(.+)/)?.[1]?.trim() ?? null,
        })
        if (saleInfo?.isCredit) {
            // Credit sale: hard-delete so salesCredit on register stays correct
            await deleteCreditSale(saleId)
        }
        // Non-credit sales: do NOT void here — the original stays COMPLETADA while editing.
        // createSale voids it atomically at charge time, so no sale is lost if user cancels.
        pendingSaleLoad.set(
            items,
            saleInfo?.discount ?? 0,
            saleId,
            saleInfo?.saleNumber ?? 0,
            saleInfo?.clientName ?? saleInfo?.client?.name ?? null,
            snapshot,
            null,
            saleInfo?.clientId ?? saleInfo?.client?.id ?? null,
            saleInfo?.consumerName ?? null,
            saleInfo?.physicalInvoiceNumber ?? null
        )
        setSelectedSale(null)
        setCurrentPage('pos')
    }

    // Recent sales filters
    const [orderSearch, setOrderSearch] = useState('')
    const orderKb = useKeyboardInput(orderSearch, setOrderSearch, { mode: 'alpha' })
    const [showAnuladas, setShowAnuladas] = useState(false)
    const [showSoloModificadas, setShowSoloModificadas] = useState(false)
    const [filterCajero, setFilterCajero] = useState('')
    const [showCajeroMenu, setShowCajeroMenu] = useState(false)
    const cajeroMenuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!showCajeroMenu) return
        function handleOutside(e: MouseEvent) {
            if (cajeroMenuRef.current && !cajeroMenuRef.current.contains(e.target as Node))
                setShowCajeroMenu(false)
        }
        document.addEventListener('mousedown', handleOutside)
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [showCajeroMenu])

    const [filterHour, setFilterHour] = useState(0)
    const [filterMinuteIdx, setFilterMinuteIdx] = useState(0)
    const [timeActive, setTimeActive] = useState(false)
    const [showTimePicker, setShowTimePicker] = useState(false)
    const timePickerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!showTimePicker) return
        function handleOutside(e: MouseEvent) {
            if (timePickerRef.current && !timePickerRef.current.contains(e.target as Node)) {
                setShowTimePicker(false)
            }
        }
        document.addEventListener('mousedown', handleOutside)
        return () => document.removeEventListener('mousedown', handleOutside)
    }, [showTimePicker])

    const [from, to] = getDateRange(dateFilter, customFrom, customTo, showCustom)
    const { data: reportData } = useReportData(from, to)

    const isFirstRender = useRef(true)
    const prevPeriodLabel = useRef('')
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false
            prevPeriodLabel.current = periodLabel
            return
        }
        const prev = prevPeriodLabel.current
        prevPeriodLabel.current = periodLabel
        sileo.success({
            title: 'Filtro actualizado',
            description: (
                <div style={{ marginTop: 8 }}>
                    <div style={{
                        display: 'flex', alignItems: 'stretch',
                        background: 'rgba(0,0,0,0.3)', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
                    }}>
                        <div style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#4B5563', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Antes</div>
                            <div style={{ fontSize: 15, color: '#6B7280', fontWeight: 700, lineHeight: 1 }}>{prev}</div>
                        </div>
                        <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
                        <div style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#22D3EE', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Ahora</div>
                            <div style={{ fontSize: 15, color: '#22D3EE', fontWeight: 900, lineHeight: 1 }}>{periodLabel}</div>
                        </div>
                    </div>
                </div>
            ),
            position: 'top-left',
        })
    }, [from, to])
    const { data: productsStock = [] } = useProductsStock()
    const { data: historicalLeaderboard = [] } = useCashierLeaderboard()

    const periodLabel = showCustom
        ? (customFrom && customTo ? `${customFrom} → ${customTo}` : 'Personalizado')
        : dateFilter

    const sales = reportData?.sales ?? []
    const products = reportData?.products?.length ? reportData.products : productsStock

    // Use pre-calculated stats from SQL for speed; stats always count COMPLETADA only
    const effectivePayment: Record<string, number> = { EFECTIVO: 0, SINPE: 0, CREDITO: 0 }
    if (reportData?.paymentStats) {
        reportData.paymentStats.forEach((ps: any) => {
            effectivePayment[ps.paymentMethod] = ps.total
        })
    }
    const effectiveTop = reportData?.topProducts ?? []
    const effectiveHourly = reportData?.hourlyStats ?? Array(24).fill(0)

    // Stats only on completed sales
    const completedSales = (sales as any[]).filter((s: any) => s.status !== 'ANULADA')
    const totalSalesAmt = completedSales.reduce((sum: number, s: any) => sum + s.total, 0)
    const avgTicket = completedSales.length > 0 ? Math.round(totalSalesAmt / completedSales.length) : 0
    const inventoryValue = products.reduce((sum: any, p: any) => sum + ((p.price ?? 0) * (p.stockQty ?? 0)), 0)
    const pendingCredit = (reportData?.totalDebt ?? 0) - (reportData?.totalPaid ?? 0)

    const hourlyCounts = useMemo(() => {
        const arr = Array(24).fill(0)
        completedSales.forEach((s: any) => {
            const h = toCR(s.paidAt ?? s.date).getUTCHours()
            if (h >= 0 && h < 24) arr[h]++
        })
        return arr
    }, [completedSales])

    const hourlyPeakIdx = effectiveHourly.indexOf(Math.max(...effectiveHourly, 1))

    const cajeros = useMemo(() => {
        const names = new Set<string>()
        ;(sales as any[]).forEach((s: any) => {
            names.add(extractCajero(s.notes))
        })
        return Array.from(names).sort()
    }, [sales])

    const filteredSales = (sales as any[])
        .filter((s: any) => {
            if (!showAnuladas && s.status === 'ANULADA') return false
            if (showSoloModificadas && !s.originalSaleSnapshot && !s.modifiedFromSaleId) return false
            if (filterCajero && extractCajero(s.notes) !== filterCajero) return false
            if (orderSearch) {
                const q = orderSearch.toLowerCase()
                const matchNum = s.saleNumber?.toString().includes(orderSearch)
                const matchClient = (s.clientName ?? s.client?.name ?? '').toLowerCase().includes(q)
                const matchConsumer = (s.consumerName ?? '').toLowerCase().includes(q)
                const matchCompany = (s.companyName ?? s.company?.name ?? '').toLowerCase().includes(q)
                if (!matchNum && !matchClient && !matchConsumer && !matchCompany) return false
            }
            if (timeActive) {
                const d = toCR(s.paidAt ?? s.date)
                const saleMinutes = d.getUTCHours() * 60 + d.getUTCMinutes()
                const filterMinutes = filterHour * 60 + parseInt(MINUTES[filterMinuteIdx])
                if (saleMinutes < filterMinutes) return false
            }
            if (selectedHour !== null && toCR(s.paidAt ?? s.date).getUTCHours() !== selectedHour) return false
            return true
        })
        .sort((a: any, b: any) =>
            new Date(b.paidAt ?? b.date).getTime() - new Date(a.paidAt ?? a.date).getTime()
        )

    const maxPayment = Math.max(...Object.values(effectivePayment), 1)
    const maxHourly = Math.max(...effectiveHourly, 1)
    const maxTopQty = effectiveTop[0]?.qty ?? 1

    const lowStock = products.filter((p: any) => !p.isInfinite && p.stockQty <= p.minStock && p.stockQty > 0)
    const outOfStock = products.filter((p: any) => !p.isInfinite && p.stockQty === 0)

    const handleHourSelect = (h: number | null) => {
        const prev = selectedHour !== null ? fmtHour(selectedHour) : 'Todo el día'
        const next = h !== null ? fmtHour(h) : 'Todo el día'
        const isPeak = h !== null && h === hourlyPeakIdx
        setSelectedHour(h)
        if (h !== null) { setTimeActive(false); setShowTimePicker(false) }
        sileo.success({
            title: h === null
                ? 'Filtro de hora quitado'
                : isPeak
                    ? `Hora pico · ${fmtHour(h)}`
                    : `Ventas de ${fmtHour(h)}`,
            description: (
                <div style={{ marginTop: 8 }}>
                    <div style={{
                        display: 'flex', alignItems: 'stretch',
                        background: 'rgba(0,0,0,0.3)', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
                    }}>
                        <div style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#4B5563', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Antes</div>
                            <div style={{ fontSize: 15, color: '#6B7280', fontWeight: 700, lineHeight: 1 }}>{prev}</div>
                        </div>
                        <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
                        <div style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#22D3EE', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Ahora</div>
                            <div style={{ fontSize: 15, color: '#22D3EE', fontWeight: 900, lineHeight: 1 }}>{next}</div>
                            {h !== null && hourlyCounts[h] > 0 && (
                                <div style={{ fontSize: 10, color: '#7A8FAA', marginTop: 4 }}>{hourlyCounts[h]} venta{hourlyCounts[h] !== 1 ? 's' : ''}</div>
                            )}
                        </div>
                    </div>
                </div>
            ),
            position: 'top-right',
        })
    }

    return (
        <div className="flex flex-col h-full">
            <ReportSaleModal
                sale={selectedSale}
                onClose={() => setSelectedSale(null)}
                onVoid={handleVoidSale}
                onModify={handleModifySale}
            />
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-500/10">
                        <BarChart3 size={18} className="text-cyan-400" />
                    </div>
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E4ECF7]">Reportes</h1>
                        <p className="text-[12px] text-[#3D506A]">Estadísticas de ventas</p>
                    </div>
                </div>

                {/* Date filter */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-[#101520] border border-[#192030]">
                        {DATE_FILTERS.map(f => (
                            <button
                                key={f}
                                onClick={() => { setDateFilter(f); setShowCustom(false) }}
                                className={cn(
                                    'px-3 h-7 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
                                    dateFilter === f && !showCustom
                                        ? 'bg-cyan-500/15 text-cyan-400'
                                        : 'text-[#3D506A] hover:text-[#7A8FAA]'
                                )}
                            >
                                {f}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowCustom(v => !v)}
                            className={cn(
                                'flex items-center gap-1 px-3 h-7 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
                                showCustom ? 'bg-cyan-500/15 text-cyan-400' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                            )}
                        >
                            <Calendar size={11} />
                            Personalizado
                        </button>
                    </div>

                    {/* Custom date inputs */}
                    {showCustom && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#101520] border border-cyan-500/30">
                            <input
                                type="date"
                                value={customFrom}
                                onChange={e => setCustomFrom(e.target.value)}
                                className="bg-transparent text-[12px] text-[#E4ECF7] outline-none cursor-pointer [color-scheme:dark]"
                            />
                            <span className="text-[11px] text-[#3D506A]">→</span>
                            <input
                                type="date"
                                value={customTo}
                                onChange={e => setCustomTo(e.target.value)}
                                className="bg-transparent text-[12px] text-[#E4ECF7] outline-none cursor-pointer [color-scheme:dark]"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Total ventas" value={formatCurrency(totalSalesAmt)} sub={`${dateFilter.toLowerCase()}`} color="text-cyan-400" bg="bg-cyan-500/10" icon={<TrendingUp size={15} />} />
                    <StatCard label="Ticket promedio" value={formatCurrency(avgTicket)} sub={`${sales.length} ventas`} color="text-emerald-400" bg="bg-emerald-500/10" icon={<ShoppingBag size={15} />} />
                    <StatCard label="Valor inventario" value={formatCurrency(inventoryValue)} sub="en precio" color="text-blue-400" bg="bg-blue-500/10" icon={<BarChart3 size={15} />} />
                    <StatCard label="Crédito pendiente" value={formatCurrency(Math.max(0, pendingCredit))} sub="saldo neto" color="text-amber-400" bg="bg-amber-500/10" icon={<Receipt size={15} />} />
                </div>

                {/* Payment breakdown + Top products */}
                <div className="grid grid-cols-2 gap-4 items-start">
                    {/* Payment methods */}
                    <div className="rounded-2xl bg-[#0F1623] border border-[#192030] p-4">
                        <p className="text-[12px] font-semibold text-[#7A8FAA] mb-4">Métodos de pago</p>
                        <div className="space-y-3">
                            {Object.entries(effectivePayment).map(([method, amount]) => {
                                const cfg = PM_CONFIG[method] ?? PM_CONFIG['EFECTIVO']
                                const pct = Math.round((amount / (totalSalesAmt || 1)) * 100)
                                const barW = Math.round((amount / maxPayment) * 100)
                                return (
                                    <div key={method}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className={cn('flex items-center gap-1.5 text-[12px] font-medium', cfg.color)}>
                                                {cfg.icon}
                                                {cfg.label}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] text-[#3D506A]">{pct}%</span>
                                                <span className="text-[13px] font-semibold text-[#E4ECF7]">{formatCurrency(amount)}</span>
                                            </div>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-[#1C2438]">
                                            <div
                                                className={cn('h-full rounded-full', cfg.bg, 'opacity-70')}
                                                style={{ width: `${barW}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="mt-4 pt-3 border-t border-[#192030] flex justify-between">
                            <span className="text-[11px] text-[#3D506A]">Total</span>
                            <span className="text-[14px] font-bold text-[#E4ECF7]">{formatCurrency(totalSalesAmt)}</span>
                        </div>
                    </div>

                    {/* Top products */}
                    <div className="rounded-2xl bg-[#0F1623] border border-[#192030] p-4">
                        <p className="text-[12px] font-semibold text-[#7A8FAA] mb-4">Top 10 productos</p>
                        <div className="space-y-2.5 overflow-y-auto max-h-[163px]">
                            {effectiveTop.map((p, i) => {
                                const barW = Math.round((p.qty / maxTopQty) * 100)
                                return (
                                    <div key={p.name} className="flex items-center gap-2.5">
                                        <span className="text-[11px] text-[#3D506A] w-4 shrink-0 text-right">{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-[12px] text-[#E4ECF7] truncate">{p.name}</span>
                                                <span className="text-[11px] text-[#3D506A] shrink-0 ml-2">{p.qty} uds</span>
                                            </div>
                                            <div className="h-1 rounded-full bg-[#1C2438]">
                                                <div className="h-full rounded-full bg-cyan-500/60" style={{ width: `${barW}%` }} />
                                            </div>
                                        </div>
                                        <span className="text-[12px] text-[#7A8FAA] shrink-0 w-20 text-right">{formatCurrency(p.revenue)}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Sales by hour */}
                <HourlySalesChart
                    data={effectiveHourly}
                    counts={hourlyCounts}
                    selectedHour={selectedHour}
                    onHourSelect={handleHourSelect}
                />

                {/* Recent sales + Stock alerts */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Recent sales */}
                    <div className="rounded-2xl bg-[#0F1623] border border-[#192030] p-4 flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[12px] font-semibold text-[#7A8FAA]">Ventas recientes</p>
                            <span className="text-[11px] text-[#3D506A]">{filteredSales.length} ventas</span>
                        </div>

                        {/* Filters row 1: search + time */}
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 relative">
                                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none" />
                                <input
                                    {...orderKb}
                                    placeholder="# orden o nombre..."
                                    className="w-full h-8 pl-7 pr-3 rounded-lg bg-[#101520] border border-[#1A2236] text-[13px] text-[#E4ECF7] placeholder-[#3D506A] outline-none focus:border-cyan-500/40 transition-colors"
                                />
                            </div>

                            <div className="relative flex items-center gap-1" ref={timePickerRef}>
                                <button
                                    onClick={() => setShowTimePicker(v => !v)}
                                    className={cn(
                                        'flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12px] font-medium transition-all cursor-pointer',
                                        timeActive || selectedHour !== null
                                            ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                                            : 'bg-[#101520] border-[#1A2236] text-[#3D506A] hover:text-[#7A8FAA]'
                                    )}
                                >
                                    <Clock size={12} />
                                    {timeActive
                                        ? `${HOURS[filterHour]}:${MINUTES[filterMinuteIdx]}`
                                        : selectedHour !== null
                                            ? `${String(selectedHour).padStart(2, '0')}:00`
                                            : 'Hora'}
                                </button>
                                {(timeActive || selectedHour !== null) && (
                                    <button
                                        onClick={() => { setTimeActive(false); setShowTimePicker(false); if (selectedHour !== null) handleHourSelect(null) }}
                                        className="w-5 h-5 rounded-full bg-[#1A2236] border border-[#1E2A40] text-[#3D506A] hover:text-[#E4ECF7] flex items-center justify-center transition-all cursor-pointer"
                                    >
                                        <X size={9} />
                                    </button>
                                )}

                                {showTimePicker && (
                                    <div className="absolute right-0 top-10 z-50 rounded-2xl bg-[#0F1623] border border-[#192030] shadow-2xl shadow-black/60 p-4 w-[160px]">
                                        <p className="text-[11px] text-[#3D506A] text-center mb-2">Desde las</p>
                                        <TimeWheelPicker
                                            hour={filterHour}
                                            minuteIndex={filterMinuteIdx}
                                            onHourChange={h => { setFilterHour(h); setTimeActive(true); setSelectedHour(null) }}
                                            onMinuteChange={mi => { setFilterMinuteIdx(mi); setTimeActive(true); setSelectedHour(null) }}
                                        />
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => { setTimeActive(false); setShowTimePicker(false) }}
                                                className="flex-1 h-7 rounded-lg bg-[#1A2236] border border-[#1E2A40] text-[11px] text-[#7A8FAA] hover:text-[#E4ECF7] transition-all cursor-pointer"
                                            >
                                                Limpiar
                                            </button>
                                            <button
                                                onClick={() => { setTimeActive(true); setShowTimePicker(false); setSelectedHour(null) }}
                                                className="flex-1 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-[11px] text-cyan-400 hover:bg-cyan-500/25 transition-all cursor-pointer"
                                            >
                                                Aplicar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Filters row 2: anuladas, modificadas, cajero */}
                        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                            <button
                                onClick={() => setShowAnuladas(v => !v)}
                                className={cn(
                                    'flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-medium transition-all cursor-pointer',
                                    showAnuladas
                                        ? 'bg-red-500/15 border-red-500/30 text-red-400'
                                        : 'bg-[#101520] border-[#1A2236] text-[#3D506A] hover:text-[#7A8FAA]'
                                )}
                            >
                                <Ban size={10} />
                                Anuladas
                            </button>
                            <button
                                onClick={() => setShowSoloModificadas(v => !v)}
                                className={cn(
                                    'flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-medium transition-all cursor-pointer',
                                    showSoloModificadas
                                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                        : 'bg-[#101520] border-[#1A2236] text-[#3D506A] hover:text-[#7A8FAA]'
                                )}
                            >
                                <Pencil size={10} />
                                Modificadas
                            </button>

                            <div className="relative" ref={cajeroMenuRef}>
                                <button
                                    onClick={() => setShowCajeroMenu(v => !v)}
                                    className={cn(
                                        'flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-medium transition-all cursor-pointer',
                                        filterCajero
                                            ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                                            : 'bg-[#101520] border-[#1A2236] text-[#3D506A] hover:text-[#7A8FAA]'
                                    )}
                                >
                                    <UserCircle2 size={10} />
                                    {filterCajero || 'Cajero'}
                                    <ChevronDown size={9} className="opacity-60" />
                                </button>
                                {showCajeroMenu && (
                                    <div className="absolute left-0 top-8 z-50 rounded-xl bg-[#0F1623] border border-[#192030] shadow-2xl shadow-black/60 py-1 min-w-[140px]">
                                        <button
                                            onClick={() => { setFilterCajero(''); setShowCajeroMenu(false) }}
                                            className={cn(
                                                'w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#131C2E] transition-colors cursor-pointer',
                                                !filterCajero ? 'text-blue-400 font-medium' : 'text-[#7A8FAA]'
                                            )}
                                        >
                                            Todos
                                        </button>
                                        {cajeros.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => { setFilterCajero(c); setShowCajeroMenu(false) }}
                                                className={cn(
                                                    'w-full text-left px-3 py-1.5 text-[11px] hover:bg-[#131C2E] transition-colors cursor-pointer truncate',
                                                    filterCajero === c ? 'text-blue-400 font-medium' : 'text-[#7A8FAA]'
                                                )}
                                            >
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {filteredSales.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-6 gap-2">
                                <Receipt size={24} className="text-[#3D506A]" />
                                <p className="text-[12px] text-[#3D506A]">Sin ventas en este período</p>
                            </div>
                        ) : (
                            <div className="space-y-0.5 overflow-y-auto max-h-[320px]">
                                {filteredSales.map((s: any) => {
                                    const isAnulada = s.status === 'ANULADA'
                                    const isModificada = !!s.originalSaleSnapshot || !!s.modifiedFromSaleId
                                    const cfg = PM_CONFIG[s.paymentMethod] ?? PM_CONFIG['EFECTIVO']
                                    const time = crTime(s.paidAt ?? s.date)
                                    const isSplit = s.notes?.startsWith('Crédito dividido') ?? false
                                    const clientName = s.client?.name ?? s.clientName ?? null
                                    const consumerName = s.consumerName ?? null
                                    const companyName = s.company?.name ?? s.companyName ?? null
                                    const invoicedTo = companyName ?? clientName ?? consumerName ?? null
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => setSelectedSale(s)}
                                            className={cn(
                                                'w-full flex items-center justify-between py-2 px-2 rounded-lg transition-colors cursor-pointer border group',
                                                isAnulada
                                                    ? 'opacity-50 bg-transparent border-transparent hover:bg-[#131C2E] hover:border-[#192030]'
                                                    : 'hover:bg-[#131C2E] border-transparent hover:border-[#192030]'
                                            )}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-[11px] text-[#3D506A] group-hover:text-[#4A6080] transition-colors shrink-0">#{s.saleNumber}</span>
                                                {isAnulada ? (
                                                    <span className="flex items-center gap-1 text-[11px] font-medium text-red-400/70 shrink-0">
                                                        <Ban size={11} />
                                                        Anulada
                                                    </span>
                                                ) : (
                                                    <span className={cn('flex items-center gap-1 text-[11px] font-medium shrink-0', cfg.color)}>
                                                        {cfg.icon}
                                                        {cfg.label}
                                                    </span>
                                                )}
                                                {isModificada && !isAnulada && (
                                                    <span className="flex items-center gap-0.5 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-md shrink-0">
                                                        <Pencil size={9} />
                                                        Mod.
                                                    </span>
                                                )}
                                                {isSplit && (
                                                    <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-md shrink-0">Dividido</span>
                                                )}
                                                {invoicedTo && (
                                                    <span className="text-[10px] text-[#3D506A] truncate">{invoicedTo}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="text-[11px] text-[#3D506A]">{time}</span>
                                                <span className={cn(
                                                    'text-[13px] font-semibold',
                                                    isAnulada ? 'text-[#3D506A] line-through' : 'text-[#E4ECF7]'
                                                )}>
                                                    {formatCurrency(s.total)}
                                                </span>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Stock alerts */}
                    <div className="rounded-2xl bg-[#0F1623] border border-[#192030] p-4">
                        <p className="text-[12px] font-semibold text-[#7A8FAA] mb-3">Alertas de inventario</p>
                        {lowStock.length === 0 && outOfStock.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-6 gap-2">
                                <PackageX size={24} className="text-[#3D506A]" />
                                <p className="text-[12px] text-[#3D506A]">Sin alertas de stock</p>
                            </div>
                        ) : (
                            <div className="space-y-1 max-h-[350px] overflow-y-auto">
                                {outOfStock.map(p => (
                                    <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-[#192030] last:border-0">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle size={12} className="text-red-400 shrink-0" />
                                            <span className="text-[12px] text-[#E4ECF7] truncate">{p.name}</span>
                                        </div>
                                        <span className="text-[11px] font-semibold text-red-400 shrink-0">Agotado</span>
                                    </div>
                                ))}
                                {lowStock.map(p => (
                                    <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-[#192030] last:border-0">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                                            <span className="text-[12px] text-[#E4ECF7] truncate">{p.name}</span>
                                        </div>
                                        <span className="text-[11px] font-semibold text-amber-400 shrink-0">{p.stockQty} / mín {p.minStock}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Cashier podium */}
                <CashierPodium
                    filteredSales={sales}
                    historicalRows={historicalLeaderboard}
                    periodLabel={periodLabel}
                />
            </div>
        </div>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function fmtHour(h: number) {
    if (h === 0)  return '12am'
    if (h < 12)   return `${h}am`
    if (h === 12) return '12pm'
    return `${h - 12}pm`
}

function HourlySalesChart({ data, counts, selectedHour, onHourSelect }: {
    data: number[]
    counts: number[]
    selectedHour: number | null
    onHourSelect: (h: number | null) => void
}) {
    const max = Math.max(...data, 1)
    const peakIdx = data.indexOf(Math.max(...data, 1))
    const activeHours = data.filter(v => v > 0).length

    const top3 = data
        .map((v, h) => ({ h, v }))
        .filter(x => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 3)

    return (
        <div className="rounded-2xl bg-[#0F1623] border border-[#192030] p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[12px] font-semibold text-[#7A8FAA]">Ventas por hora</p>
                    {selectedHour !== null ? (
                        <>
                            <button
                                onClick={() => onHourSelect(null)}
                                className="flex items-center gap-1 h-5 px-2 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-[10px] text-cyan-400 active:opacity-70 cursor-pointer"
                            >
                                {fmtHour(selectedHour)}
                                <X size={8} />
                            </button>
                            {data[selectedHour] > 0 && (
                                <span className="text-[12px] font-bold text-cyan-300">
                                    {formatCurrency(data[selectedHour])}
                                    {counts[selectedHour] > 0 && (
                                        <span className="text-[10px] font-normal text-[#7A8FAA] ml-1.5">
                                            · {counts[selectedHour]} venta{counts[selectedHour] !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </span>
                            )}
                        </>
                    ) : null}
                </div>
                {activeHours > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        <span className="text-[11px] text-cyan-400 font-medium">
                            Hora pico: {fmtHour(peakIdx)}
                        </span>
                    </div>
                )}
            </div>

            {/* Chart */}
            <div className="relative">
                {/* Bars */}
                <div className="flex items-end gap-px" style={{ height: '120px' }}>
                    {data.map((val, h) => {
                        const heightPct = (val / max) * 100
                        const isPeak = h === peakIdx && val > 0
                        const isTop3 = top3.some(x => x.h === h)
                        const isSelected = selectedHour === h
                        const isDimmed = selectedHour !== null && !isSelected
                        return (
                            <div
                                key={h}
                                className={cn('flex-1 flex items-end', val > 0 && 'cursor-pointer active:opacity-60')}
                                style={{ height: '100%' }}
                                onClick={() => val > 0 && onHourSelect(isSelected ? null : h)}
                            >
                                <div
                                    className={cn(
                                        'w-full rounded-t transition-all duration-150',
                                        val === 0
                                            ? 'bg-transparent'
                                            : isSelected
                                                ? 'bg-cyan-300'
                                                : isPeak
                                                    ? isDimmed ? 'bg-cyan-400/20' : 'bg-cyan-400'
                                                    : isTop3
                                                        ? isDimmed ? 'bg-cyan-500/20' : 'bg-cyan-500/70'
                                                        : isDimmed ? 'bg-cyan-500/10' : 'bg-cyan-500/30'
                                    )}
                                    style={{ height: val > 0 ? `${Math.max(heightPct, 3)}%` : '0%' }}
                                />
                            </div>
                        )
                    })}
                </div>

                {/* X-axis labels */}
                <div className="flex gap-px mt-1.5">
                    {data.map((_, h) => (
                        <div key={h} className="flex-1 text-center">
                            {(h % 4 === 0) && (
                                <span className={cn(
                                    'text-[9px]',
                                    selectedHour !== null && h <= selectedHour && selectedHour < h + 4
                                        ? 'text-cyan-400 font-semibold'
                                        : 'text-[#3D506A]'
                                )}>
                                    {fmtHour(h)}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Stats row */}
            <div className="mt-4 pt-4 border-t border-[#192030] grid grid-cols-3 gap-4">
                <div>
                    <p className="text-[11px] text-[#3D506A] mb-1">Hora pico</p>
                    <p className="text-[14px] font-bold text-cyan-400">
                        {activeHours > 0 ? fmtHour(peakIdx) : '—'}
                    </p>
                </div>
                <div>
                    <p className="text-[11px] text-[#3D506A] mb-1">Horas activas</p>
                    <p className="text-[14px] font-bold text-[#E4ECF7]">
                        {activeHours > 0 ? `${activeHours}h` : '—'}
                    </p>
                </div>
                <div>
                    <p className="text-[11px] text-[#3D506A] mb-1">Máx. por hora</p>
                    <p className="text-[14px] font-bold text-emerald-400">
                        {activeHours > 0 ? formatCurrency(max) : '—'}
                    </p>
                </div>
            </div>

            {/* Top 3 hours */}
            {top3.length > 0 && (
                <div className="mt-3 space-y-1.5">
                    {top3.map((x, i) => {
                        const pct = Math.round((x.v / max) * 100)
                        const medals = ['🥇', '🥈', '🥉']
                        const isThisSelected = selectedHour === x.h
                        return (
                            <div
                                key={x.h}
                                onClick={() => onHourSelect(isThisSelected ? null : x.h)}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg px-1 py-0.5 cursor-pointer active:opacity-70 transition-colors border',
                                    isThisSelected
                                        ? 'bg-cyan-500/10 border-cyan-500/20'
                                        : 'border-transparent'
                                )}
                            >
                                <span className="text-[12px] w-5 shrink-0">{medals[i]}</span>
                                <span className={cn(
                                    'text-[12px] w-12 shrink-0 font-medium',
                                    isThisSelected ? 'text-cyan-400' : 'text-[#7A8FAA]'
                                )}>
                                    {fmtHour(x.h)}
                                </span>
                                <div className="flex-1 h-1.5 rounded-full bg-[#1C2438]">
                                    <div
                                        className={cn('h-full rounded-full', isThisSelected ? 'bg-cyan-400' : 'bg-cyan-500/60')}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <span className={cn(
                                    'text-[12px] font-semibold w-24 text-right shrink-0',
                                    isThisSelected ? 'text-cyan-400' : 'text-[#E4ECF7]'
                                )}>
                                    {formatCurrency(x.v)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function StatCard({ label, value, sub, color, bg, icon }: {
    label: string; value: string; sub: string
    color: string; bg: string; icon: React.ReactNode
}) {
    return (
        <div className={cn('rounded-2xl p-4 border border-transparent', bg)}>
            <div className={cn('flex items-center gap-1.5 mb-2', color)}>
                {icon}
                <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
            </div>
            <p className={cn('text-[22px] font-bold', color)}>{value}</p>
            <p className="text-[11px] text-[#3D506A] mt-0.5">{sub}</p>
        </div>
    )
}
