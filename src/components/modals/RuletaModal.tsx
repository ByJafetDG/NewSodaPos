import { useState, useMemo } from 'react'
import { motion, useAnimation, AnimatePresence } from 'framer-motion'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SorteoOption } from '@/types'

// ── Geometry constants ────────────────────────────────────────────────────────

const SZ = 320
const CX = SZ / 2
const CY = SZ / 2
const OUTER_R = 148
const INNER_R = 30
const LABEL_R = 102
const DECO_R  = 158
const SPINS   = 8
const SPIN_MS = 5200

// ── Types ─────────────────────────────────────────────────────────────────────

type SpinState = 'idle' | 'spinning' | 'result'

interface Segment {
    option: SorteoOption
    weight: number
    startDeg: number
    endDeg: number
    midDeg: number
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function toXY(r: number, deg: number) {
    const rad = (deg - 90) * (Math.PI / 180)
    return {
        x: +(CX + r * Math.cos(rad)).toFixed(3),
        y: +(CY + r * Math.sin(rad)).toFixed(3),
    }
}

function wedge(startDeg: number, endDeg: number): string {
    const o1 = toXY(OUTER_R, startDeg)
    const o2 = toXY(OUTER_R, endDeg)
    const i2 = toXY(INNER_R, endDeg)
    const i1 = toXY(INNER_R, startDeg)
    const lg = endDeg - startDeg > 180 ? 1 : 0
    return [
        `M ${o1.x} ${o1.y}`,
        `A ${OUTER_R} ${OUTER_R} 0 ${lg} 1 ${o2.x} ${o2.y}`,
        `L ${i2.x} ${i2.y}`,
        `A ${INNER_R} ${INNER_R} 0 ${lg} 0 ${i1.x} ${i1.y}`,
        'Z',
    ].join(' ')
}

function buildSegments(options: SorteoOption[]): Segment[] {
    const avail = options.filter(
        o => o.isFiller || o.quantityRemaining === null || (o.quantityRemaining ?? 1) > 0
    )
    if (!avail.length) return []

    const nonFillers  = avail.filter(o => !o.isFiller)
    const fillers     = avail.filter(o => o.isFiller)
    const usedPct     = nonFillers.reduce((s, o) => s + o.baseProbability, 0)
    const fillerW     = fillers.length ? Math.max(0, 100 - usedPct) / fillers.length : 0

    const weighted = avail.map(o => ({
        option: o,
        weight: o.isFiller ? fillerW : o.baseProbability,
    }))
    const total = weighted.reduce((s, w) => s + w.weight, 0)

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

// ── Confetti ──────────────────────────────────────────────────────────────────

const C_COLORS = ['#F59E0B','#EF4444','#3B82F6','#10B981','#8B5CF6','#EC4899','#06B6D4','#F97316']

function Confetti() {
    const pieces = useMemo(() =>
        Array.from({ length: 36 }, (_, i) => ({
            id: i,
            x: 10 + Math.random() * 80,
            color: C_COLORS[i % C_COLORS.length],
            w: 7 + Math.random() * 7,
            h: 5 + Math.random() * 5,
            delay: Math.random() * 0.5,
            dur: 1.3 + Math.random() * 0.9,
            wobble: (Math.random() - 0.5) * 50,
            rot: Math.random() * 360,
        })), []
    )
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
            {pieces.map(p => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-[2px]"
                    style={{ left: `${p.x}%`, top: '-8%', width: p.w, height: p.h, backgroundColor: p.color }}
                    animate={{
                        y: ['0%', '115%'],
                        x: [0, p.wobble],
                        rotate: [p.rot, p.rot + (Math.random() > .5 ? 720 : -720)],
                        opacity: [1, 1, 0],
                    }}
                    transition={{ duration: p.dur, delay: p.delay, ease: 'linear' }}
                />
            ))}
        </div>
    )
}

// ── Wheel SVG ─────────────────────────────────────────────────────────────────

