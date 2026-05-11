import { useState, useRef, useEffect } from 'react'
import {
    RotateCcw, Search, ArrowLeftRight, Plus, Minus, X,
    PackageSearch, ChevronRight, Banknote, Clock,
} from 'lucide-react'
import { useProducts } from '@/hooks/useProducts'
import { useReturns, useCreateReturn, useReturnDetail, useRecentSales } from '@/hooks/useReturns'
import { useActiveRegister } from '@/hooks/useCashRegister'
import { getSaleByNumber } from '@/services/returns'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { toast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/atoms/EmptyState'
import { Button } from '@/components/atoms/Button'
import { BaseModal } from '@/components/modals/BaseModal'
import { cn, formatCurrency } from '@/lib/utils'
import type { Sale, Product, Employee, ReturnRecord } from '@/types'

interface ExchangeItem {
    uid: string
    productId: string
    product: Product
    quantity: number
    unitPrice: number
}

const TZ = 'America/Costa_Rica'

function fmtDateTime(d: Date): string {
    return d.toLocaleDateString('es-CR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) +
        ' · ' + d.toLocaleTimeString('es-CR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

export function ReturnsPage() {
    const [selectedEmployee] = useState<Employee | null>(() => {
        try { return JSON.parse(localStorage.getItem('pos_cashier_v2') ?? 'null') }
        catch { return null }
    })

    const { data: activeRegister = null } = useActiveRegister()
    const { data: products = [] } = useProducts()
    const { data: returns = [] } = useReturns()
    const createReturn = useCreateReturn()

    const [detailReturnId, setDetailReturnId] = useState<string | null>(null)
    const { data: detailReturn = null } = useReturnDetail(detailReturnId)

    // Search state
    const [searchInput, setSearchInput] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [foundSale, setFoundSale] = useState<Sale | null>(null)
    const [notFound, setNotFound] = useState(false)

    // Form state
    const [returnQtys, setReturnQtys] = useState<Record<string, number>>({})
    const [showExchange, setShowExchange] = useState(false)
    const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([])
    const [productSearch, setProductSearch] = useState('')
    const [notes, setNotes] = useState('')
    const [showSalePicker, setShowSalePicker] = useState(false)

    const searchInputRef = useRef('')
    searchInputRef.current = searchInput

    async function loadSaleByNumber(num: number) {
        if (!num) return
        setIsSearching(true)
        setNotFound(false)
        try {
            const sale = await getSaleByNumber(num)
            if (sale) {
                setFoundSale(sale)
                const init: Record<string, number> = {}
                sale.items.forEach(item => { init[item.id] = 0 })
                setReturnQtys(init)
                setShowExchange(false)
                setExchangeItems([])
                setNotes('')
            } else {
                setNotFound(true)
            }
        } finally {
            setIsSearching(false)
        }
    }

    const searchKb = useKeyboardInput(searchInput, (v) => { setSearchInput(v); setNotFound(false) }, { mode: 'numeric', onEnter: () => loadSaleByNumber(parseInt(searchInputRef.current.trim())) })

    const filteredProducts = products.filter(p =>
        productSearch
            ? p.name.toLowerCase().includes(productSearch.toLowerCase()) || (p.barcode ?? '').includes(productSearch)
            : true
    ).slice(0, 40)

    const returnedValue = foundSale?.items.reduce((sum, item) => sum + (returnQtys[item.id] ?? 0) * item.unitPrice, 0) ?? 0
    const exchangedValue = exchangeItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
    const netCash = returnedValue - exchangedValue
    const anySelected = Object.values(returnQtys).some(q => q > 0)

    function handleSearch() {
        loadSaleByNumber(parseInt(searchInputRef.current.trim()))
    }

    function handleClear() {
        setFoundSale(null)
        setSearchInput('')
        setReturnQtys({})
        setShowExchange(false)
        setExchangeItems([])
        setNotes('')
        setNotFound(false)
    }

    function addExchangeProduct(product: Product) {
        setExchangeItems(prev => {
            const existing = prev.find(i => i.productId === product.id)
            if (existing) return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i)
            return [...prev, { uid: crypto.randomUUID(), productId: product.id, product, quantity: 1, unitPrice: product.price }]
        })
    }

    function setExchangeQty(uid: string, qty: number) {
        if (qty <= 0) setExchangeItems(prev => prev.filter(i => i.uid !== uid))
        else setExchangeItems(prev => prev.map(i => i.uid === uid ? { ...i, quantity: qty } : i))
    }

    async function handleConfirm() {
        if (!foundSale || !anySelected) return
        const inItems = foundSale.items
            .filter(item => (returnQtys[item.id] ?? 0) > 0)
            .map(item => ({ productId: item.productId, quantity: returnQtys[item.id], unitPrice: item.unitPrice }))
        const outItems = showExchange
            ? exchangeItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice }))
            : []

        await createReturn.mutateAsync({
            originalSaleId: foundSale.id,
            originalSaleNumber: foundSale.saleNumber,
            type: outItems.length > 0 ? 'CAMBIO' : 'DEVOLUCION',
            cashRegisterId: activeRegister?.id ?? null,
            employeeName: selectedEmployee?.name ?? null,
            notes: notes || null,
            inItems,
            outItems,
        })
        toast.success('Devolución registrada correctamente')
        handleClear()
    }

    const confirmLabel = netCash === 0
        ? 'Confirmar cambio exacto'
        : netCash > 0
            ? `Devolver ${formatCurrency(netCash)} al cliente`
            : `Cobrar ${formatCurrency(Math.abs(netCash))} al cliente`

    return (
        <div className="flex h-full">
            {/* ── Left: Form ──────────────────────────────────────── */}
            <div className="flex flex-col w-[56%] min-w-0 border-r border-[#192030]">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-[#192030] shrink-0">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-500/10">
                        <RotateCcw size={18} className="text-rose-400" />
                    </div>
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E4ECF7]">Devoluciones</h1>
                        <p className="text-[12px] text-[#3D506A]">Devolución o cambio de producto</p>
                    </div>
                    {selectedEmployee && (
                        <span className="ml-auto text-[11px] text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-lg">
                            {selectedEmployee.name}
                        </span>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {!foundSale ? (
                        /* ── Search ── */
                        <div className="space-y-3">
                            <p className="text-[12px] font-semibold text-[#3D506A] uppercase tracking-wider">Buscar venta original</p>
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#3D506A] font-mono select-none">#</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="Número de venta"
                                        {...searchKb}
                                        className="w-full h-10 pl-7 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-rose-500/40 transition-colors"
                                    />
                                </div>
                                <button
                                    onClick={() => setShowSalePicker(true)}
                                    className="h-10 w-10 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] hover:text-[#E4ECF7] hover:border-[#243450] transition-all cursor-pointer flex items-center justify-center shrink-0"
                                    title="Ver historial de ventas"
                                >
                                    <Clock size={15} />
                                </button>
                                <Button variant="primary" onClick={handleSearch} disabled={!searchInput || isSearching} className="shrink-0 gap-1.5">
                                    <Search size={14} />
                                    {isSearching ? 'Buscando...' : 'Buscar'}
                                </Button>
                            </div>
                            {notFound && (
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                                    <PackageSearch size={14} className="text-red-400 shrink-0" />
                                    <p className="text-[12px] text-red-400">No se encontró la venta #{searchInput}</p>
                                </div>
                            )}
                            <div className="pt-4 text-center">
                                <p className="text-[12px] text-[#3D506A]">Ingresa el número de venta para ver los productos y procesar la devolución.</p>
                            </div>
                        </div>
                    ) : (
                        /* ── Review form ── */
                        <>
                            {/* Sale card */}
                            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#101520] border border-[#1E2A40]">
                                <div>
                                    <p className="text-[13px] font-semibold text-[#E4ECF7]">Venta #{foundSale.saleNumber}</p>
                                    <p className="text-[11px] text-[#3D506A]">
                                        {foundSale.date instanceof Date ? fmtDateTime(foundSale.date) : String(foundSale.date)}
                                        {' · '}{formatCurrency(foundSale.total)}
                                    </p>
                                </div>
                                <button onClick={handleClear} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Return items */}
                            <div>
                                <p className="text-[12px] font-semibold text-[#3D506A] uppercase tracking-wider mb-3">Productos a devolver</p>
                                <div className="space-y-2">
                                    {foundSale.items.map(item => {
                                        const qty = returnQtys[item.id] ?? 0
                                        return (
                                            <div key={item.id} className={cn(
                                                'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                                                qty > 0 ? 'bg-rose-500/5 border-rose-500/25' : 'bg-[#101520] border-[#192030]'
                                            )}>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-medium text-[#E4ECF7] truncate">{item.product?.name ?? item.productId}</p>
                                                    <p className="text-[11px] text-[#3D506A]">{formatCurrency(item.unitPrice)} × máx {item.quantity}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        onClick={() => setReturnQtys(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] ?? 0) - 1) }))}
                                                        disabled={qty === 0}
                                                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#1C2438] text-[#7A8FAA] hover:bg-rose-500/15 hover:text-rose-400 disabled:opacity-25 transition-all cursor-pointer"
                                                    >
                                                        <Minus size={12} />
                                                    </button>
                                                    <span className={cn('w-7 text-center text-[13px] font-mono font-semibold tabular-nums', qty > 0 ? 'text-rose-400' : 'text-[#3D506A]')}>{qty}</span>
                                                    <button
                                                        onClick={() => setReturnQtys(prev => ({ ...prev, [item.id]: Math.min(item.quantity, (prev[item.id] ?? 0) + 1) }))}
                                                        disabled={qty >= item.quantity}
                                                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#1C2438] text-[#7A8FAA] hover:bg-rose-500/15 hover:text-rose-400 disabled:opacity-25 transition-all cursor-pointer"
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                    <span className={cn('text-[12px] font-mono w-20 text-right', qty > 0 ? 'text-rose-400' : 'text-[#3D506A]')}>
                                                        {qty > 0 ? formatCurrency(qty * item.unitPrice) : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Exchange toggle */}
                            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#101520] border border-[#1E2A40]">
                                <div className="flex items-center gap-2">
                                    <ArrowLeftRight size={14} className="text-amber-400" />
                                    <span className="text-[13px] font-medium text-[#E4ECF7]">Cambiar por otro producto</span>
                                </div>
                                <button
                                    onClick={() => { setShowExchange(!showExchange); setExchangeItems([]); setProductSearch('') }}
                                    className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer', showExchange ? 'bg-amber-500' : 'bg-[#1C2438]')}
                                >
                                    <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', showExchange ? 'translate-x-4.5' : 'translate-x-0.5')} />
                                </button>
                            </div>

                            {/* Exchange picker */}
                            {showExchange && (
                                <div className="space-y-3">
                                    <p className="text-[12px] font-semibold text-[#3D506A] uppercase tracking-wider">Producto de cambio</p>

                                    {/* Selected exchange items */}
                                    {exchangeItems.length > 0 && (
                                        <div className="space-y-1.5">
                                            {exchangeItems.map(ei => (
                                                <div key={ei.uid} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                                                    <span className="flex-1 text-[13px] font-medium text-[#E4ECF7] truncate">{ei.product.name}</span>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <button onClick={() => setExchangeQty(ei.uid, ei.quantity - 1)} className="w-6 h-6 rounded-md bg-[#1C2438] text-[#7A8FAA] hover:text-amber-400 flex items-center justify-center cursor-pointer transition-colors">
                                                            <Minus size={11} />
                                                        </button>
                                                        <span className="w-6 text-center text-[13px] font-mono text-amber-400 tabular-nums">{ei.quantity}</span>
                                                        <button onClick={() => setExchangeQty(ei.uid, ei.quantity + 1)} className="w-6 h-6 rounded-md bg-[#1C2438] text-[#7A8FAA] hover:text-amber-400 flex items-center justify-center cursor-pointer transition-colors">
                                                            <Plus size={11} />
                                                        </button>
                                                        <span className="text-[12px] font-mono text-amber-400 w-20 text-right">{formatCurrency(ei.quantity * ei.unitPrice)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <input
                                        type="text"
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                        placeholder="Buscar producto..."
                                        className="w-full h-9 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/40 transition-colors"
                                    />
                                    <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                                        {filteredProducts.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => addExchangeProduct(p)}
                                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#101520] border border-[#192030] hover:border-amber-500/30 hover:bg-amber-500/5 text-left transition-all cursor-pointer"
                                            >
                                                <span className="text-[13px] text-[#E4ECF7] truncate">{p.name}</span>
                                                <span className="text-[12px] font-mono text-amber-400 shrink-0 ml-2">{formatCurrency(p.price)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Summary + confirm */}
                            {anySelected && (
                                <div className="rounded-xl bg-[#101520] border border-[#1E2A40] p-4 space-y-3">
                                    <div className="space-y-2 text-[13px]">
                                        <div className="flex justify-between">
                                            <span className="text-[#7A8FAA]">Productos devueltos</span>
                                            <span className="font-mono text-rose-400">{formatCurrency(returnedValue)}</span>
                                        </div>
                                        {showExchange && exchangedValue > 0 && (
                                            <div className="flex justify-between">
                                                <span className="text-[#7A8FAA]">Producto de cambio</span>
                                                <span className="font-mono text-amber-400">{formatCurrency(exchangedValue)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between border-t border-[#192030] pt-2">
                                            <span className="font-semibold text-[#CBD5E1]">
                                                {netCash === 0 ? 'Sin cambio de efectivo' : netCash > 0 ? 'Devolver al cliente' : 'Cobrar al cliente'}
                                            </span>
                                            <span className={cn('font-mono font-bold text-[15px]',
                                                netCash === 0 ? 'text-emerald-400' : netCash > 0 ? 'text-rose-400' : 'text-emerald-400'
                                            )}>
                                                {netCash === 0 ? 'Exacto' : formatCurrency(Math.abs(netCash))}
                                            </span>
                                        </div>
                                    </div>
                                    <textarea
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Notas (motivo de devolución...)"
                                        rows={2}
                                        className="w-full px-3 py-2 rounded-xl bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-rose-500/30 transition-colors resize-none"
                                    />
                                    <Button
                                        variant="danger"
                                        size="lg"
                                        className="w-full gap-2"
                                        onClick={handleConfirm}
                                        disabled={!anySelected || createReturn.isPending}
                                    >
                                        <RotateCcw size={14} />
                                        {createReturn.isPending ? 'Procesando...' : confirmLabel}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Right: History ───────────────────────────────────── */}
            <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-[#192030] shrink-0">
                    <p className="text-[13px] font-semibold text-[#E4ECF7]">Historial</p>
                    {returns.length > 0 && (
                        <span className="text-[11px] text-[#3D506A] bg-[#1C2438] px-2 py-0.5 rounded-md">{returns.length}</span>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto">
                    {returns.length === 0 ? (
                        <EmptyState
                            icon={<RotateCcw size={28} className="text-[#3D506A]" />}
                            title="Sin devoluciones"
                            description="Las devoluciones registradas aparecerán aquí"
                        />
                    ) : (
                        <div className="p-3 space-y-2">
                            {returns.map(ret => (
                                <ReturnHistoryRow key={ret.id} ret={ret} onClick={() => setDetailReturnId(ret.id)} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Detail modal */}
            <ReturnDetailModal
                ret={detailReturn}
                isOpen={detailReturnId !== null}
                onClose={() => setDetailReturnId(null)}
            />

            {/* Sale picker modal */}
            <SalePickerModal
                isOpen={showSalePicker}
                onClose={() => setShowSalePicker(false)}
                onSelect={(num) => { setSearchInput(String(num)); loadSaleByNumber(num) }}
            />
        </div>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SalePickerModal({ isOpen, onClose, onSelect }: {
    isOpen: boolean
    onClose: () => void
    onSelect: (saleNumber: number) => void
}) {
    const { data: recentSales = [], isLoading } = useRecentSales()
    const [filter, setFilter] = useState('')
    const filterKb = useKeyboardInput(filter, setFilter, { mode: 'numeric' })

    useEffect(() => {
        if (!isOpen) setFilter('')
    }, [isOpen])

    const filtered = recentSales.filter(s =>
        !filter || s.saleNumber.toString().includes(filter)
    )

    const PM_LABEL: Record<string, string> = { EFECTIVO: 'Efectivo', SINPE: 'SINPE', CREDITO: 'Crédito' }

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="Ventas recientes" description="Selecciona la venta para la devolución" width="max-w-md">
            <div className="space-y-3">
                <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Filtrar por número..."
                    {...filterKb}
                    className="w-full h-9 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-rose-500/40 transition-colors"
                />
                <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                    {isLoading ? (
                        <p className="text-center py-8 text-[12px] text-[#3D506A]">Cargando...</p>
                    ) : filtered.length === 0 ? (
                        <p className="text-center py-8 text-[12px] text-[#3D506A]">Sin ventas encontradas</p>
                    ) : filtered.map(s => (
                        <button
                            key={s.id}
                            onClick={() => { onSelect(s.saleNumber); onClose() }}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#101520] border border-[#192030] hover:border-rose-500/25 hover:bg-rose-500/5 text-left transition-all cursor-pointer"
                        >
                            <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-[#E4ECF7]">Venta #{s.saleNumber}</p>
                                <p className="text-[11px] text-[#3D506A]">
                                    {new Date(s.date).toLocaleDateString('es-CR', { timeZone: TZ, day: '2-digit', month: 'short' })}
                                    {' · '}{new Date(s.date).toLocaleTimeString('es-CR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}
                                    {' · '}{PM_LABEL[s.paymentMethod] ?? s.paymentMethod}
                                </p>
                            </div>
                            <span className="text-[13px] font-mono font-semibold text-emerald-400 shrink-0 ml-4">{formatCurrency(s.total)}</span>
                        </button>
                    ))}
                </div>
            </div>
        </BaseModal>
    )
}

function ReturnHistoryRow({ ret, onClick }: { ret: ReturnRecord; onClick: () => void }) {
    const isCambio = ret.type === 'CAMBIO'
    const dateStr = ret.date instanceof Date ? fmtDateTime(ret.date) : String(ret.date)

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0F1623] border border-[#192030] hover:bg-[#141C2E] hover:border-[#243450] transition-colors cursor-pointer text-left"
        >
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', isCambio ? 'bg-amber-500/10' : 'bg-rose-500/10')}>
                {isCambio
                    ? <ArrowLeftRight size={14} className="text-amber-400" />
                    : <RotateCcw size={14} className="text-rose-400" />
                }
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#E4ECF7]">Dev. #{ret.returnNumber}</span>
                    {ret.originalSaleNumber != null && (
                        <span className="text-[11px] text-[#3D506A]">← Venta #{ret.originalSaleNumber}</span>
                    )}
                </div>
                <p className="text-[11px] text-[#3D506A] mt-0.5">
                    {dateStr}
                    {ret.employeeName ? ` · ${ret.employeeName}` : ''}
                </p>
            </div>
            <div className="shrink-0 text-right">
                <p className={cn('text-[13px] font-mono font-semibold',
                    ret.netCash > 0 ? 'text-rose-400' : ret.netCash < 0 ? 'text-emerald-400' : 'text-[#7A8FAA]'
                )}>
                    {ret.netCash === 0 ? 'Exacto' : formatCurrency(Math.abs(ret.netCash))}
                </p>
                <p className="text-[10px] text-[#3D506A]">
                    {ret.netCash > 0 ? 'devuelto' : ret.netCash < 0 ? 'cobrado' : ''}
                </p>
            </div>
            <ChevronRight size={14} className="text-[#3D506A] shrink-0" />
        </button>
    )
}

function ReturnDetailModal({ ret, isOpen, onClose }: { ret: ReturnRecord | null; isOpen: boolean; onClose: () => void }) {
    const returnedItems = ret?.items.filter(i => i.direction === 'IN') ?? []
    const exchangedItems = ret?.items.filter(i => i.direction === 'OUT') ?? []

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={ret ? `Devolución #${ret.returnNumber}` : ''}
            description={ret?.date instanceof Date ? fmtDateTime(ret.date) : ''}
            width="max-w-md"
        >
            {ret && (
                <div className="space-y-4">
                    {/* Meta */}
                    <div className="grid grid-cols-3 gap-2 text-[12px]">
                        {ret.originalSaleNumber != null && (
                            <div className="px-3 py-2 rounded-lg bg-[#101520]">
                                <p className="text-[#3D506A] mb-0.5">Venta original</p>
                                <p className="text-[#E4ECF7] font-semibold">#{ret.originalSaleNumber}</p>
                            </div>
                        )}
                        <div className="px-3 py-2 rounded-lg bg-[#101520]">
                            <p className="text-[#3D506A] mb-0.5">Tipo</p>
                            <p className="text-[#E4ECF7] font-semibold">{ret.type === 'CAMBIO' ? 'Cambio' : 'Devolución'}</p>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-[#101520]">
                            <p className="text-[#3D506A] mb-0.5">Cajero</p>
                            <p className="text-[#E4ECF7] font-semibold">{ret.employeeName ?? '—'}</p>
                        </div>
                    </div>

                    {/* Returned items */}
                    {returnedItems.length > 0 && (
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-2">Devuelto por cliente</p>
                            <div className="space-y-1.5">
                                {returnedItems.map(item => (
                                    <div key={item.id} className="flex justify-between px-3 py-2.5 rounded-xl bg-rose-500/5 border border-rose-500/15">
                                        <span className="text-[13px] text-[#E4ECF7]">{item.productName} ×{item.quantity}</span>
                                        <span className="text-[13px] font-mono text-rose-400">{formatCurrency(item.subtotal)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Exchange items */}
                    {exchangedItems.length > 0 && (
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-2">Entregado al cliente</p>
                            <div className="space-y-1.5">
                                {exchangedItems.map(item => (
                                    <div key={item.id} className="flex justify-between px-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
                                        <span className="text-[13px] text-[#E4ECF7]">{item.productName} ×{item.quantity}</span>
                                        <span className="text-[13px] font-mono text-amber-400">{formatCurrency(item.subtotal)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Net */}
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#101520] border border-[#1E2A40]">
                        <div className="flex items-center gap-2">
                            <Banknote size={14} className={ret.netCash >= 0 ? 'text-rose-400' : 'text-emerald-400'} />
                            <span className="text-[13px] font-semibold text-[#7A8FAA]">
                                {ret.netCash === 0 ? 'Sin cambio de efectivo' : ret.netCash > 0 ? 'Devuelto al cliente' : 'Cobrado al cliente'}
                            </span>
                        </div>
                        <span className={cn('text-[16px] font-bold font-mono',
                            ret.netCash === 0 ? 'text-emerald-400' : ret.netCash > 0 ? 'text-rose-400' : 'text-emerald-400'
                        )}>
                            {ret.netCash === 0 ? 'Exacto' : formatCurrency(Math.abs(ret.netCash))}
                        </span>
                    </div>

                    {ret.notes && (
                        <p className="text-[12px] text-[#7A8FAA] italic px-1">{ret.notes}</p>
                    )}
                </div>
            )}
        </BaseModal>
    )
}
