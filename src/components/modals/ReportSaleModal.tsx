import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, CreditCard, Banknote, Smartphone, User, Clock, Printer, Receipt, Trash2, Pencil, AlertTriangle, GitCompare } from 'lucide-react'
import { cn, formatCurrency, crTime, crDateStr } from '@/lib/utils'
import { useBusinessConfig } from '@/hooks/useConfig'
import { sileo } from 'sileo'
import { getSaleDetails } from '@/services/sales'

function MarqueeText({ text, className }: { text: string; className?: string }) {
    const containerRef = useRef<HTMLDivElement>(null)
    const textRef = useRef<HTMLSpanElement>(null)
    const [offset, setOffset] = useState(0)

    useEffect(() => {
        if (!containerRef.current || !textRef.current) return
        const overflow = textRef.current.scrollWidth - containerRef.current.clientWidth
        setOffset(overflow > 0 ? overflow : 0)
    }, [text])

    return (
        <div ref={containerRef} className={cn('overflow-hidden', className)}>
            <span
                ref={textRef}
                className="inline-block whitespace-nowrap"
                style={offset > 0 ? {
                    animation: 'marquee 6s ease-in-out infinite alternate',
                    '--marquee-offset': `-${offset}px`,
                } as React.CSSProperties : undefined}
            >
                {text}
            </span>
        </div>
    )
}

