import React, { useState, useMemo, useEffect, useRef } from 'react'
import { motion, useAnimation, AnimatePresence } from 'framer-motion'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSpinsSinceLastPrize } from '@/services/sorteos'
import type { SorteoOption } from '@/types'

// ── Geometry ──────────────────────────────────────────────────────────────────

const SZ       = 320
const CX       = SZ / 2
const CY       = SZ / 2
const OUTER_R  = 140
const INNER_R  = 28
const LABEL_R  = 96
const DECO_R   = 160
const SPINS    = 8
const SPIN_MS  = 5200
const VISUAL_SLOTS = 20

const FILLER_COLORS = [
    '#0C1C3A', '#0E1A2E', '#121040',
    '#0A2218', '#1A0D38', '#102030',
]

// ── Types ─────────────────────────────────────────────────────────────────────

type SpinState = 'idle' | 'spinning' | 'result'

interface Segment {
    option: SorteoOption; weight: number
    startDeg: number; endDeg: number; midDeg: number
}
interface VisualSlot {
    option: SorteoOption
    startDeg: number; endDeg: number; midDeg: number
}

// ── Math ──────────────────────────────────────────────────────────────────────

function toXY(r: number, deg: number) {
    const rad = (deg - 90) * (Math.PI / 180)
    return { x: +(CX + r * Math.cos(rad)).toFixed(3), y: +(CY + r * Math.sin(rad)).toFixed(3) }
}

function wedge(startDeg: number, endDeg: number): string {
    const o1 = toXY(OUTER_R, startDeg); const o2 = toXY(OUTER_R, endDeg)
    const i2 = toXY(INNER_R, endDeg);   const i1 = toXY(INNER_R, startDeg)
    const lg = endDeg - startDeg > 180 ? 1 : 0
    return [
        `M ${o1.x} ${o1.y}`,
        `A ${OUTER_R} ${OUTER_R} 0 ${lg} 1 ${o2.x} ${o2.y}`,
        `L ${i2.x} ${i2.y}`,
        `A ${INNER_R} ${INNER_R} 0 ${lg} 0 ${i1.x} ${i1.y}`,
        'Z',
    ].join(' ')
}

// ── Probability engine (used by pickWinner) ───────────────────────────────────

function buildSegments(options: SorteoOption[]): Segment[] {
    const avail = options.filter(
        o => o.isFiller || o.quantityRemaining === null || (o.quantityRemaining ?? 1) > 0
    )
    if (!avail.length) return []
    const nonFillers = avail.filter(o => !o.isFiller)
    const fillers    = avail.filter(o => o.isFiller)
    const usedPct    = nonFillers.reduce((s, o) => s + o.baseProbability, 0)
    const fillerW    = fillers.length ? Math.max(0, 100 - usedPct) / fillers.length : 0
    const weighted   = avail.map(o => ({ option: o, weight: o.isFiller ? fillerW : o.baseProbability }))
    const total      = weighted.reduce((s, w) => s + w.weight, 0)
    let cur = 0
    return weighted.map(({ option, weight }) => {
        const frac = total > 0 ? weight / total : 1 / avail.length
        const deg  = frac * 360
        const seg: Segment = { option, weight, startDeg: cur, endDeg: cur + deg, midDeg: cur + deg / 2 }
        cur += deg
        return seg
    })
}

function pickWinner(segs: Segment[]): Segment {
    const total = segs.reduce((s, g) => s + g.weight, 0)
    if (!total) return segs[0]
    let r = Math.random() * total
    for (const seg of segs) { r -= seg.weight; if (r <= 0) return seg }
    return segs[segs.length - 1]
}

// ── Visual layout (display only, independent of probability) ──────────────────