function WheelSVG({
    segs, controls, winnerId, spinState,
}: {
    segs: Segment[]
    controls: ReturnType<typeof useAnimation>
    winnerId: string | null
    spinState: SpinState
}) {
    return (
        <motion.div animate={controls} style={{ transformOrigin: 'center', willChange: 'transform' }}>
            <svg viewBox={`0 0 ${SZ} ${SZ}`} width={SZ} height={SZ} style={{ display: 'block' }}>
                <defs>
                    <radialGradient id="rOuter" cx="50%" cy="50%" r="50%">
                        <stop offset="0%"   stopColor="#1A2235" />
                        <stop offset="100%" stopColor="#0B0E19" />
                    </radialGradient>
                    <radialGradient id="rCenter" cx="38%" cy="32%" r="65%">
                        <stop offset="0%"   stopColor="#4A5568" />
                        <stop offset="100%" stopColor="#0D1117" />
                    </radialGradient>
                    <radialGradient id="rSheen" cx="44%" cy="32%" r="60%">
                        <stop offset="0%"   stopColor="white" stopOpacity="0.13" />
                        <stop offset="55%"  stopColor="white" stopOpacity="0.04" />
                        <stop offset="100%" stopColor="white" stopOpacity="0"    />
                    </radialGradient>
                    <filter id="fGlow" x="-40%" y="-40%" width="180%" height="180%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="fCenter">
                        <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.8)" />
                    </filter>
                </defs>

                {/* Decorative outer ring */}
                <circle cx={CX} cy={CY} r={DECO_R} fill="url(#rOuter)" />
                <circle cx={CX} cy={CY} r={DECO_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

                {/* Tick marks */}
                {Array.from({ length: 72 }).map((_, i) => {
                    const a = i * 5
                    const major = i % 6 === 0
                    const p1 = toXY(OUTER_R + 2, a)
                    const p2 = toXY(OUTER_R + (major ? 13 : 7), a)
                    return (
                        <line key={i}
                            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                            stroke={`rgba(255,255,255,${major ? 0.35 : 0.18})`}
                            strokeWidth={major ? 1.8 : 1}
                        />
                    )
                })}

                {/* Segments */}
                {segs.map(seg => {
                    const isWinner = spinState === 'result' && seg.option.id === winnerId
                    return (
                        <motion.path
                            key={seg.option.id}
                            d={wedge(seg.startDeg, seg.endDeg)}
                            fill={seg.option.color}
                            stroke="rgba(255,255,255,0.18)"
                            strokeWidth={1.5}
                            strokeLinejoin="round"
                            filter={isWinner ? 'url(#fGlow)' : undefined}
                            animate={isWinner
                                ? { opacity: [1, 0.72, 1] }
                                : { opacity: 1 }
                            }
                            transition={isWinner
                                ? { duration: 0.65, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }
                                : {}
                            }
                        />
                    )
                })}

                {/* Sheen overlay */}
                <circle cx={CX} cy={CY} r={OUTER_R} fill="url(#rSheen)" />

                {/* Outer rim */}
                <circle cx={CX} cy={CY} r={OUTER_R} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2.5} />

                {/* Labels */}
                {segs.map(seg => {
                    const span = seg.endDeg - seg.startDeg
                    if (span < 8) return null
                    const { x, y } = toXY(LABEL_R, seg.midDeg)
                    const size = span > 45 ? 12 : span > 28 ? 10 : span > 16 ? 9 : 7
                    const maxCh = span > 50 ? 15 : span > 35 ? 11 : span > 20 ? 8 : 5
                    const lbl = seg.option.label.length > maxCh
                        ? seg.option.label.slice(0, maxCh - 1) + '…'
                        : seg.option.label
                    const rot = (seg.midDeg > 90 && seg.midDeg < 270)
                        ? seg.midDeg + 180
                        : seg.midDeg
                    return (
                        <text
                            key={seg.option.id}
                            x={x} y={y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={size}
                            fontWeight="800"
                            fill="white"
                            stroke="rgba(0,0,0,0.55)"
                            strokeWidth={3.5}
                            paintOrder="stroke"
                            transform={`rotate(${rot},${x},${y})`}
                            style={{ userSelect: 'none', fontFamily: 'system-ui,-apple-system,sans-serif', letterSpacing: '0.02em' }}
                        >
                            {lbl}
                        </text>
                    )
                })}

                {/* Center shadow ring */}
                <circle cx={CX} cy={CY} r={INNER_R + 6} fill="rgba(0,0,0,0.55)" />

                {/* Center cap */}
                <circle cx={CX} cy={CY} r={INNER_R}
                    fill="url(#rCenter)"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth={2}
                    filter="url(#fCenter)"
                />

                {/* Center pin layers */}
                <circle cx={CX} cy={CY} r={13} fill="rgba(255,255,255,0.08)" />
                <circle cx={CX} cy={CY} r={8}  fill="rgba(255,255,255,0.14)" />
                <circle cx={CX} cy={CY} r={4}  fill="rgba(255,255,255,0.22)" />
                {/* Specular */}
                <circle cx={CX - 5} cy={CY - 5} r={3.5} fill="rgba(255,255,255,0.28)" />
            </svg>
        </motion.div>
    )
}