const PM_CONFIG: Record<string, { label: string; color: string; badge: string; icon: React.ReactNode }> = {
    EFECTIVO: { label: 'Efectivo', color: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/25', icon: <Banknote size={13} /> },
    SINPE: { label: 'SINPE', color: 'text-blue-400', badge: 'bg-blue-500/10 border-blue-500/25', icon: <Smartphone size={13} /> },
    CREDITO: { label: 'Crédito', color: 'text-violet-400', badge: 'bg-violet-500/10 border-violet-500/25', icon: <CreditCard size={13} /> },
}

interface ReportSaleModalProps {
    sale: any | null
    onClose: () => void
    onVoid?: (saleId: string) => Promise<void>
    onModify?: (saleId: string) => Promise<void>
}

export function ReportSaleModal({ sale, onClose, onVoid, onModify }: ReportSaleModalProps) {
    const [tab, setTab] = useState<'detail' | 'compare'>('detail')
    const [originalSale, setOriginalSale] = useState<any | null>(null)
    const [loadingOriginal, setLoadingOriginal] = useState(false)

    useEffect(() => {
        if (!sale) { setTab('detail'); setOriginalSale(null) }
    }, [sale])

    const handleLoadOriginal = async () => {
        if (originalSale || !sale?.modifiedFromSaleId) return
        // Prefer embedded snapshot (original may have been hard-deleted)
        const snapshot = (sale as any).originalSaleSnapshot
        if (snapshot) {
            try { setOriginalSale(JSON.parse(snapshot)) } catch {}
            return
        }
        setLoadingOriginal(true)
        try {
            const data = await getSaleDetails(sale.modifiedFromSaleId)
            setOriginalSale(data)
        } catch {
            sileo.error({ title: 'No se pudo cargar la venta original' })
        } finally {
            setLoadingOriginal(false)
        }
    }

    const handleTabCompare = () => {
        setTab('compare')
        handleLoadOriginal()
    }

    const hasCompare = !!sale?.modifiedFromSaleId

    return (
        <AnimatePresence>
            {sale && (
                <>
                    <motion.div
                        key="overlay"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-[200]"
                        onClick={onClose}
                    />
                    <motion.div
                        key="modal"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                        className="fixed inset-0 z-[201] flex items-center justify-center p-6 pointer-events-none"
                    >
                        <div
                            className={cn(
                                'rounded-2xl bg-[#0F1623] border border-[#192030] shadow-2xl shadow-black/60 overflow-hidden pointer-events-auto',
                                tab === 'compare' ? 'w-full max-w-[820px]' : 'w-full max-w-[440px]'
                            )}
                            onClick={e => e.stopPropagation()}
                        >
                            <SaleHeader sale={sale} onClose={onClose} />

                            {/* Tab bar — only when sale was modified */}
                            {hasCompare && (
                                <div className="flex border-b border-[#192030]">
                                    <button
                                        onClick={() => setTab('detail')}
                                        className={cn(
                                            'flex-1 py-2 text-[12px] font-medium transition-all cursor-pointer',
                                            tab === 'detail' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                                        )}
                                    >
                                        Detalle
                                    </button>
                                    <button
                                        onClick={handleTabCompare}
                                        className={cn(
                                            'flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-all cursor-pointer',
                                            tab === 'compare' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                                        )}
                                    >
                                        <GitCompare size={12} />
                                        Comparativa
                                    </button>
                                </div>
                            )}

                            {tab === 'detail' ? (
                                <>
                                    <SaleMeta sale={sale} />
                                    <SaleItems items={sale.items ?? []} />
                                    <SaleTotals sale={sale} />
                                    {sale.status !== 'ANULADA' && (onVoid || onModify) && (
                                        <SaleActions sale={sale} onVoid={onVoid} onModify={onModify} onClose={onClose} />
                                    )}
                                </>
                            ) : (
                                <CompareView
                                    currentSale={sale}
                                    originalSale={originalSale}
                                    loading={loadingOriginal}
                                />
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

function SaleHeader({ sale, onClose }: { sale: any; onClose: () => void }) {
    const { data: config } = useBusinessConfig()
    const [printing, setPrinting] = useState(false)

    const cfg = PM_CONFIG[sale.paymentMethod] ?? PM_CONFIG.EFECTIVO
    const dateStr = crDateStr(sale.date)
    const timeStr = crTime(sale.date)
    const paidDateStr = sale.paidAt ? crDateStr(sale.paidAt) : null
    const paidTimeStr = sale.paidAt ? crTime(sale.paidAt) : null
    const showBothDates = sale.paidAt && paidDateStr !== dateStr

    const handleReprint = async () => {
        const printerPort = config?.printerPort || config?.printerModel || localStorage.getItem('pos_printer_port')
        if (!printerPort || !window.electronAPI?.printReceipt) {
            sileo.error({
                title: 'Sin impresora',
                description: (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 10, padding: '8px 12px',
                        }}>
                            <div style={{ fontSize: 11, color: '#FCA5A5', lineHeight: 1.4 }}>
                                No se detecta impresora configurada
                            </div>
                        </div>
                        <div style={{ fontSize: 10, color: '#6B7280' }}>
                            Ve a Ajustes → Impresora para configurarla
                        </div>
                    </div>
                ),
                position: 'top-right',
            })
            return
        }

        const tOpts = (() => { try { return JSON.parse(localStorage.getItem('pos_ticket_options') ?? '{}') } catch { return {} } })()
        const cajeroIdx = (sale.notes ?? '').indexOf('Cajero:')
        const cashier = cajeroIdx !== -1
            ? sale.notes!.slice(cajeroIdx + 8).split('||')[0].trim()
            : 'Sin cajero'

        setPrinting(true)
        try {
            await window.electronAPI.printReceipt(printerPort, {
                businessName: config?.name || 'Soda El Pelón',
                address: config?.address,
                phone: config?.phone,
                header: config?.ticketHeader || null,
                saleNumber: sale.saleNumber,
                date: sale.date,
                cashier: cashier,
                clientName: sale.clientName || sale.client?.name,
                clientCode: sale.clientCode || sale.client?.code,
                items: (sale.items ?? []).map((i: any) => ({
                    name: i.product?.name || 'Producto',
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    subtotal: i.subtotal,
                })),
                total: sale.total,
                paymentMethod: sale.paymentMethod,
                amountReceived: sale.amountReceived,
                change: sale.change,
                footer: config?.ticketFooter || '¡Gracias por su compra!',
                showCashier: tOpts.showCashier ?? true,
                showChange: tOpts.showChange ?? true,
                showHeader: tOpts.showHeader ?? true,
                showUnitPrice: tOpts.showUnitPrice ?? false,
                showDecimals: tOpts.showDecimals ?? true,
                ticketLogoUrl: config?.ticketLogoUrl || null,
                currencySymbol: tOpts.currencySymbol ?? '₡',
            })
            sileo.success({
                title: 'Ticket enviado',
                description: (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: '#10B981', fontWeight: 700 }}>✓</span>
                        <span style={{ fontSize: 11, color: '#7A8FAA' }}>Enviado a la impresora · #{sale.saleNumber}</span>
                    </div>
                ),
                position: 'top-right',
            })
        } catch (err) {
            console.error(err)
            sileo.error({
                title: 'Error de impresora',
                description: (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 10, padding: '8px 12px',
                        }}>
                            <div style={{ fontSize: 9, color: '#EF4444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Error</div>
                            <div style={{ fontSize: 11, color: '#FCA5A5', lineHeight: 1.4 }}>No se pudo enviar el ticket a la impresora</div>
                        </div>
                        <div style={{ fontSize: 10, color: '#6B7280' }}>
                            Verifica que la impresora esté encendida y conectada
                        </div>
                    </div>
                ),
                position: 'top-right',
            })
        } finally {
            setPrinting(false)
        }
    }

    return (
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#192030]">
            <div>
                <h2 className="text-[16px] font-semibold text-[#E4ECF7]">Venta #{sale.saleNumber}</h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock size={11} className="text-[#3D506A]" />
                    {showBothDates ? (
                        <span className="text-[11px] text-[#3D506A]">
                            Realizada {dateStr} · {timeStr}
                            <span className="mx-1 text-[#1C2438]">→</span>
                            <span className="text-emerald-400/80">Pagada {paidDateStr} · {paidTimeStr}</span>
                        </span>
                    ) : (
                        <span className="text-[11px] text-[#3D506A]">{dateStr} · {timeStr}</span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-medium mr-1', cfg.color, cfg.badge)}>
                    {cfg.icon}
                    {cfg.label}
                </span>

                <button
                    onClick={handleReprint}
                    disabled={printing}
                    title="Reimprimir ticket"
                    className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
                >
                    <Printer size={13} className={cn(printing && 'animate-pulse')} />
                </button>

                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg bg-[#1A2236] border border-[#1E2A40] text-[#3D506A] hover:text-[#E4ECF7] flex items-center justify-center transition-all cursor-pointer"
                >
                    <X size={13} />
                </button>
            </div>
        </div>
    )
}

function SaleMeta({ sale }: { sale: any }) {
    const cajeroIdx = (sale.notes ?? '').indexOf('Cajero:')
    const cashier = cajeroIdx !== -1
        ? sale.notes!.slice(cajeroIdx + 8).split('||')[0].trim()
        : 'Sin cajero'
    const isSplitCredit = sale.notes?.startsWith('Crédito dividido') ?? false
    const clientName = sale.clientName ?? sale.client?.name ?? null

    return (
        <div className="flex items-center gap-3 flex-wrap px-5 py-2.5 bg-[#090C14] border-b border-[#192030]">
            {isSplitCredit && (
                <span className="text-[10px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-md">
                    Dividido
                </span>
            )}
            <div className="flex items-center gap-1.5">
                <User size={11} className="text-[#3D506A]" />
                <span className="text-[11px] text-[#3D506A]">Cajero</span>
                <span className="text-[12px] text-[#7A8FAA]">{cashier}</span>
            </div>
            {clientName && (
                <>
                    <span className="w-px h-3 bg-[#1C2438] shrink-0" />
                    <div className="flex items-center gap-1.5">
                        {sale.isCredit
                            ? <CreditCard size={11} className="text-violet-400" />
                            : <Receipt size={11} className="text-blue-400" />
                        }
                        <span className={cn("text-[12px]", sale.isCredit ? "text-violet-400" : "text-blue-400")}>
                            {sale.isCredit ? clientName : `Facturado a: ${clientName}`}
                        </span>
                    </div>
                </>
            )}
        </div>
    )
}

function SaleItems({ items }: { items: any[] }) {
    return (
        <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            {items.length === 0 ? (
                <p className="text-[12px] text-[#3D506A] text-center py-6">Sin productos</p>
            ) : items.map((item, i) => (
                <div key={i} className="flex flex-col px-5 py-2.5 border-b border-[#192030] last:border-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[11px] text-[#3D506A] shrink-0 w-6 text-right">{item.quantity}×</span>
                            <MarqueeText text={item.product?.name ?? 'Producto'} className="text-[13px] text-[#E4ECF7] flex-1" />
                        </div>
                        <div className="flex items-center gap-4 shrink-0 ml-3">
                            <span className="text-[11px] text-[#3D506A]">{formatCurrency(item.unitPrice)} c/u</span>
                            <span className="text-[13px] font-semibold text-[#E4ECF7] w-[72px] text-right">{formatCurrency(item.subtotal)}</span>
                        </div>
                    </div>
                    {item.notes && (
                        <p className="text-[10px] text-orange-400/70 ml-8 mt-0.5">{item.notes}</p>
                    )}
                </div>
            ))}
        </div>
    )
}

function SaleTotals({ sale }: { sale: any }) {
    return (
        <div className="px-5 pt-3 pb-4 border-t border-[#192030] space-y-1.5 bg-[#090C14]">
            <div className="flex justify-between text-[12px]">
                <span className="text-[#3D506A]">Subtotal</span>
                <span className="text-[#7A8FAA]">{formatCurrency(sale.subtotal)}</span>
            </div>
            {sale.discount > 0 && (
                <div className="flex justify-between text-[12px]">
                    <span className="text-[#3D506A]">Descuento</span>
                    <span className="text-emerald-400">−{formatCurrency(sale.discount)}</span>
                </div>
            )}
            <div className="flex justify-between items-baseline pt-1.5 border-t border-[#192030]">
                <span className="text-[13px] text-[#7A8FAA] font-medium">Total</span>
                <span className="text-[20px] font-bold text-[#E4ECF7]">{formatCurrency(sale.total)}</span>
            </div>
            {sale.amountReceived != null && !sale.isCredit && sale.amountReceived > 0 && (
                <div className="flex justify-between text-[11px]">
                    <span className="text-[#3D506A]">Recibido</span>
                    <span className="text-[#7A8FAA]">{formatCurrency(sale.amountReceived)}</span>
                </div>
            )}
            {sale.change != null && sale.change > 0 && (
                <div className="flex justify-between text-[11px]">
                    <span className="text-[#3D506A]">Cambio</span>
                    <span className="text-[#7A8FAA]">{formatCurrency(sale.change)}</span>
                </div>
            )}
        </div>
    )
}

type DiffRow = { orig: any | null; curr: any | null; type: 'same' | 'changed' | 'added' | 'removed' }

function buildDiff(origItems: any[], currItems: any[]): DiffRow[] {
    const rows: DiffRow[] = []
    const currUsed = new Set<number>()
    const getName = (item: any) => item.product?.name ?? item.name ?? ''

    for (const origItem of origItems) {
        const origName = getName(origItem)
        let matchIdx = -1
        for (let i = 0; i < currItems.length; i++) {
            if (currUsed.has(i)) continue
            if (getName(currItems[i]) === origName) { matchIdx = i; break }
        }
        if (matchIdx === -1) {
            rows.push({ orig: origItem, curr: null, type: 'removed' })
        } else {
            currUsed.add(matchIdx)
            const c = currItems[matchIdx]
            const changed = origItem.quantity !== c.quantity || Math.abs(origItem.subtotal - c.subtotal) > 0.001
            rows.push({ orig: origItem, curr: c, type: changed ? 'changed' : 'same' })
        }
    }
    for (let i = 0; i < currItems.length; i++) {
        if (!currUsed.has(i)) rows.push({ orig: null, curr: currItems[i], type: 'added' })
    }
    return rows
}

function CompareView({ currentSale, originalSale, loading }: { currentSale: any; originalSale: any | null; loading: boolean }) {
    const cfgCurrent = PM_CONFIG[currentSale.paymentMethod] ?? PM_CONFIG.EFECTIVO
    const cfgOriginal = originalSale ? (PM_CONFIG[originalSale.paymentMethod] ?? PM_CONFIG.EFECTIVO) : null
    const rows = originalSale ? buildDiff(originalSale.items ?? [], currentSale.items ?? []) : []
    const getName = (item: any) => item.product?.name ?? item.name ?? 'Producto'

    return (
        <div className="flex flex-col min-h-[300px]">
            {/* Column headers */}
            <div className="flex border-b border-[#192030]">
                <div className="flex-1 px-4 py-2.5 bg-[#090C14] border-r border-[#192030]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Original</p>
                    {originalSale && (
                        <p className="text-[12px] text-[#7A8FAA] mt-0.5">
                            Venta #{originalSale.saleNumber}
                            <span className={cn('ml-2 text-[11px]', cfgOriginal?.color)}>{cfgOriginal?.label}</span>
                        </p>
                    )}
                </div>
                <div className="flex-1 px-4 py-2.5 bg-[#090C14]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/60">Modificada</p>
                    <p className="text-[12px] text-[#7A8FAA] mt-0.5">
                        Venta #{currentSale.saleNumber}
                        <span className={cn('ml-2 text-[11px]', cfgCurrent.color)}>{cfgCurrent.label}</span>
                    </p>
                </div>
            </div>

            {/* Body */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center py-8">
                    <p className="text-[11px] text-[#3D506A]">Cargando...</p>
                </div>
            ) : !originalSale ? (
                <div className="flex-1 flex items-center justify-center py-8">
                    <p className="text-[11px] text-[#3D506A]">No disponible</p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto">
                    {rows.map((row, i) => (
                        <div
                            key={i}
                            className={cn(
                                'flex border-b border-[#192030] last:border-0',
                                row.type === 'changed' ? 'bg-amber-500/5' :
                                row.type === 'added'   ? 'bg-emerald-500/5' :
                                row.type === 'removed' ? 'bg-red-500/5' : ''
                            )}
                        >
                            {/* Original cell */}
                            <div className="flex-1 flex items-center justify-between px-4 py-2.5 border-r border-[#192030]">
                                {row.orig ? (
                                    <>
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className="text-[11px] text-[#3D506A] shrink-0">{row.orig.quantity}×</span>
                                            <span className={cn('text-[12px] truncate',
                                                row.type === 'removed' ? 'text-red-400/60 line-through' : 'text-[#E4ECF7]'
                                            )}>
                                                {getName(row.orig)}
                                            </span>
                                        </div>
                                        <span className={cn('text-[12px] font-semibold ml-3 shrink-0',
                                            row.type === 'changed' ? 'text-[#3D506A] line-through' :
                                            row.type === 'removed' ? 'text-red-400/50' : 'text-[#E4ECF7]'
                                        )}>
                                            {formatCurrency(row.orig.subtotal)}
                                        </span>
                                    </>
                                ) : <span className="text-[12px] text-[#1C2438]">—</span>}
                            </div>
                            {/* Modified cell */}
                            <div className="flex-1 flex items-center justify-between px-4 py-2.5">
                                {row.curr ? (
                                    <>
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className="text-[11px] text-[#3D506A] shrink-0">{row.curr.quantity}×</span>
                                            <span className={cn('text-[12px] truncate',
                                                row.type === 'added' ? 'text-emerald-400' : 'text-[#E4ECF7]'
                                            )}>
                                                {getName(row.curr)}
                                            </span>
                                        </div>
                                        <span className={cn('text-[12px] font-semibold ml-3 shrink-0',
                                            row.type === 'changed' ? 'text-amber-400' :
                                            row.type === 'added'   ? 'text-emerald-400' : 'text-[#E4ECF7]'
                                        )}>
                                            {formatCurrency(row.curr.subtotal)}
                                        </span>
                                    </>
                                ) : <span className="text-[12px] text-[#1C2438]">—</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Totals */}
            <div className="flex border-t border-[#192030] bg-[#090C14]">
                <div className="flex-1 px-4 py-2.5 border-r border-[#192030] flex justify-between items-baseline">
                    <span className="text-[11px] text-[#3D506A]">Total</span>
                    <span className="text-[16px] font-bold text-[#E4ECF7]">{formatCurrency(originalSale?.total ?? 0)}</span>
                </div>
                <div className="flex-1 px-4 py-2.5 flex justify-between items-baseline">
                    <span className="text-[11px] text-[#3D506A]">Total</span>
                    <span className={cn(
                        'text-[16px] font-bold',
                        originalSale && currentSale.total !== originalSale.total ? 'text-amber-400' : 'text-[#E4ECF7]'
                    )}>
                        {formatCurrency(currentSale.total)}
                        {originalSale && currentSale.total !== originalSale.total && (
                            <span className="text-[12px] ml-1.5 opacity-60">
                                ({currentSale.total > originalSale.total ? '+' : ''}{formatCurrency(currentSale.total - originalSale.total)})
                            </span>
                        )}
                    </span>
                </div>
            </div>
        </div>
    )
}

function SaleActions({
    sale,
    onVoid,
    onModify,
    onClose,
}: {
    sale: any
    onVoid?: (id: string) => Promise<void>
    onModify?: (id: string) => Promise<void>
    onClose: () => void
}) {
    const [confirm, setConfirm] = useState<'void' | 'modify' | null>(null)
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        setLoading(true)
        try {
            if (confirm === 'void' && onVoid) await onVoid(sale.id)
            if (confirm === 'modify' && onModify) await onModify(sale.id)
            onClose()
        } catch (err: any) {
            sileo.error({ title: err?.message ?? 'Error al procesar' })
        } finally {
            setLoading(false)
            setConfirm(null)
        }
    }

    if (confirm) {
        const isModify = confirm === 'modify'
        return (
            <div className="px-5 py-3 border-t border-[#192030] bg-[#090C14]">
                <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle size={14} className={cn('shrink-0 mt-0.5', isModify ? 'text-amber-400' : 'text-red-400')} />
                    <div>
                        <p className="text-[12px] font-semibold text-[#E4ECF7]">
                            {isModify ? '¿Cargar en POS para editar?' : '¿Anular esta venta?'}
                        </p>
                        <p className="text-[11px] text-[#3D506A] mt-0.5">
                            {isModify
                                ? sale.isCredit
                                    ? 'La cuenta de crédito se eliminará y sus productos se cargarán en el POS.'
                                    : 'La venta se anulará y sus productos se cargarán en el POS.'
                                : 'El stock se revertirá. Esta acción no se puede deshacer.'}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setConfirm(null)}
                        disabled={loading}
                        className="flex-1 h-8 rounded-lg bg-[#1A2236] border border-[#1E2A40] text-[12px] text-[#7A8FAA] hover:text-[#E4ECF7] transition-all cursor-pointer disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className={cn(
                            'flex-1 h-8 rounded-lg border text-[12px] font-medium transition-all cursor-pointer disabled:opacity-50',
                            isModify
                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                                : 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25'
                        )}
                    >
                        {loading ? '...' : isModify ? 'Cargar en POS' : 'Anular venta'}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="px-5 py-3 border-t border-[#192030] bg-[#090C14] flex gap-2">
            {onVoid && (
                <button
                    onClick={() => setConfirm('void')}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[12px] text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                >
                    <Trash2 size={12} />
                    Anular
                </button>
            )}
            {onModify && (
                <button
                    onClick={() => setConfirm('modify')}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-400 hover:bg-amber-500/20 transition-all cursor-pointer"
                >
                    <Pencil size={12} />
                    Modificar
                </button>
            )}
        </div>
    )
}