function buildVisualSlots(options: SorteoOption[]): VisualSlot[] {
    const avail = options.filter(
        o => o.isFiller || o.quantityRemaining === null || (o.quantityRemaining ?? 1) > 0
    )
    if (!avail.length) return []

    const nonFillers = avail.filter(o => !o.isFiller)
    const fillerOpt  = avail.find(o => o.isFiller) ?? nonFillers[0]
    if (!nonFillers.length) return []

    const prizeSlots = nonFillers.map(o => ({
        option: o,
        n: Math.max(1, Math.round((o.baseProbability / 100) * VISUAL_SLOTS)),
    }))
    const totalPrize = prizeSlots.reduce((s, p) => s + p.n, 0)
    const total      = Math.max(VISUAL_SLOTS, totalPrize + nonFillers.length)

    const wheel: SorteoOption[] = new Array(total).fill(fillerOpt)
    const step = total / nonFillers.length
    prizeSlots.forEach((ps, i) => {
        const base = Math.round(i * step)
        for (let s = 0; s < ps.n; s++) wheel[(base + s) % total] = ps.option
    })

    const deg = 360 / total
    return wheel.map((option, i) => ({
        option,
        startDeg: i * deg,
        endDeg:   (i + 1) * deg,
        midDeg:   (i + 0.5) * deg,
    }))
}

// ── Audio ─────────────────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext | null {
    try {
        if (!_audioCtx || _audioCtx.state === 'closed') {
            _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        }
        if (_audioCtx.state === 'suspended') void _audioCtx.resume()
        return _audioCtx
    } catch { return null }
}

function playTick(volume = 0.3) {
    try {
        const ctx = getAudioCtx(); if (!ctx) return
        const len = Math.floor(ctx.sampleRate * 0.009)
        const buf = ctx.createBuffer(1, len, ctx.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.002))
        }
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'; filter.frequency.value = 2400; filter.Q.value = 1.8
        const src = ctx.createBufferSource(); src.buffer = buf
        const gain = ctx.createGain(); gain.gain.value = volume
        src.connect(filter); filter.connect(gain); gain.connect(ctx.destination); src.start()
    } catch {}
}

function playWin() {
    try {
        const ctx = getAudioCtx(); if (!ctx) return
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator(); const gain = ctx.createGain()
            const t = ctx.currentTime + i * 0.09
            osc.frequency.value = freq; osc.type = 'sine'
            gain.gain.setValueAtTime(0, t)
            gain.gain.linearRampToValueAtTime(0.32, t + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
            osc.connect(gain); gain.connect(ctx.destination)
            osc.start(t); osc.stop(t + 0.45)
        })
    } catch {}
}

function playLose() {
    try {
        const ctx = getAudioCtx(); if (!ctx) return
        const notes = [440, 370, 311, 261.63]
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator(); const gain = ctx.createGain()
            const t = ctx.currentTime + i * 0.11
            osc.frequency.value = freq; osc.type = 'sawtooth'
            gain.gain.setValueAtTime(0, t)
            gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38)
            osc.connect(gain); gain.connect(ctx.destination)
            osc.start(t); osc.stop(t + 0.38)
        })
    } catch {}
}

// ── Tick timing (cubic bezier inverse for easing [0.08, 0.82, 0.05, 1.0]) ────

function bezierY(s: number, y1: number, y2: number): number {
    return 3 * y1 * s * (1 - s) * (1 - s) + 3 * y2 * s * s * (1 - s) + s * s * s
}
function bezierX(s: number, x1: number, x2: number): number {
    return 3 * x1 * s * (1 - s) * (1 - s) + 3 * x2 * s * s * (1 - s) + s * s * s
}
function progressToTime(p: number): number {
    const [x1, y1, x2, y2] = [0.08, 0.82, 0.05, 1.0]
    let lo = 0, hi = 1
    for (let i = 0; i < 26; i++) {
        const s = (lo + hi) / 2
        if (bezierY(s, y1, y2) < p) lo = s; else hi = s
    }
    return bezierX((lo + hi) / 2, x1, x2)
}

function getTickTimestamps(totalMs: number, slots: number): number[] {
    const totalTicks  = SPINS * slots
    const MIN_INTERVAL = 42
    const times: number[] = []
    let lastTime = -Infinity

    for (let i = 0; i < totalTicks; i++) {
        const t = progressToTime(i / totalTicks) * totalMs
        if (t > lastTime + MIN_INTERVAL && t < totalMs - 60) {
            times.push(t)
            lastTime = t
        }
    }
    return times
}

// ── Confetti ──────────────────────────────────────────────────────────────────