// ── Pointer ───────────────────────────────────────────────────────────────────

function Pointer() {
    return (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[13px] z-20 drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]">
            <svg width="24" height="22" viewBox="0 0 24 22">
                <defs>
                    <filter id="pGlow" x="-80%" y="-80%" width="360%" height="360%">
                        <feGaussianBlur stdDeviation="2.5" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>
                <polygon points="12,21 1,2 23,2" fill="white" filter="url(#pGlow)" />
                <polygon points="12,17 5,5 19,5"  fill="rgba(0,0,0,0.25)" />
            </svg>
        </div>
    )
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ winner, onClose, onRetry }: {
    winner: SorteoOption
    onClose: () => void
    onRetry: () => void
}) {
    const isReal = !winner.isFiller
    const remaining = winner.quantityRemaining !== null ? Math.max(0, (winner.quantityRemaining ?? 0) - 1) : null

    return (
        <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.25 }}
            className="space-y-4"
        >
            {/* Badge */}
            <div className="text-center">
                <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.4 }}
                    className={cn(
                        'w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3',
                        isReal ? 'shadow-[0_0_30px_rgba(245,158,11,0.5)]' : ''
                    )}
                    style={{ backgroundColor: winner.color + '25', border: `2px solid ${winner.color}40` }}
                >
                    {isReal
                        ? <Trophy size={30} style={{ color: winner.color }} />
                        : <span className="text-3xl select-none">😔</span>
                    }
                </motion.div>

                <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#3D506A] mb-1">
                    {isReal ? '¡Ganaste!' : 'Resultado'}
                </p>

                <p
                    className="text-[22px] font-black leading-tight"
                    style={{ color: isReal ? winner.color : '#7A8FAA' }}
                >
                    {winner.label}
                </p>

                {winner.description && (
                    <p className="text-[14px] text-[#7A8FAA] mt-1 font-medium">{winner.description}</p>
                )}

                {isReal && remaining !== null && (
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7 }}
                        className="text-[11px] text-[#3D506A] mt-2"
                    >
                        {remaining === 0
                            ? 'Último de este premio'
                            : `Quedan ${remaining} de este premio`
                        }
                    </motion.p>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={onRetry}
                    className="flex-1 h-11 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] text-[13px] font-medium hover:bg-[#1C2438] hover:text-[#E4ECF7] transition-all cursor-pointer"
                >
                    Girar de nuevo
                </button>
                <button
                    onClick={onClose}
                    className={cn(
                        'flex-1 h-11 rounded-xl text-[13px] font-bold transition-all cursor-pointer',
                        isReal
                            ? 'text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_28px_rgba(245,158,11,0.6)]'
                            : 'bg-[#1C2438] text-[#E4ECF7] hover:bg-[#283A56]'
                    )}
                    style={isReal ? { backgroundColor: winner.color } : {}}
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
    onResult?: (resultOptionId: string, didParticipate: boolean) => void
}

