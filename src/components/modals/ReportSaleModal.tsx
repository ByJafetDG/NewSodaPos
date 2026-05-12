import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, CreditCard, Banknote, Smartphone, User, Clock } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

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
    SINPE:    { label: 'SINPE',    color: 'text-blue-400',    badge: 'bg-blue-500/10 border-blue-500/25',       icon: <Smartphone size={13} /> },
    CREDITO:  { label: 'Crédito', color: 'text-violet-400',  badge: 'bg-violet-500/10 border-violet-500/25',   icon: <CreditCard size={13} /> },
}

interface ReportSaleModalProps {
    sale: any | null
    onClose: () => void
}

export function ReportSaleModal({ sale, onClose }: ReportSaleModalProps) {
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
                            className="w-full max-w-[440px] rounded-2xl bg-[#0F1623] border border-[#192030] shadow-2xl shadow-black/60 overflow-hidden pointer-events-auto"
                            onClick={e => e.stopPropagation()}
                        >
                            <SaleHeader sale={sale} onClose={onClose} />
                            <SaleMeta sale={sale} />
                            <SaleItems items={sale.items ?? []} />
                            <SaleTotals sale={sale} />
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

function SaleHeader({ sale, onClose }: { sale: any; onClose: () => void }) {
    const cfg = PM_CONFIG[sale.paymentMethod] ?? PM_CONFIG.EFECTIVO
    const date = new Date(sale.date)
    const dateStr = date.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
    const timeStr = date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })
    const paidAt = sale.paidAt ? new Date(sale.paidAt) : null
    const paidDateStr = paidAt?.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
    const paidTimeStr = paidAt?.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })
    const showBothDates = paidAt && paidDateStr !== dateStr

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
                <span className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-medium', cfg.color, cfg.badge)}>
                    {cfg.icon}
                    {cfg.label}
                </span>
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
    const cashier = sale.notes?.startsWith('Cajero:')
        ? sale.notes.slice(8).trim()
        : (sale.notes ?? 'Sin cajero')
    const clientName = sale.clientName ?? sale.client?.name ?? null

    return (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-[#090C14] border-b border-[#192030]">
            <div className="flex items-center gap-1.5">
                <User size={11} className="text-[#3D506A]" />
                <span className="text-[11px] text-[#3D506A]">Cajero</span>
                <span className="text-[12px] text-[#7A8FAA]">{cashier}</span>
            </div>
            {sale.isCredit && clientName && (
                <>
                    <span className="w-px h-3 bg-[#1C2438] shrink-0" />
                    <div className="flex items-center gap-1.5">
                        <CreditCard size={11} className="text-violet-400" />
                        <span className="text-[12px] text-violet-400">{clientName}</span>
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
                <div key={i} className="flex items-center justify-between px-5 py-2.5 border-b border-[#192030] last:border-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[11px] text-[#3D506A] shrink-0 w-6 text-right">{item.quantity}×</span>
                        <MarqueeText text={item.product?.name ?? 'Producto'} className="text-[13px] text-[#E4ECF7] flex-1" />
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-3">
                        <span className="text-[11px] text-[#3D506A]">{formatCurrency(item.unitPrice)} c/u</span>
                        <span className="text-[13px] font-semibold text-[#E4ECF7] w-[72px] text-right">{formatCurrency(item.subtotal)}</span>
                    </div>
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