const C_COLORS = ['#F59E0B','#EF4444','#3B82F6','#10B981','#8B5CF6','#EC4899','#06B6D4','#F97316']

function Confetti() {
    const pieces = useMemo(() =>
        Array.from({ length: 36 }, (_, i) => ({
            id: i, x: 10 + Math.random() * 80,
            color: C_COLORS[i % C_COLORS.length],
            w: 7 + Math.random() * 7, h: 5 + Math.random() * 5,
            delay: Math.random() * 0.5, dur: 1.3 + Math.random() * 0.9,
            wobble: (Math.random() - 0.5) * 50, rot: Math.random() * 360,
        })), [])
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
            {pieces.map(p => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-[2px]"
                    style={{ left: `${p.x}%`, top: '-8%', width: p.w, height: p.h, backgroundColor: p.color }}
                    animate={{ y: ['0%', '115%'], x: [0, p.wobble], rotate: [p.rot, p.rot + (Math.random() > .5 ? 720 : -720)], opacity: [1, 1, 0] }}
                    transition={{ duration: p.dur, delay: p.delay, ease: 'linear' }}
                />
            ))}
        </div>
    )
}

// ── Wheel SVG ─────────────────────────────────────────────────────────────────

function WheelSVG({
    slots, controls, winnerId, spinState, prizeRanks,
}: {
    slots: VisualSlot[]
    controls: ReturnType<typeof useAnimation>
    winnerId: string | null
    spinState: SpinState
    prizeRanks: Map<string, number>
}) {
    return (
        <motion.div animate={controls} style={{ transformOrigin: 'center', willChange: 'transform' }}>
            <svg viewBox={`0 0 ${SZ} ${SZ}`} width={SZ} height={SZ} style={{ display: 'block' }}>
                <defs>
                    <radialGradient id="rOuter" cx="50%" cy="50%" r="50%">
                        <stop offset="60%"  stopColor="#111827" />
                        <stop offset="100%" stopColor="#070B12" />
                    </radialGradient>
                    <radialGradient id="rCenter" cx="35%" cy="28%" r="70%">
                        <stop offset="0%"   stopColor="#5A6478" />
                        <stop offset="50%"  stopColor="#1E2535" />
                        <stop offset="100%" stopColor="#080C14" />
                    </radialGradient>
                    <radialGradient id="rSheen" cx="40%" cy="28%" r="62%">
                        <stop offset="0%"   stopColor="white" stopOpacity="0.12" />
                        <stop offset="50%"  stopColor="white" stopOpacity="0.03" />
                        <stop offset="100%" stopColor="white" stopOpacity="0"    />
                    </radialGradient>
                    <linearGradient id="gGold" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor="#FFE566" />
                        <stop offset="30%"  stopColor="#D4960A" />
                        <stop offset="60%"  stopColor="#FFD04A" />
                        <stop offset="100%" stopColor="#A86800" />
                    </linearGradient>
                    <linearGradient id="gGoldCenter" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor="#FFE07A" />
                        <stop offset="100%" stopColor="#B07010" />
                    </linearGradient>
                    <filter id="fGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="fGoldGlow" x="-60%" y="-60%" width="320%" height="320%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="fCenter">
                        <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.9)" />
                    </filter>
                </defs>

                {/* Outer dark backing */}
                <circle cx={CX} cy={CY} r={DECO_R} fill="url(#rOuter)" />

                {/* Segment wedges */}
                {slots.map((slot, i) => {
                    const isWinner = spinState === 'result' && slot.option.id === winnerId
                    const fillColor = slot.option.isFiller
                        ? FILLER_COLORS[i % FILLER_COLORS.length]
                        : (slot.option.color ?? '#4B5563')
                    return (
                        <motion.path
                            key={i}
                            d={wedge(slot.startDeg, slot.endDeg)}
                            fill={fillColor}
                            stroke="rgba(0,0,0,0.5)"
                            strokeWidth={1.2}
                            filter={isWinner ? 'url(#fGlow)' : undefined}
                            animate={isWinner ? { opacity: [1, 0.68, 1] } : { opacity: 1 }}
                            transition={isWinner
                                ? { duration: 0.6, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }
                                : {}
                            }
                        />
                    )
                })}

                {/* Light sheen overlay */}
                <circle cx={CX} cy={CY} r={OUTER_R} fill="url(#rSheen)" />

                {/* Thin inner edge of gold ring */}
                <circle cx={CX} cy={CY} r={OUTER_R} fill="none" stroke="rgba(255,210,60,0.35)" strokeWidth={1.5} />

                {/* Gold outer ring body */}
                <circle cx={CX} cy={CY} r={150} fill="none" stroke="url(#gGold)" strokeWidth={10} filter="url(#fGoldGlow)" />

                {/* Fine inner/outer accent lines on ring */}
                <circle cx={CX} cy={CY} r={144.5} fill="none" stroke="rgba(255,220,80,0.22)" strokeWidth={1} />
                <circle cx={CX} cy={CY} r={155.5} fill="none" stroke="rgba(255,220,80,0.22)" strokeWidth={1} />

                {/* Segment boundary jewels on gold ring */}
                {slots.map((slot, i) => {
                    const { x, y } = toXY(150, slot.startDeg)
                    return (
                        <g key={`j${i}`}>
                            <circle cx={x} cy={y} r={5.5} fill="#B87800" />
                            <circle cx={x} cy={y} r={4.5} fill="#FFD04A" filter="url(#fGoldGlow)" />
                            <circle cx={x} cy={y} r={2}   fill="#FFF5B0" />
                        </g>
                    )
                })}

                {/* Labels — ₡0 per filler slot, rank symbol per prize group */}
                {(() => {
                    const labels: React.ReactElement[] = []
                    let i = 0
                    while (i < slots.length) {
                        const slot = slots[i]
                        if (slot.option.isFiller) {
                            const { x, y } = toXY(LABEL_R, slot.midDeg)
                            const rot = (slot.midDeg > 90 && slot.midDeg < 270) ? slot.midDeg + 180 : slot.midDeg
                            labels.push(
                                <text key={`f${i}`} x={x} y={y}
                                    textAnchor="middle" dominantBaseline="central"
                                    fontSize={7} fontWeight="700" fill="rgba(255,255,255,0.22)"
                                    transform={`rotate(${rot},${x},${y})`}
                                    style={{ userSelect: 'none', fontFamily: 'system-ui,-apple-system,sans-serif' }}
                                >₡0</text>
                            )
                            i++
                        } else {
                            let j = i
                            while (j + 1 < slots.length && slots[j + 1].option.id === slot.option.id) j++
                            const gStart = slots[i].startDeg
                            const gEnd   = slots[j].endDeg
                            const gSpan  = gEnd - gStart
                            const gMid   = (gStart + gEnd) / 2
                            const rot    = (gMid > 90 && gMid < 270) ? gMid + 180 : gMid
                            const { x, y } = toXY(LABEL_R, gMid)
                            if (gSpan >= 6) {
                                const rank   = prizeRanks.get(slot.option.id) ?? 1
                                const symbol = rank === 1 ? '★' : `${rank}°`
                                const color  = rank === 1 ? '#FFE04A' : rank === 2 ? '#E0E8FF' : rank === 3 ? '#FFB060' : '#B0C8E0'
                                const size   = gSpan > 45 ? 20 : gSpan > 28 ? 16 : gSpan > 16 ? 14 : 11
                                labels.push(
                                    <text key={`p${i}`} x={x} y={y}
                                        textAnchor="middle" dominantBaseline="central"
                                        fontSize={size} fontWeight="900" fill={color}
                                        stroke="rgba(0,0,0,0.85)" strokeWidth={3.5} paintOrder="stroke"
                                        transform={`rotate(${rot},${x},${y})`}
                                        style={{ userSelect: 'none', fontFamily: 'system-ui,-apple-system,sans-serif' }}
                                    >{symbol}</text>
                                )
                            }
                            i = j + 1
                        }
                    }
                    return labels
                })()}

                {/* Center hub */}
                <circle cx={CX} cy={CY} r={INNER_R + 16} fill="rgba(0,0,0,0.65)" />
                <circle cx={CX} cy={CY} r={INNER_R + 13} fill="none" stroke="url(#gGoldCenter)" strokeWidth={3.5} filter="url(#fGoldGlow)" />
                <circle cx={CX} cy={CY} r={INNER_R + 9}  fill="rgba(8,12,20,0.9)" />
                <circle cx={CX} cy={CY} r={INNER_R} fill="url(#rCenter)" stroke="rgba(255,210,60,0.5)" strokeWidth={2} filter="url(#fCenter)" />
                <circle cx={CX} cy={CY} r={14} fill="rgba(255,255,255,0.06)" />
                <circle cx={CX} cy={CY} r={9}  fill="rgba(255,255,255,0.10)" />
                <circle cx={CX} cy={CY} r={4.5} fill="rgba(255,255,255,0.20)" />
                <circle cx={CX - 4} cy={CY - 4} r={3} fill="rgba(255,255,255,0.30)" />
            </svg>
        </motion.div>
    )
}

