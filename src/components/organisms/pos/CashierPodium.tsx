import React, { useState, useEffect, useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CashierStat {
    name: string
    total: number
    count: number
}

interface MonthData {
    month: string
    label: string
    top3: CashierStat[]
}

export interface CashierPodiumProps {
    filteredSales: any[]
    historicalRows: Array<{ notes: string | null; total: number; month: string }>
    periodLabel: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function extractCajero(notes: string | null | undefined): string {
    const idx = (notes ?? '').indexOf('Cajero:')
    if (idx === -1) return ''
    return (notes as string).slice(idx + 8).split('||')[0].trim()
}

function computeStats(sales: any[]): CashierStat[] {
    const map = new Map<string, CashierStat>()
    for (const s of sales) {
        if (s.status === 'ANULADA') continue
        const name = extractCajero(s.notes)
        if (!name) continue
        const prev = map.get(name) ?? { name, total: 0, count: 0 }
        map.set(name, { name, total: prev.total + s.total, count: prev.count + 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

function computeHistorical(rows: Array<{ notes: string | null; total: number; month: string }>): MonthData[] {
    const monthMap = new Map<string, Map<string, CashierStat>>()
    for (const row of rows) {
        const name = extractCajero(row.notes)
        if (!name) continue
        if (!monthMap.has(row.month)) monthMap.set(row.month, new Map())
        const cashiers = monthMap.get(row.month)!
        const prev = cashiers.get(name) ?? { name, total: 0, count: 0 }
        cashiers.set(name, { name, total: prev.total + row.total, count: prev.count + 1 })
    }
    const result: MonthData[] = []
    for (const [month, cashiers] of monthMap) {
        const top3 = Array.from(cashiers.values()).sort((a, b) => b.total - a.total).slice(0, 3)
        const [year, m] = month.split('-')
        result.push({ month, label: `${MONTH_NAMES[parseInt(m) - 1]} ${year}`, top3 })
    }
    return result.sort((a, b) => b.month.localeCompare(a.month))
}

// ── Podium bar config ─────────────────────────────────────────────────────────

const RANK_CFG = {
    1: {
        barH: 128,
        platform: 'bg-gradient-to-t from-amber-600/40 to-amber-400/15 border-amber-500/50',
        avatarRing: 'border-amber-500/70 shadow-[0_0_16px_rgba(251,191,36,0.35)]',
        avatarBg: 'bg-amber-500/20',
        initial: 'text-amber-300',
        name: 'text-amber-200',
        total: 'text-amber-400',
        count: 'text-amber-600/70',
        rank: 'text-amber-500 font-black text-[22px]',
        glow: '0 0 32px rgba(251,191,36,0.35), 0 0 64px rgba(251,191,36,0.12)',
        badge: '🥇',
        order: 2,
    },
    2: {
        barH: 88,
        platform: 'bg-gradient-to-t from-slate-500/30 to-slate-400/8 border-slate-500/35',
        avatarRing: 'border-slate-400/50',
        avatarBg: 'bg-slate-500/20',
        initial: 'text-slate-300',
        name: 'text-slate-200',
        total: 'text-slate-300',
        count: 'text-slate-500/70',
        rank: 'text-slate-400 font-black text-[18px]',
        glow: 'none',
        badge: '🥈',
        order: 1,
    },
    3: {
        barH: 60,
        platform: 'bg-gradient-to-t from-orange-700/30 to-orange-600/8 border-orange-700/30',
        avatarRing: 'border-orange-600/40',
        avatarBg: 'bg-orange-700/15',
        initial: 'text-orange-400',
        name: 'text-orange-300',
        total: 'text-orange-400',
        count: 'text-orange-700/70',
        rank: 'text-orange-600 font-black text-[16px]',
        glow: 'none',
        badge: '🥉',
        order: 3,
    },
}

// ── PodiumColumn ──────────────────────────────────────────────────────────────

function PodiumColumn({ stat, rank, visible, delay }: { stat: CashierStat; rank: 1|2|3; visible: boolean; delay: number }) {
    const cfg = RANK_CFG[rank]
    const initial = stat.name.charAt(0).toUpperCase()

    return (
        <div
            className="flex flex-col items-center"
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0px)' : 'translateY(24px)',
                transition: `opacity 0.55s ease ${delay}ms, transform 0.55s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
            }}
        >
            {/* Badge */}
            <span className="text-[20px] mb-1.5 leading-none">{cfg.badge}</span>

            {/* Avatar circle */}
            <div className={cn(
                'w-11 h-11 rounded-full border-2 flex items-center justify-center mb-1.5',
                cfg.avatarBg, cfg.avatarRing
            )}>
                <span className={cn('text-[16px] font-bold', cfg.initial)}>{initial}</span>
            </div>

            {/* Name */}
            <p className={cn('text-[12px] font-bold truncate max-w-[88px] text-center leading-tight mb-0.5', cfg.name)}>
                {stat.name}
            </p>

            {/* Total */}
            <p className={cn('text-[11px] font-semibold mb-0.5', cfg.total)}>
                {formatCurrency(stat.total)}
            </p>

            {/* Count */}
            <p className={cn('text-[10px] mb-2.5', cfg.count)}>
                {stat.count} {stat.count === 1 ? 'venta' : 'ventas'}
            </p>

            {/* Platform bar */}
            <div
                className={cn('w-24 rounded-t-2xl border flex items-end justify-center pb-2.5', cfg.platform)}
                style={{
                    height: visible ? cfg.barH : 0,
                    boxShadow: cfg.glow,
                    overflow: 'hidden',
                    transition: `height 0.75s cubic-bezier(0.34,1.56,0.64,1) ${delay + 80}ms`,
                }}
            >
                <span className={cfg.rank}>{rank}°</span>
            </div>
        </div>
    )
}

// ── EmptySlot ─────────────────────────────────────────────────────────────────

function EmptySlot({ rank }: { rank: 1|2|3 }) {
    const cfg = RANK_CFG[rank]
    return (
        <div className="flex flex-col items-center opacity-20">
            <span className="text-[20px] mb-1.5">{cfg.badge}</span>
            <div className={cn('w-11 h-11 rounded-full border-2 border-dashed mb-1.5', cfg.avatarBg, cfg.avatarRing)} />
            <p className="text-[11px] text-[#3D506A] mb-2.5">—</p>
            <div
                className={cn('w-24 rounded-t-2xl border border-dashed', cfg.platform)}
                style={{ height: cfg.barH }}
            />
        </div>
    )
}

// ── CashierPodium (main) ──────────────────────────────────────────────────────

export function CashierPodium({ filteredSales, historicalRows, periodLabel }: CashierPodiumProps) {
    const [visible, setVisible] = useState(false)

    const stats = useMemo(() => computeStats(filteredSales), [filteredSales])
    const history = useMemo(() => computeHistorical(historicalRows), [historicalRows])

    // Re-trigger animation when data changes
    useEffect(() => {
        setVisible(false)
        const t = setTimeout(() => setVisible(true), 80)
        return () => clearTimeout(t)
    }, [filteredSales])

    const [first, second, third] = [stats[0], stats[1], stats[2]]
    const hasAny = !!first

    return (
        <div className="rounded-2xl bg-[#0D1420] border border-[#192030] overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#192030]">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Trophy size={14} className="text-amber-400" />
                    </div>
                    <span className="text-[13px] font-semibold text-[#E4ECF7]">Podio de Cajeros</span>
                </div>
                <span className="text-[11px] text-[#3D506A]">{periodLabel}</span>
            </div>

            <div className="flex divide-x divide-[#192030]">

                {/* ── Podium visual ─────────────────────────────────────────── */}
                <div className="flex-1 px-6 pt-6 pb-4">
                    {!hasAny ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-10 text-[#2A3B5A]">
                            <Trophy size={28} className="opacity-20" />
                            <p className="text-[12px]">Sin datos de cajeros en este período</p>
                        </div>
                    ) : (
                        <div className="flex items-end justify-center gap-4">
                            {/* 2nd — left */}
                            {second
                                ? <PodiumColumn stat={second} rank={2} visible={visible} delay={250} />
                                : <EmptySlot rank={2} />
                            }

                            {/* 1st — center (tallest, last to appear for drama) */}
                            <PodiumColumn stat={first} rank={1} visible={visible} delay={450} />

                            {/* 3rd — right */}
                            {third
                                ? <PodiumColumn stat={third} rank={3} visible={visible} delay={50} />
                                : <EmptySlot rank={3} />
                            }
                        </div>
                    )}
                </div>

                {/* ── Historical months ──────────────────────────────────────── */}
                <div className="w-[230px] shrink-0 flex flex-col px-4 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3D506A] mb-3">
                        Meses anteriores
                    </p>

                    {history.length === 0 ? (
                        <div className="flex items-center justify-center flex-1 py-8">
                            <p className="text-[11px] text-[#2A3B5A] text-center">
                                Sin historial de<br />meses anteriores
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-y-auto space-y-4 max-h-[240px] pr-1">
                            {history.map(m => (
                                <div key={m.month}>
                                    <p className="text-[11px] font-semibold text-[#4A6080] mb-1.5">{m.label}</p>
                                    {m.top3.map((c, i) => (
                                        <div key={c.name} className="flex items-center gap-2 py-0.5">
                                            <span className="text-[13px] w-5 shrink-0 leading-none">
                                                {['🥇', '🥈', '🥉'][i]}
                                            </span>
                                            <span className="text-[11px] text-[#7A8FAA] flex-1 truncate">{c.name}</span>
                                            <span className="text-[10px] text-[#4A6080] shrink-0">
                                                {formatCurrency(c.total)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
