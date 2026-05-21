import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanBarcode, ScanLine, Plus, Minus, Trash2, ClipboardList, Package, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/atoms/Button'
import { EmptyState } from '@/components/atoms/EmptyState'
import { SearchDropdown } from '@/components/molecules/SearchDropdown'
import { useKeyboardInput, useSuppressKeyboard } from '@/hooks/useKeyboardInput'
import { useStockEntryStore, type StockEntry } from '@/store/stockEntryStore'
import { cn, formatCurrency } from '@/lib/utils'
import { sileo } from 'sileo'
import type { Product } from '@/types'

interface StockEntryPanelProps {
    products: Product[]
    onConfirm: (entries: StockEntry[], notes: string) => void
    isPending?: boolean
    onProductNotFound?: (barcode: string) => void
}

export function StockEntryPanel({ products, onConfirm, isPending, onProductNotFound }: StockEntryPanelProps) {
    const { entries, notes, scanMode, addEntry, setQty, moveEntry, setNotes, setScanMode, clear } = useStockEntryStore()

    const [barcode, setBarcode] = useState('')
    const [scanFlash, setScanFlash] = useState(false)
    const suppressKb = useSuppressKeyboard()

    const notesKb = useKeyboardInput(notes, setNotes)
    const barcodeKb = useKeyboardInput(barcode, setBarcode, {
        suppressRef: suppressKb,
        onEnter: handleBarcodeSubmit,
    })

    useEffect(() => {
        suppressKb.current = true
        setTimeout(() => barcodeKb.ref.current?.focus(), 50)
    }, [])

    useEffect(() => {
        if (!scanMode || !barcode.trim()) return
        const q = barcode.trim()
        const product = products.find(p => p.isActive && (p.barcode ?? '') === q)
        if (product) {
            addEntry(product)
            showAddedToast(product)
            setBarcode('')
            triggerScanFlash()
            suppressKb.current = true
            setTimeout(() => barcodeKb.ref.current?.focus(), 50)
        }
    }, [barcode, scanMode, products])

    function triggerScanFlash() {
        setScanFlash(true)
        setTimeout(() => setScanFlash(false), 500)
    }

    function showAddedToast(product: Product) {
        sileo.success({
            title: 'Agregado al ingreso',
            description: (
                <div style={{ marginTop: 6 }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.14) 0%, rgba(5,150,105,0.05) 100%)',
                        border: '1px solid rgba(16,185,129,0.24)', borderRadius: 10, padding: '10px 12px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 7px 2px rgba(16,185,129,0.6)', display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 9, color: '#10B981', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Ingresar mercadería</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#E4ECF7', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {product.name}
                        </div>
                    </div>
                </div>
            ),
            position: 'top-right',
        })
    }

    function handleBarcodeSubmit() {
        const q = barcode.trim()
        if (!q) return
        const product = products.find(p =>
            p.isActive && (
                (p.barcode ?? '') === q ||
                p.name.toLowerCase().includes(q.toLowerCase())
            )
        )
        if (!product) {
            setBarcode('')
            suppressKb.current = true
            setTimeout(() => barcodeKb.ref.current?.focus(), 80)
            sileo.action({
                title: 'Producto no encontrado',
                description: (
                    <div style={{ marginTop: 6 }}>
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(220,38,38,0.04) 100%)',
                            border: '1px solid rgba(239,68,68,0.22)', borderRadius: 10, padding: '10px 12px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 8px 2px rgba(239,68,68,0.6)', display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ fontSize: 9, color: '#EF4444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>No registrado</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#D1D5DB', fontFamily: 'monospace', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginBottom: 4 }}>
                                {q}
                            </div>
                            <div style={{ fontSize: 10, color: '#6B7280' }}>
                                Ningún producto activo tiene este código
                            </div>
                        </div>
                    </div>
                ),
                ...(onProductNotFound ? { button: { title: 'Agregar producto', onClick: () => onProductNotFound(q) } } : {}),
                position: 'top-right',
            })
            return
        }
        setBarcode('')
        addEntry(product)
        showAddedToast(product)
        if (scanMode) triggerScanFlash()
        suppressKb.current = true
        setTimeout(() => barcodeKb.ref.current?.focus(), 50)
    }

    function toggleScanMode() {
        const next = !scanMode
        setScanMode(next)
        if (next) {
            suppressKb.current = true
            setTimeout(() => barcodeKb.ref.current?.focus(), 50)
        }
    }

    const totalUnits = entries.reduce((s, e) => s + e.qty, 0)

    function handleConfirm() {
        if (entries.length === 0 || isPending) return
        onConfirm(entries, notes)
        clear()
        suppressKb.current = true
        setTimeout(() => barcodeKb.ref.current?.focus(), 50)
    }

    return (
        <div className="flex h-full gap-0">
            {/* Left: scan + entries */}
            <div className="flex-1 min-w-0 flex flex-col border-r border-[#192030]">
                {/* Barcode input */}
                <div className={cn(
                    "px-4 py-3 border-b shrink-0 transition-colors",
                    scanFlash ? "border-emerald-500/60 bg-emerald-500/5" : "border-[#192030]"
                )}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">
                            Escanear o buscar producto
                        </p>
                        {scanMode && (
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Escáner activo
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <ScanLine size={14} className={cn(
                                "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors",
                                scanMode ? "text-emerald-400" : "text-[#3D506A]"
                            )} />
                            <input
                                type="text"
                                {...barcodeKb}
                                placeholder={scanMode ? "Esperando escaneo..." : "Código de barras o nombre..."}
                                className={cn(
                                    "w-full h-10 pl-9 pr-3 rounded-xl bg-[#101520] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none transition-all",
                                    scanMode
                                        ? "border-2 border-emerald-500/40 focus:border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.08)]"
                                        : "border border-[#1E2A40] focus:border-orange-500/40"
                                )}
                            />
                            {!scanMode && (
                                <SearchDropdown
                                    products={products}
                                    search={barcode}
                                    allowOutOfStock
                                    onSelect={(product) => {
                                        addEntry(product)
                                        showAddedToast(product)
                                        setBarcode('')
                                        suppressKb.current = true
                                        setTimeout(() => barcodeKb.ref.current?.focus(), 50)
                                    }}
                                />
                            )}
                        </div>
                        <button
                            onClick={toggleScanMode}
                            className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0",
                                scanMode
                                    ? "bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25"
                                    : "bg-[#1C2438] border border-[#283A56] text-[#7A8FAA] hover:text-[#E4ECF7] hover:bg-[#243050]"
                            )}
                            title={scanMode ? "Desactivar modo escaneo" : "Activar modo escaneo"}
                        >
                            <ScanBarcode size={16} />
                        </button>
                        <Button variant="primary" size="md" onClick={handleBarcodeSubmit}>
                            <Plus size={14} />
                        </Button>
                    </div>
                </div>

                {/* Entry list */}
                <div className="flex-1 overflow-y-auto">
                    {entries.length === 0 ? (
                        <EmptyState
                            icon={<Package size={28} />}
                            title="Sin productos"
                            description="Escanea un código para agregar"
                        />
                    ) : (
                        <motion.div className="divide-y divide-[#0F1523]">
                            {entries.map((entry, i) => (
                                <motion.div key={entry.productId} layout transition={{ duration: 0.18, ease: 'easeInOut' }}>
                                    <EntryRow
                                        entry={entry}
                                        onQtyChange={qty => setQty(entry.productId, qty)}
                                        onRemove={() => setQty(entry.productId, 0)}
                                        onFocusScan={scanMode ? () => {
                                            suppressKb.current = true
                                            setTimeout(() => barcodeKb.ref.current?.focus(), 80)
                                        } : undefined}
                                        onMoveUp={entries.length > 1 && i > 0 ? () => moveEntry(entry.productId, 'up') : undefined}
                                        onMoveDown={entries.length > 1 && i < entries.length - 1 ? () => moveEntry(entry.productId, 'down') : undefined}
                                    />
                                </motion.div>
                            ))}
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Right: summary + confirm */}
            <div className="w-[260px] shrink-0 flex flex-col p-4 gap-4">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-3">
                        Resumen del ingreso
                    </p>
                    <div className="space-y-2">
                        <SummaryRow label="Productos" value={entries.length.toString()} />
                        <SummaryRow label="Total unidades" value={totalUnits.toString()} accent />
                    </div>
                </div>

                {/* Notes */}
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-2">
                        Observaciones
                    </p>
                    <input
                        type="text"
                        {...notesKb}
                        placeholder="Opcional..."
                        className="w-full h-9 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                    />
                </div>

                <div className="mt-auto">
                    <Button
                        variant="success"
                        size="lg"
                        className="w-full gap-2"
                        disabled={entries.length === 0}
                        loading={isPending}
                        onClick={handleConfirm}
                    >
                        <ClipboardList size={16} />
                        Confirmar ingreso
                    </Button>
                </div>
            </div>
        </div>
    )
}