// ── Pointer ───────────────────────────────────────────────────────────────────

function Pointer() {
    return (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20" style={{ marginTop: -22 }}>
            <svg width="32" height="32" viewBox="0 0 32 32">
                <defs>
                    <linearGradient id="pGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%"   stopColor="#FFF0A0" />
                        <stop offset="50%"  stopColor="#FFB800" />
                        <stop offset="100%" stopColor="#C07000" />
                    </linearGradient>
                    <filter id="pGlow" x="-80%" y="-80%" width="360%" height="360%">
                        <feGaussianBlur stdDeviation="3" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>
                {/* Shadow */}
                <polygon points="16,30 3,6 29,6" fill="rgba(0,0,0,0.5)" transform="translate(1,2)" />
                {/* Body */}
                <polygon points="16,30 3,6 29,6" fill="url(#pGrad)" filter="url(#pGlow)" />
                {/* Inner highlight */}
                <polygon points="16,24 8,9 24,9" fill="rgba(255,255,255,0.18)" />
                {/* Tip shine */}
                <circle cx="16" cy="8" r="3.5" fill="rgba(255,245,160,0.6)" />
            </svg>
        </div>
    )
}

// ── Prize legend ──────────────────────────────────────────────────────────────

const RANK_SYMBOL = (r: number) => r === 1 ? '★' : `${r}°`
const RANK_COLOR  = (r: number) => r === 1 ? '#FFE04A' : r === 2 ? '#B8C8FF' : r === 3 ? '#FFB060' : '#90A8C0'