export function RuletaModal({ isOpen, onClose, sorteoName, options, onResult }: Props) {
    const controls = useAnimation()
    const segs = useMemo(() => buildSegments(options), [options])

    const [spinState, setSpinState] = useState<SpinState>('idle')
    const [winner, setWinner] = useState<SorteoOption | null>(null)
    const [winnerId, setWinnerId] = useState<string | null>(null)
    const [showConfetti, setShowConfetti] = useState(false)
    const [rotation, setRotation] = useState(0)

    async function handleSpin() {
        if (spinState !== 'idle' || !segs.length) return

        const winnerSeg = pickWinner(segs)
        // Small jitter within ±38% of segment width
        const half = (winnerSeg.endDeg - winnerSeg.startDeg) * 0.38
        const jitter = (Math.random() * 2 - 1) * half
        const landAt = winnerSeg.midDeg + jitter

        // Total degrees: full rotations + land angle, always moving forward
        const prev = rotation % 360
        const delta = ((landAt - prev) + 360) % 360
        const target = rotation + SPINS * 360 + delta

        setSpinState('spinning')
        setWinner(null)
        setWinnerId(null)
        setShowConfetti(false)

        await controls.start({
            rotate: target,
            transition: {
                duration: SPIN_MS / 1000,
                ease: [0.08, 0.82, 0.05, 1.0],
            },
        })

        setRotation(target)
        setWinner(winnerSeg.option)
        setWinnerId(winnerSeg.option.id)
        setSpinState('result')

        if (!winnerSeg.option.isFiller) {
            setTimeout(() => setShowConfetti(true), 350)
        }

        onResult?.(winnerSeg.option.id, true)
    }

    function handleRetry() {
        setSpinState('idle')
        setWinner(null)
        setWinnerId(null)
        setShowConfetti(false)
    }

    function handleClose() {
        setSpinState('idle')
        setWinner(null)
        setWinnerId(null)
        setShowConfetti(false)
        setRotation(0)
        controls.set({ rotate: 0 })
        onClose()
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
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
                <div className="relative bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                    {showConfetti && <Confetti />}

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 pt-5 pb-3">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.1em] text-[#3D506A] font-semibold">Sorteo</p>
                            <h2 className="text-[15px] font-bold text-[#E4ECF7] leading-tight">{sorteoName}</h2>
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
                    <div className="px-5 pb-2">
                        <div
                            className="relative mx-auto"
                            style={{
                                width: SZ,
                                height: SZ,
                                // Outer ambient glow
                                filter: spinState === 'spinning'
                                    ? 'drop-shadow(0 0 24px rgba(245,158,11,0.25))'
                                    : spinState === 'result' && winner && !winner.isFiller
                                        ? `drop-shadow(0 0 28px ${winner.color}55)`
                                        : 'drop-shadow(0 0 16px rgba(0,0,0,0.6))',
                                transition: 'filter 0.6s ease',
                            }}
                        >
                            <Pointer />
                            {segs.length > 0
                                ? <WheelSVG segs={segs} controls={controls} winnerId={winnerId} spinState={spinState} />
                                : (
                                    <div className="w-full h-full rounded-full bg-[#0B0E19] border border-[#192030] flex items-center justify-center">
                                        <p className="text-[#3D506A] text-[13px]">Sin opciones</p>
                                    </div>
                                )
                            }
                        </div>
                    </div>

                    {/* Controls area */}
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
                                        disabled={spinState !== 'idle' || !segs.length}
                                        className={cn(
                                            'w-full py-3.5 rounded-xl text-[15px] font-black tracking-wide transition-all duration-200',
                                            spinState === 'idle' && segs.length
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
