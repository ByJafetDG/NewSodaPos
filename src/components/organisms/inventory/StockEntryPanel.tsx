import { useState, useEffect, useCallback } from 'react'
import { ScanBarcode, ScanLine, Plus, Minus, X, ClipboardList, Package } from 'lucide-react'
import { Button } from '@/components/atoms/Button'
import { EmptyState } from '@/components/atoms/EmptyState'
import { SearchDropdown } from '@/components/molecules/SearchDropdown'
import { useKeyboardInput, useSuppressKeyboard } from '@/hooks/useKeyboardInput'
import { useStockEntryStore, type StockEntry } from '@/store/stockEntryStore'
import { cn, formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

interface StockEntryPanelProps {
    products: Product[]
    onConfirm: (entries: StockEntry[], notes: string) => void
    isPending?: boolean
    onProductNotFound?: (barcode: string) => void
}

export function StockEntryPanel({ products, onConfirm, isPending, onProductNotFound }: StockEntryPanelProps) {
    const { entries, notes, scanMode, addEntry, setQty, setNotes, setScanMode, clear } = useStockEntryStore()

    const [barcode, setBarcode] = useState('')
    const [errorMsg, setErrorMsg] = useState('')
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
            if (onProductNotFound) {
                onProductNotFound(q)
            } else {
                setErrorMsg(`No se encontró: "${q}"`)
                setTimeout(() => setErrorMsg(''), 2000)
            }
            return
        }
        setBarcode('')
        addEntry(product)
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
                    {errorMsg && (
                        <p className="mt-1.5 text-[12px] text-red-400">{errorMsg}</p>
                    )}
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
                        <div className="divide-y divide-[#0F1523]">
                            {entries.map(entry => (
                                <EntryRow
                                    key={entry.productId}
                                    entry={entry}
                                    onQtyChange={qty => setQty(entry.productId, qty)}
                                    onRemove={() => setQty(entry.productId, 0)}
                                />
                            ))}
                        </div>
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
}: {
    entry: StockEntry
    onQtyChange: (qty: number) => void
    onRemove: () => void
}) {
    const { product, qty } = entry
    const newStock = product.isInfinite ? product.stockQty : product.stockQty + qty

    return (
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#0D1117]/60 transition-colors">
            <div className="flex-1 min-w-0">
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
                    onClick={() => onQtyChange(qty - 1)}
                    className="w-8 h-8 rounded-lg bg-[#1C2438] border border-[#283A56] text-[#E4ECF7] flex items-center justify-center hover:bg-[#243050] transition-all cursor-pointer"
                >
                    <Minus size={12} />
                </button>
                <span className="w-8 text-center text-[14px] font-bold text-[#E4ECF7]">{qty}</span>
                <button
                    onClick={() => onQtyChange(qty + 1)}
                    className="w-8 h-8 rounded-lg bg-[#1C2438] border border-[#283A56] text-[#E4ECF7] flex items-center justify-center hover:bg-[#243050] transition-all cursor-pointer"
                >
                    <Plus size={12} />
                </button>
            </div>

            <button
                onClick={onRemove}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer shrink-0"
            >
                <X size={13} />
            </button>
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