function PrizeLegend({ options, prizeRanks }: { options: SorteoOption[]; prizeRanks: Map<string, number> }) {
    const prizes = useMemo(() =>
        options.filter(o => !o.isFiller).sort((a, b) =>
            (prizeRanks.get(a.id) ?? 99) - (prizeRanks.get(b.id) ?? 99)
        ), [options, prizeRanks])
    if (!prizes.length) return null
    return (
        <div className="px-4 pb-3">
            <div className="rounded-xl border border-[#1A2230] bg-[#090E18] px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.14em] font-bold mb-1.5" style={{ color: '#8A6A10' }}>Premios</p>
                <div className="space-y-1">
                    {prizes.map(o => {
                        const rank = prizeRanks.get(o.id) ?? 1
                        return (
                            <div key={o.id} className="flex items-center gap-2 min-w-0">
                                <span className="text-[11px] font-black w-5 flex-shrink-0 text-center" style={{ color: RANK_COLOR(rank) }}>
                                    {RANK_SYMBOL(rank)}
                                </span>
                                <div
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-black/40"
                                    style={{ backgroundColor: o.color ?? '#6B7280' }}
                                />
                                <span className="text-[12px] font-bold text-[#D8E4F4] truncate flex-1">{o.label}</span>
                                {o.description && (
                                    <span className="text-[11px] text-[#4A6080] flex-shrink-0 truncate max-w-[120px]">{o.description}</span>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ winner, onClose, onRetry, canRetry, spinsLeft }: {
    winner: SorteoOption; onClose: () => void; onRetry: () => void
    canRetry: boolean; spinsLeft: number
}) {
    const isReal    = !winner.isFiller
    const remaining = winner.quantityRemaining !== null ? Math.max(0, (winner.quantityRemaining ?? 0) - 1) : null

    return (
        <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.25 }}
            className="space-y-4"
        >
            <div className="text-center">
                <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.4 }}
                    className={cn('w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3', isReal ? 'shadow-[0_0_30px_rgba(245,158,11,0.5)]' : '')}
                    style={{ backgroundColor: (winner.color ?? '') + '25', border: `2px solid ${winner.color ?? ''}40` }}
                >
                    {isReal
                        ? <Trophy size={30} style={{ color: winner.color ?? undefined }} />
                        : <span className="text-3xl select-none">😔</span>
                    }
                </motion.div>
                <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#3D506A] mb-1">
                    {isReal ? '¡Ganaste!' : 'Resultado'}
                </p>
                <p className="text-[22px] font-black leading-tight" style={{ color: isReal ? (winner.color ?? undefined) : '#7A8FAA' }}>
                    {winner.label}
                </p>
                {winner.description && (
                    <p className="text-[14px] text-[#7A8FAA] mt-1 font-medium">{winner.description}</p>
                )}
                {isReal && remaining !== null && (
                    <motion.p
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                        className="text-[11px] text-[#3D506A] mt-2"
                    >
                        {remaining === 0 ? 'Último de este premio' : `Quedan ${remaining} de este premio`}
                    </motion.p>
                )}
            </div>
            <div className="flex gap-2">
                {canRetry && (
                    <button
                        onClick={onRetry}
                        className="flex-1 h-11 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] text-[13px] font-medium hover:bg-[#1C2438] hover:text-[#E4ECF7] transition-all cursor-pointer"
                    >
                        Girar de nuevo{spinsLeft > 1 ? ` · ${spinsLeft}` : ''}
                    </button>
                )}
                <button
                    onClick={onClose}
                    className={cn('h-11 rounded-xl text-[13px] font-bold transition-all cursor-pointer',
                        canRetry ? 'flex-1' : 'w-full',
                        isReal
                            ? 'text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_28px_rgba(245,158,11,0.6)]'
                            : 'bg-[#1C2438] text-[#E4ECF7] hover:bg-[#283A56]'
                    )}
                    style={isReal ? { backgroundColor: winner.color ?? undefined } : {}}
                >
                    {isReal ? 'Entregar premio' : 'Continuar'}
                </button>
            </div>
        </motion.div>
    )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
    isOpen: boolean
    onClose: () => void
    sorteoName: string
    options: SorteoOption[]
    sorteoId?: string
    minSpinsBetweenPrizes?: number
    maxSpins?: number
    onResult?: (resultOptionId: string, didParticipate: boolean) => void
    onDecline?: () => void
}

export function RuletaModal({ isOpen, onClose, sorteoName, options, sorteoId, minSpinsBetweenPrizes = 0, maxSpins = 1, onResult, onDecline }: Props) {
    const controls = useAnimation()
    const segs         = useMemo(() => buildSegments(options), [options])
    const visualSlots  = useMemo(() => buildVisualSlots(options), [options])
    const prizeRanks   = useMemo(() => {
        const prizes = options.filter(o => !o.isFiller)
        const sorted = [...prizes].sort((a, b) => a.baseProbability - b.baseProbability || a.sortOrder - b.sortOrder)
        const map = new Map<string, number>()
        sorted.forEach((o, idx) => map.set(o.id, idx + 1))
        return map
    }, [options])

    const [spinState, setSpinState]     = useState<SpinState>('idle')
    const [winner, setWinner]           = useState<SorteoOption | null>(null)
    const [winnerId, setWinnerId]       = useState<string | null>(null)
    const [showConfetti, setShowConfetti] = useState(false)
    const [rotation, setRotation]       = useState(0)
    const [zoomed, setZoomed]           = useState(false)
    const [spinsUsed, setSpinsUsed]     = useState(0)

    const spinsSinceLastPrize = useRef<number>(999)
    const tickTimeoutsRef     = useRef<ReturnType<typeof setTimeout>[]>([])
    const zoomTimeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!sorteoId || minSpinsBetweenPrizes <= 0) return
        getSpinsSinceLastPrize(sorteoId).then(n => { spinsSinceLastPrize.current = n })
    }, [sorteoId, minSpinsBetweenPrizes])

    useEffect(() => {
        return () => { clearTicks(); clearZoom() }
    }, []) // eslint-disable-line

    function clearTicks() {
        tickTimeoutsRef.current.forEach(clearTimeout)
        tickTimeoutsRef.current = []
    }
    function clearZoom() {
        if (zoomTimeoutRef.current !== null) { clearTimeout(zoomTimeoutRef.current); zoomTimeoutRef.current = null }
    }

    async function handleSpin() {
        if (spinState !== 'idle' || !segs.length || !visualSlots.length) return

        // 1. Pick winner by probability
        let winnerSeg = pickWinner(segs)

        // 2. Cooldown override
        if (minSpinsBetweenPrizes > 0 && !winnerSeg.option.isFiller) {
            if (spinsSinceLastPrize.current < minSpinsBetweenPrizes) {
                const filler = segs.find(s => s.option.isFiller)
                if (filler) winnerSeg = filler
            }
        }

        // 3. Find a visual slot to animate to
        const matches     = visualSlots.filter(s => s.option.id === winnerSeg.option.id)
        const targetSlot  = matches[Math.floor(Math.random() * matches.length)] ?? visualSlots[0]

        // 4. Schedule tick sounds
        clearTicks()
        const ticks = getTickTimestamps(SPIN_MS, visualSlots.length)
        tickTimeoutsRef.current = ticks.map((t, i) =>
            setTimeout(() => playTick(i > ticks.length * 0.72 ? 0.55 : 0.25), t)
        )

        // 5. Schedule zoom
        clearZoom()
        zoomTimeoutRef.current = setTimeout(() => setZoomed(true), SPIN_MS * 0.50)

        // 6. Compute rotation
        const half   = (targetSlot.endDeg - targetSlot.startDeg) * 0.35
        const jitter = (Math.random() * 2 - 1) * half
        const landAt = (720 - targetSlot.midDeg - jitter + 360) % 360
        const prev   = rotation % 360
        const delta  = ((landAt - prev) + 360) % 360
        const target = rotation + SPINS * 360 + delta

        setSpinState('spinning')
        setWinner(null)
        setWinnerId(null)
        setShowConfetti(false)

        await controls.start({
            rotate: target,
            transition: { duration: SPIN_MS / 1000, ease: [0.08, 0.82, 0.05, 1.0] },
        })

        playTick(0.8) // landing click

        // 7. Update cooldown counter
        if (winnerSeg.option.isFiller) {
            spinsSinceLastPrize.current += 1
        } else {
            spinsSinceLastPrize.current = 0
        }

        setZoomed(false)
        setRotation(target)
        setWinner(winnerSeg.option)
        setWinnerId(winnerSeg.option.id)
        setSpinsUsed(prev => prev + 1)
        setSpinState('result')

        if (!winnerSeg.option.isFiller) {
            setTimeout(() => { setShowConfetti(true); playWin() }, 350)
        } else {
            setTimeout(() => playLose(), 200)
        }

        onResult?.(winnerSeg.option.id, true)
    }

    function handleRetry() {
        clearTicks(); clearZoom()
        setZoomed(false)
        setSpinState('idle')
        setWinner(null)
        setWinnerId(null)
        setShowConfetti(false)
    }

    function handleClose() {
        clearTicks(); clearZoom()
        setZoomed(false)
        if (spinState === 'idle') onDecline?.()
        setSpinState('idle')
        setWinner(null)
        setWinnerId(null)
        setShowConfetti(false)
        setRotation(0)
        setSpinsUsed(0)
        controls.set({ rotate: 0 })
        onClose()
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                key="backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                onClick={spinState === 'idle' ? handleClose : undefined}
            />

            <motion.div
                key="panel"
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 12 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="fixed z-50 inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-[380px] px-4"
            >
                <div className="relative bg-[#080C14] border border-[#2A1E00] rounded-2xl shadow-2xl overflow-hidden" style={{ boxShadow: '0 0 60px rgba(150,90,0,0.15), 0 20px 60px rgba(0,0,0,0.8)' }}>
                    {showConfetti && <Confetti />}

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 pt-5 pb-3">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.14em] font-bold" style={{ color: '#C8900A' }}>Sorteo</p>
                            <h2 className="text-[15px] font-bold text-[#F0E8CC] leading-tight">{sorteoName}</h2>
                        </div>
                        <button
                            onClick={handleClose}
                            disabled={spinState === 'spinning'}
                            className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </button>
                    </div>

                    {/* Wheel area */}
                    <div className="px-5 pb-2 overflow-hidden" style={{ height: SZ + 20 }}>
                        <div
                            className="relative mx-auto"
                            style={{
                                width: SZ, height: SZ, marginTop: 14,
                                filter: spinState === 'spinning'
                                    ? 'drop-shadow(0 0 30px rgba(220,140,10,0.5)) drop-shadow(0 0 60px rgba(180,100,0,0.25))'
                                    : spinState === 'result' && winner && !winner.isFiller
                                        ? `drop-shadow(0 0 35px ${winner.color}80) drop-shadow(0 0 70px ${winner.color}35)`
                                        : 'drop-shadow(0 0 20px rgba(160,110,0,0.3)) drop-shadow(0 0 40px rgba(0,0,0,0.5))',
                                transition: 'filter 0.6s ease',
                            }}
                        >
                            {/* Pointer stays fixed outside zoom */}
                            <Pointer />

                            {/* Zoom wrapper — only the SVG scales */}
                            <motion.div
                                className="absolute inset-0"
                                animate={zoomed ? { scale: 1.8 } : { scale: 1 }}
                                transition={zoomed
                                    ? { duration: 0.75, ease: [0.25, 0.46, 0.45, 0.94] }
                                    : { duration: 0.4, ease: 'easeOut' }
                                }
                                style={{ transformOrigin: `center ${CY - OUTER_R}px` }}
                            >
                                {visualSlots.length > 0
                                    ? <WheelSVG slots={visualSlots} controls={controls} winnerId={winnerId} spinState={spinState} prizeRanks={prizeRanks} />
                                    : (
                                        <div className="w-full h-full rounded-full bg-[#0B0E19] border border-[#192030] flex items-center justify-center">
                                            <p className="text-[#3D506A] text-[13px]">Sin opciones</p>
                                        </div>
                                    )
                                }
                            </motion.div>
                        </div>
                    </div>

                    {/* Prize legend — hidden during result to save space */}
                    {spinState !== 'result' && (
                        <PrizeLegend options={options} prizeRanks={prizeRanks} />
                    )}

                    {/* Controls */}
                    <div className="px-5 pb-5 space-y-3">
                        <AnimatePresence mode="wait">
                            {spinState !== 'result' ? (
                                <motion.div
                                    key="spin-btn"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.18 }}
                                >
                                    <button
                                        onClick={handleSpin}
                                        disabled={spinState !== 'idle' || !visualSlots.length}
                                        className={cn(
                                            'w-full py-3.5 rounded-xl text-[15px] font-black tracking-wide transition-all duration-200',
                                            spinState === 'idle' && visualSlots.length
                                                ? 'bg-amber-500 hover:bg-amber-400 text-black cursor-pointer shadow-[0_0_28px_rgba(245,158,11,0.45)] hover:shadow-[0_0_38px_rgba(245,158,11,0.65)]'
                                                : 'bg-[#1A2235] text-[#3D506A] cursor-not-allowed'
                                        )}
                                    >
                                        {spinState === 'spinning' ? (
                                            <motion.span
                                                animate={{ opacity: [1, 0.5, 1] }}
                                                transition={{ duration: 0.9, repeat: Infinity }}
                                            >
                                                Girando…
                                            </motion.span>
                                        ) : '¡ G I R A R !'}
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="result"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    {winner && (
                                        <ResultCard
                                            winner={winner}
                                            onClose={handleClose}
                                            onRetry={handleRetry}
                                            canRetry={spinsUsed < maxSpins}
                                            spinsLeft={maxSpins - spinsUsed}
                                        />
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