function EntryRow({
    entry,
    onQtyChange,
    onRemove,
    onFocusScan,
    onMoveUp,
    onMoveDown,
}: {
    entry: StockEntry
    onQtyChange: (qty: number) => void
    onRemove: () => void
    onFocusScan?: () => void
    onMoveUp?: () => void
    onMoveDown?: () => void
}) {
    const { product, qty } = entry
    const newStock = product.isInfinite ? product.stockQty : product.stockQty + qty
    const [confirmingRemove, setConfirmingRemove] = useState(false)
    const hasReorder = onMoveUp !== undefined || onMoveDown !== undefined

    return (
        <div className="flex items-center gap-2 px-3 py-3 transition-colors">
            {/* Reorder handle */}
            {hasReorder && (
                <div className="flex flex-col shrink-0">
                    <button
                        onClick={onMoveUp}
                        disabled={!onMoveUp}
                        className={cn(
                            'w-6 h-6 rounded flex items-center justify-center transition-all',
                            onMoveUp ? 'text-[#3D506A] active:text-[#E4ECF7] active:bg-[#1C2438] cursor-pointer' : 'text-[#192030] cursor-default'
                        )}
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        onClick={onMoveDown}
                        disabled={!onMoveDown}
                        className={cn(
                            'w-6 h-6 rounded flex items-center justify-center transition-all',
                            onMoveDown ? 'text-[#3D506A] active:text-[#E4ECF7] active:bg-[#1C2438] cursor-pointer' : 'text-[#192030] cursor-default'
                        )}
                    >
                        <ChevronDown size={14} />
                    </button>
                </div>
            )}
            <div className="flex-1 min-w-0 pl-1">
                <p className="text-[13px] font-medium text-[#E4ECF7] truncate">{product.name}</p>
                {!product.isInfinite && (
                    <p className="text-[11px] text-[#3D506A] mt-0.5">
                        Stock: {product.stockQty}
                        <span className="text-orange-400 mx-1">→</span>
                        <span className="text-emerald-400">{newStock}</span>
                    </p>
                )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={() => { onQtyChange(qty - 1); onFocusScan?.() }}
                    className="w-8 h-8 rounded-lg bg-[#1C2438] border border-[#283A56] text-[#E4ECF7] flex items-center justify-center hover:bg-[#243050] transition-all cursor-pointer"
                >
                    <Minus size={12} />
                </button>
                <span className="w-8 text-center text-[14px] font-bold text-[#E4ECF7]">{qty}</span>
                <button
                    onClick={() => { onQtyChange(qty + 1); onFocusScan?.() }}
                    className="w-8 h-8 rounded-lg bg-[#1C2438] border border-[#283A56] text-[#E4ECF7] flex items-center justify-center hover:bg-[#243050] transition-all cursor-pointer"
                >
                    <Plus size={12} />
                </button>
            </div>

            {confirmingRemove ? (
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={() => setConfirmingRemove(false)}
                        className="h-7 px-2 rounded-lg text-[11px] text-[#7A8FAA] bg-[#1C2438] border border-[#283A56] cursor-pointer hover:bg-[#243050]"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            onRemove()
                            onFocusScan?.()
                            setConfirmingRemove(false)
                            sileo.success({
                                title: 'Producto retirado',
                                description: (
                                    <div style={{ marginTop: 6 }}>
                                        <div style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                            {product.name}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#4B5563', marginTop: 3 }}>Retirado del ingreso</div>
                                    </div>
                                ),
                                position: 'top-right',
                            })
                        }}
                        className="h-7 px-2 rounded-lg text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20"
                    >
                        Eliminar
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setConfirmingRemove(true)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer shrink-0"
                >
                    <Trash2 size={13} />
                </button>
            )}
        </div>
    )
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#101520] border border-[#1E2A40]">
            <span className="text-[12px] text-[#7A8FAA]">{label}</span>
            <span className={cn(
                'text-[14px] font-bold font-mono',
                accent ? 'text-orange-400' : 'text-[#E4ECF7]'
            )}>{value}</span>
        </div>
    )
}
