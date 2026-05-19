import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trophy, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Sorteo, RaspaditaCard } from '@/types'

// ─── Symbols ──────────────────────────────────────────────────────────────────

const SYMBOLS: Record<string, { label: string; color: string; render: (size: number) => React.ReactNode }> = {
    diamond: {
        label: 'Diamante', color: '#60A5FA',
        render: (sz) => (
            <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none">
                <polygon points="12,2 22,12 12,22 2,12" fill="#60A5FA" stroke="#93C5FD" strokeWidth="1" />
                <polygon points="12,6 18,12 12,18 6,12" fill="#BFDBFE" opacity="0.4" />
            </svg>
        ),
    },
    star: {
        label: 'Estrella', color: '#FBBF24',
        render: (sz) => (
            <svg width={sz} height={sz} viewBox="0 0 24 24">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill="#FBBF24" stroke="#FDE68A" strokeWidth="0.5" />
            </svg>
        ),
    },
    coin: {
        label: 'Moneda', color: '#F59E0B',
        render: (sz) => (
            <svg width={sz} height={sz} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="#F59E0B" stroke="#FDE68A" strokeWidth="1" />
                <circle cx="12" cy="12" r="7" fill="#D97706" />
                <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#FEF3C7">₡</text>
            </svg>
        ),
    },
    clover: {
        label: 'Trébol', color: '#34D399',
        render: (sz) => (
            <svg width={sz} height={sz} viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4.5" fill="#34D399" />
                <circle cx="8" cy="13" r="4.5" fill="#34D399" />
                <circle cx="16" cy="13" r="4.5" fill="#34D399" />
                <rect x="10.5" y="14" width="3" height="6" fill="#34D399" rx="1.5" />
                <circle cx="12" cy="8" r="2" fill="#6EE7B7" opacity="0.5" />
            </svg>
        ),
    },
    bell: {
        label: 'Campana', color: '#FDE68A',
        render: (sz) => (
            <svg width={sz} height={sz} viewBox="0 0 24 24">
                <path d="M12 3 C8 3 6 6 6 10 L6 16 L18 16 L18 10 C18 6 16 3 12 3Z" fill="#FDE68A" stroke="#FCD34D" strokeWidth="0.8" />
                <rect x="9" y="16" width="6" height="2.5" fill="#FDE68A" rx="1" />
                <circle cx="12" cy="20" r="1.8" fill="#FCD34D" />
                <ellipse cx="9" cy="7" rx="1.5" ry="2" fill="#FEF3C7" opacity="0.5" />
            </svg>
        ),
    },
    cherry: {
        label: 'Cereza', color: '#F87171',
        render: (sz) => (
            <svg width={sz} height={sz} viewBox="0 0 24 24">
                <path d="M12 4 Q14 8 16 10" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                <path d="M12 4 Q10 8 8 10" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                <circle cx="8" cy="14" r="4" fill="#F87171" stroke="#FCA5A5" strokeWidth="0.8" />
                <circle cx="16" cy="14" r="4" fill="#EF4444" stroke="#FCA5A5" strokeWidth="0.8" />
                <circle cx="7" cy="12.5" r="1.2" fill="#FCA5A5" opacity="0.6" />
            </svg>
        ),
    },
    seven: {
        label: 'Siete', color: '#C084FC',
        render: (sz) => (
            <svg width={sz} height={sz} viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="4" fill="#7C3AED" />
                <text x="12" y="18" textAnchor="middle" fontSize="14" fontWeight="900" fill="#C084FC" fontFamily="serif">7</text>
            </svg>
        ),
    },
    crown: {
        label: 'Corona', color: '#E879F9',
        render: (sz) => (
            <svg width={sz} height={sz} viewBox="0 0 24 24">
                <path d="M2 18 L5 8 L9 13 L12 5 L15 13 L19 8 L22 18 Z" fill="#E879F9" stroke="#F0ABFC" strokeWidth="0.8" strokeLinejoin="round" />
                <rect x="2" y="18" width="20" height="3" fill="#C026D3" rx="1" />
                <circle cx="5" cy="8" r="1.5" fill="#FDE68A" />
                <circle cx="12" cy="5" r="1.5" fill="#FDE68A" />
                <circle cx="19" cy="8" r="1.5" fill="#FDE68A" />
            </svg>
        ),
    },
}

// ─── Skins ────────────────────────────────────────────────────────────────────

type CardSkin = 'gold' | 'neon'

const SKINS: Record<CardSkin, { topColor: string; midColor: string; bottomColor: string; shimmer: string; border: string }> = {
    gold: { topColor: '#92400E', midColor: '#D97706', bottomColor: '#78350F', shimmer: '#FDE68A', border: '#D97706' },
    neon: { topColor: '#4C1D95', midColor: '#7C3AED', bottomColor: '#2E1065', shimmer: '#C4B5FD', border: '#8B5CF6' },
}

const CARD_W = 300
const CARD_H = 420

// ─── Audio ────────────────────────────────────────────────────────────────────

function playScratchSound(ctx: AudioContext) {
    const duration = 0.055
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    const src = ctx.createBufferSource()
    src.buffer = buf

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2200
    bp.Q.value = 0.7

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.07, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

    src.connect(bp)
    bp.connect(gain)
    gain.connect(ctx.destination)
    src.start()
    src.stop(ctx.currentTime + duration)
}

function playVictorySound(ctx: AudioContext) {
    const t = ctx.currentTime
    // Ascending arpeggio C5-E5-G5-C6
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const s = t + i * 0.10
        g.gain.setValueAtTime(0, s)
        g.gain.linearRampToValueAtTime(0.22, s + 0.02)
        g.gain.exponentialRampToValueAtTime(0.001, s + 0.28)
        osc.connect(g)
        g.connect(ctx.destination)
        osc.start(s)
        osc.stop(s + 0.3)
    })
    // High sparkle finish C7
    const sp = ctx.createOscillator()
    const sg = ctx.createGain()
    sp.type = 'sine'
    sp.frequency.value = 2093
    const ss = t + 0.42
    sg.gain.setValueAtTime(0, ss)
    sg.gain.linearRampToValueAtTime(0.13, ss + 0.03)
    sg.gain.exponentialRampToValueAtTime(0.001, ss + 0.55)
    sp.connect(sg)
    sg.connect(ctx.destination)
    sp.start(ss)
    sp.stop(ss + 0.6)
}

function playDefeatSound(ctx: AudioContext) {
    const t = ctx.currentTime
    // Descending sad notes E4-D4-C4
    const notes = [330, 294, 262]
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.value = freq
        const s = t + i * 0.20
        g.gain.setValueAtTime(0, s)
        g.gain.linearRampToValueAtTime(0.10, s + 0.03)
        g.gain.exponentialRampToValueAtTime(0.001, s + 0.24)
        osc.connect(g)
        g.connect(ctx.destination)
        osc.start(s)
        osc.stop(s + 0.28)
    })
}

// ─── Canvas init ──────────────────────────────────────────────────────────────

function initScratchCanvas(canvas: HTMLCanvasElement, skin: CardSkin, position: number) {
    const sk = SKINS[skin]
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height

    // Rich metallic gradient
    const grad = ctx.createLinearGradient(0, 0, w * 0.6, h)
    grad.addColorStop(0, sk.topColor)
    grad.addColorStop(0.45, sk.midColor)
    grad.addColorStop(1, sk.bottomColor)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Diagonal brushed-metal lines
    ctx.save()
    ctx.strokeStyle = sk.shimmer + '18'
    ctx.lineWidth = 1
    for (let i = -h; i < w + h; i += 16) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i + h, h)
        ctx.stroke()
    }
    ctx.restore()

    // Dot grid
    ctx.fillStyle = sk.shimmer + '22'
    for (let x = 8; x < w; x += 14) {
        for (let y = 8; y < h; y += 14) {
            ctx.beginPath()
            ctx.arc(x, y, 0.9, 0, Math.PI * 2)
            ctx.fill()
        }
    }

    // Center radial glow
    const cg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 110)
    cg.addColorStop(0, sk.shimmer + '30')
    cg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = cg
    ctx.fillRect(0, 0, w, h)

    // Corner ornaments (small diamonds)
    const drawDiamond = (cx: number, cy: number, r: number) => {
        ctx.beginPath()
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r, cy)
        ctx.lineTo(cx, cy + r)
        ctx.lineTo(cx - r, cy)
        ctx.closePath()
        ctx.fill()
    }
    ctx.fillStyle = sk.shimmer + '55'
    drawDiamond(18, 18, 6)
    drawDiamond(w - 18, 18, 6)
    drawDiamond(18, h - 18, 6)
    drawDiamond(w - 18, h - 18, 6)

    // Horizontal lines above/below center text
    ctx.strokeStyle = sk.shimmer + '44'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(28, h / 2 - 30); ctx.lineTo(w - 28, h / 2 - 30); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(28, h / 2 + 42); ctx.lineTo(w - 28, h / 2 + 42); ctx.stroke()

    // "RASPA AQUÍ" text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = sk.shimmer
    ctx.shadowBlur = 16
    ctx.fillStyle = sk.shimmer
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.fillText('RASPA AQUÍ', w / 2, h / 2 - 10)

    ctx.shadowBlur = 0
    ctx.fillStyle = sk.shimmer + 'AA'
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillText('▼   ▼   ▼', w / 2, h / 2 + 18)

    // Card number
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = sk.shimmer + '66'
    ctx.font = 'bold 10px monospace'
    ctx.fillText(`#${position + 1}`, w - 10, h - 8)
}

// ─── CardReveal ───────────────────────────────────────────────────────────────

function CardReveal({ card, skin, revealed }: { card: RaspaditaCard; skin: CardSkin; revealed: boolean }) {
    const sk = SKINS[skin]
    const slotsCount = card.slots.length
    const symbolSize = slotsCount <= 3 ? 64 : slotsCount <= 6 ? 50 : 42
    const cols = slotsCount <= 3 ? slotsCount : 3

    return (
        <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ background: '#060810' }}>
            {/* Decorative border */}
            <div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{
                    boxShadow: `inset 0 0 0 1px ${sk.border}${revealed ? 'CC' : '33'},
                               inset 0 0 0 3px #09111E,
                               inset 0 0 0 4px ${sk.border}${revealed ? '66' : '18'}`,
                    transition: 'box-shadow 0.5s ease',
                }}
            />

            {/* Win inner glow */}
            <AnimatePresence>
                {revealed && card.isPrize && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 rounded-2xl pointer-events-none"
                        style={{ boxShadow: `inset 0 0 50px ${sk.border}28` }}
                    />
                )}
            </AnimatePresence>

            {/* Header ribbon */}
            <div
                className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: `1px solid ${sk.border}33` }}
            >
                <div className="flex flex-col gap-0.5">
                    <p
                        className="text-[9px] font-black tracking-[0.2em] uppercase"
                        style={{ color: sk.shimmer + 'BB' }}
                    >
                        RASPA Y GANA
                    </p>
                    <div
                        className="h-px w-16 rounded"
                        style={{ background: `linear-gradient(to right, ${sk.shimmer}66, transparent)` }}
                    />
                </div>
                <div
                    className="text-[10px] font-bold tabular-nums px-2 py-1 rounded-lg"
                    style={{ color: sk.shimmer, background: sk.shimmer + '18', border: `1px solid ${sk.border}44` }}
                >
                    #{card.position + 1}
                </div>
            </div>

            {/* Symbols area */}
            <div className="flex-1 flex items-center justify-center px-6 py-4">
                <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: `repeat(${Math.min(cols, 3)}, 1fr)` }}
                >
                    {card.slots.map((sym, i) => {
                        const symDef = SYMBOLS[sym]
                        return (
                            <motion.div
                                key={i}
                                initial={revealed ? { scale: 0.4, opacity: 0 } : false}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: i * 0.07, type: 'spring', stiffness: 450, damping: 18 }}
                                className="flex items-center justify-center"
                                style={{
                                    filter: !revealed
                                        ? 'grayscale(1) brightness(0.15)'
                                        : card.isPrize
                                            ? `drop-shadow(0 0 8px ${symDef?.color ?? '#fff'}88)`
                                            : 'saturate(0.6) brightness(0.7)',
                                    transition: 'filter 0.4s ease',
                                }}
                            >
                                {symDef?.render(symbolSize) ?? (
                                    <div style={{ width: symbolSize, height: symbolSize, background: '#192030', borderRadius: 8 }} />
                                )}
                            </motion.div>
                        )
                    })}
                </div>
            </div>

            {/* Prize footer */}
            <div
                className="px-5 py-3 flex flex-col items-center justify-center min-h-[76px]"
                style={{ borderTop: `1px solid ${sk.border}33` }}
            >
                {revealed ? (
                    card.isPrize ? (
                        <motion.div
                            initial={{ y: 8, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.15 }}
                            className="flex flex-col items-center gap-1.5"
                        >
                            <div
                                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black text-black"
                                style={{ background: sk.shimmer }}
                            >
                                <Trophy size={11} />
                                ¡GANASTE!
                            </div>
                            {card.prizeLabel && (
                                <p className="text-[14px] font-bold text-center" style={{ color: sk.shimmer }}>
                                    {card.prizeLabel}
                                </p>
                            )}
                            {card.prizeDescription && (
                                <p className="text-[13px] font-semibold text-[#E4ECF7] text-center">
                                    {card.prizeDescription}
                                </p>
                            )}
                        </motion.div>
                    ) : (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-[12px] text-[#283A56] font-medium tracking-wide"
                        >
                            Sin premio esta vez
                        </motion.p>
                    )
                ) : (
                    <p className="text-[9px] tracking-[0.25em] uppercase font-bold" style={{ color: sk.border + '44' }}>
                        PENDIENTE DE RASPAR
                    </p>
                )}
            </div>
        </div>
    )
}

// ─── ScratchSingleModal ───────────────────────────────────────────────────────

interface ScratchSingleProps {
    card: RaspaditaCard
    skin: CardSkin
    sorteoName: string
    queuePos: number
    queueTotal: number
    isLast: boolean
    onRevealed: (cardId: string, isPrize: boolean) => void
    onNext: () => void
    onClose: () => void
}

function ScratchSingleModal({ card, skin, sorteoName, queuePos, queueTotal, isLast, onRevealed, onNext, onClose }: ScratchSingleProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const isScratching = useRef(false)
    const hasRevealed = useRef(false)
    const audioCtxRef = useRef<AudioContext | null>(null)
    const lastScratchSoundAt = useRef(0)
    const [revealed, setRevealed] = useState(false)
    const [canContinue, setCanContinue] = useState(false)
    const sk = SKINS[skin]

    function getAudioCtx(): AudioContext {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
        return audioCtxRef.current
    }

    const draw = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = CARD_W
        canvas.height = CARD_H
        initScratchCanvas(canvas, skin, card.position)
    }, [skin, card.position])

    useEffect(() => {
        hasRevealed.current = false
        setRevealed(false)
        setCanContinue(false)
        draw()
    }, [card.id, draw])

    function checkCoverage() {
        if (hasRevealed.current) return
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let transparent = 0
        let total = 0
        for (let i = 3; i < data.length; i += 8) {
            if (data[i] < 128) transparent++
            total++
        }
        if (total > 0 && transparent / total > 0.40) {
            hasRevealed.current = true
            if (canvas) {
                canvas.style.transition = 'opacity 0.35s ease'
                canvas.style.opacity = '0'
            }
            setRevealed(true)
            onRevealed(card.id, card.isPrize)
            const ac = getAudioCtx()
            if (card.isPrize) playVictorySound(ac)
            else playDefeatSound(ac)
            setTimeout(() => setCanContinue(true), card.isPrize ? 1000 : 500)
        }
    }

    function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
        const canvas = canvasRef.current!
        const rect = canvas.getBoundingClientRect()
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        }
    }

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
        isScratching.current = true
        ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
        getAudioCtx()
        doScratch(e)
    }

    function doScratch(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!isScratching.current || hasRevealed.current) return
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const { x, y } = getPos(e)
        ctx.globalCompositeOperation = 'destination-out'
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 42)
        grad.addColorStop(0, 'rgba(0,0,0,1)')
        grad.addColorStop(0.65, 'rgba(0,0,0,0.9)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, 42, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        // Scratch sound throttled to 50ms
        const now = Date.now()
        if (now - lastScratchSoundAt.current > 50) {
            lastScratchSoundAt.current = now
            playScratchSound(getAudioCtx())
        }
    }

    function handlePointerUp() {
        isScratching.current = false
        checkCoverage()
    }

    return (
        <motion.div
            key={card.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5"
            style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)' }}
        >
            {/* Top bar */}
            <div className="flex items-center justify-between w-full max-w-sm px-2">
                <div className="flex items-center gap-2">
                    {Array.from({ length: queueTotal }).map((_, i) => (
                        <div
                            key={i}
                            className="h-1.5 rounded-full transition-all duration-300"
                            style={{
                                width: i === queuePos - 1 ? 20 : 8,
                                background: i < queuePos ? sk.shimmer : (i === queuePos - 1 ? sk.shimmer : '#192030'),
                            }}
                        />
                    ))}
                </div>
                <p className="text-[12px] font-semibold text-[#C5D5E8] truncate max-w-[140px]">{sorteoName}</p>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#192030] cursor-pointer transition-all"
                >
                    <X size={15} />
                </button>
            </div>

            {/* Card */}
            <div
                className="relative rounded-2xl overflow-hidden select-none"
                style={{ width: CARD_W, height: CARD_H, boxShadow: `0 0 60px ${sk.border}30, 0 20px 60px rgba(0,0,0,0.6)` }}
            >
                <CardReveal card={card} skin={skin} revealed={revealed} />
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 touch-none"
                    style={{ width: CARD_W, height: CARD_H, cursor: 'crosshair', borderRadius: 16 }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={doScratch}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                />
            </div>

            {/* Footer */}
            <div className="w-full max-w-sm px-2">
                <AnimatePresence mode="wait">
                    {!revealed ? (
                        <motion.p
                            key="hint"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-center text-[12px] text-[#3D506A]"
                        >
                            Desliza el dedo para raspar
                        </motion.p>
                    ) : (
                        <motion.div
                            key="action"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex gap-3"
                        >
                            {isLast ? (
                                <button
                                    onClick={onClose}
                                    disabled={!canContinue}
                                    className="flex-1 h-12 rounded-xl font-bold text-[14px] text-black cursor-pointer active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ background: canContinue ? sk.shimmer : sk.shimmer + '80' }}
                                >
                                    Listo
                                </button>
                            ) : (
                                <button
                                    onClick={onNext}
                                    disabled={!canContinue}
                                    className="flex-1 h-12 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 text-black cursor-pointer active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ background: canContinue ? sk.shimmer : sk.shimmer + '80' }}
                                >
                                    Siguiente
                                    <ChevronRight size={16} />
                                </button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    )
}

// ─── MiniCard (selection grid) ────────────────────────────────────────────────

function MiniCard({
    card, skin, selected, scratched, onToggle,
}: {
    card: RaspaditaCard; skin: CardSkin; selected: boolean; scratched: boolean
    onToggle: (id: string) => void
}) {
    const sk = SKINS[skin]
    return (
        <motion.button
            onClick={() => !scratched && onToggle(card.id)}
            animate={{ scale: selected ? 1.05 : 1 }}
            whileTap={!scratched ? { scale: 0.93 } : {}}
            className={cn(
                'relative w-full aspect-[3/4] rounded-xl overflow-hidden select-none',
                scratched ? 'cursor-default' : 'cursor-pointer',
            )}
            style={{ opacity: scratched ? 0.3 : 1 }}
        >
            {/* Card back design */}
            <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(155deg, ${sk.topColor} 0%, ${sk.midColor} 55%, ${sk.bottomColor} 100%)` }}
            />
            <div
                className="absolute inset-0 opacity-20"
                style={{
                    backgroundImage: `radial-gradient(circle, ${sk.shimmer} 1px, transparent 1px)`,
                    backgroundSize: '10px 10px',
                }}
            />
            {/* Diagonal lines */}
            <div
                className="absolute inset-0 opacity-10"
                style={{
                    backgroundImage: `repeating-linear-gradient(45deg, ${sk.shimmer} 0px, ${sk.shimmer} 1px, transparent 1px, transparent 12px)`,
                }}
            />
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <p
                    className="text-[8px] font-black tracking-[0.2em] uppercase"
                    style={{ color: sk.shimmer, textShadow: `0 0 8px ${sk.shimmer}` }}
                >
                    RASPA
                </p>
                <p className="text-[7px] font-bold tracking-wider" style={{ color: sk.shimmer + 'CC' }}>
                    Y GANA
                </p>
            </div>
            {/* Card number */}
            <div
                className="absolute bottom-1 right-1.5 text-[7px] font-bold tabular-nums"
                style={{ color: sk.shimmer + '77' }}
            >
                #{card.position + 1}
            </div>
            {/* Scratched overlay */}
            {scratched && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Check size={18} className="text-emerald-400" />
                </div>
            )}
            {/* Selection ring */}
            {selected && !scratched && (
                <div
                    className="absolute inset-0 rounded-xl"
                    style={{ boxShadow: `inset 0 0 0 2.5px ${sk.shimmer}, 0 0 14px ${sk.shimmer}55` }}
                />
            )}
        </motion.button>
    )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface Props {
    isOpen: boolean
    onClose: () => void
    sorteo: Sorteo | null
    cards: RaspaditaCard[]
    allowedScratchCount?: number
    onCardScratched?: (cardId: string, isPrize: boolean) => void
}

export function RaspaditaModal({ isOpen, onClose, sorteo, cards, allowedScratchCount, onCardScratched }: Props) {
    const [scratchedIds, setScratchedIds] = useState<Set<string>>(new Set())
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [queue, setQueue] = useState<RaspaditaCard[]>([])
    const [queueIndex, setQueueIndex] = useState(0)
    const [scratching, setScratching] = useState(false)

    const skin: CardSkin = sorteo?.cardSkin === 'neon' ? 'neon' : 'gold'
    const sk = SKINS[skin]

    useEffect(() => {
        if (!isOpen) {
            setSelected(new Set())
            setScratching(false)
            setQueue([])
            setQueueIndex(0)
        }
    }, [isOpen])

    useEffect(() => {
        setScratchedIds(new Set(cards.filter(c => c.isScratched).map(c => c.id)))
    }, [cards])

    const available = cards.filter(c => !scratchedIds.has(c.id))
    const total = cards.length
    const scratchedCount = scratchedIds.size
    const prizeCards = cards.filter(c => c.isPrize)
    const scratchedPrizes = prizeCards.filter(c => scratchedIds.has(c.id)).length
    const remainingPrizes = prizeCards.length - scratchedPrizes
    const selectedCount = selected.size

    function toggleSelect(id: string) {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                if (allowedScratchCount !== undefined && next.size >= allowedScratchCount) return prev
                next.add(id)
            }
            return next
        })
    }

    function startScratching() {
        const q = cards.filter(c => selected.has(c.id) && !scratchedIds.has(c.id))
        if (q.length === 0) return
        setQueue(q)
        setQueueIndex(0)
        setScratching(true)
        setSelected(new Set())
    }

    function handleRevealed(cardId: string, isPrize: boolean) {
        setScratchedIds(prev => new Set([...prev, cardId]))
        onCardScratched?.(cardId, isPrize)
    }

    function handleNext() {
        if (queueIndex < queue.length - 1) {
            setQueueIndex(i => i + 1)
        } else {
            setScratching(false)
        }
    }

    if (!isOpen || !sorteo) return null

    const currentCard = queue[queueIndex] ?? null

    return (
        <>
            {/* Selection modal */}
            <AnimatePresence>
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/70"
                        style={{ backdropFilter: 'blur(4px)' }}
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                        className="relative z-10 w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl border overflow-hidden"
                        style={{ background: '#080C14', borderColor: '#192030' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div
                            className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
                            style={{ borderColor: '#192030' }}
                        >
                            <div>
                                <h2 className="text-[15px] font-semibold text-[#E4ECF7]">{sorteo.name}</h2>
                                <p className="text-[11px] text-[#3D506A] mt-0.5">
                                    <span className="font-medium" style={{ color: sk.shimmer }}>
                                        {scratchedCount}/{total}
                                    </span>
                                    {' '}raspadas
                                    {remainingPrizes > 0 && (
                                        <> · <span className="text-emerald-400 font-medium">{remainingPrizes}</span> premios restantes</>
                                    )}
                                    {remainingPrizes === 0 && scratchedPrizes > 0 && (
                                        <> · <span className="text-[#3D506A]">todos los premios entregados</span></>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#192030] transition-all cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Grid */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {available.length === 0 && scratchedCount === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <p className="text-[13px] text-[#3D506A]">Cargando raspas...</p>
                                </div>
                            ) : available.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <Trophy size={36} className="text-amber-400" />
                                    <p className="text-[14px] font-semibold text-[#7A8FAA]">
                                        Todas las raspaditas han sido raspadas
                                    </p>
                                    <p className="text-[12px] text-[#3D506A]">
                                        {scratchedPrizes} de {prizeCards.length} premios entregados
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5 md:grid-cols-6">
                                    {cards.map(card => (
                                        <MiniCard
                                            key={card.id}
                                            card={card}
                                            skin={skin}
                                            selected={selected.has(card.id)}
                                            scratched={scratchedIds.has(card.id)}
                                            onToggle={toggleSelect}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer action */}
                        {available.length > 0 && (
                            <div
                                className="flex items-center justify-between px-5 py-3.5 border-t flex-shrink-0 gap-3"
                                style={{ borderColor: '#192030' }}
                            >
                                <p className="text-[12px] text-[#3D506A]">
                                    {selectedCount === 0
                                        ? allowedScratchCount !== undefined
                                            ? <>Selecciona <span className="font-semibold" style={{ color: sk.shimmer }}>{allowedScratchCount}</span> raspa{allowedScratchCount !== 1 ? 's' : ''}</>
                                            : 'Toca una o más raspas para seleccionarlas'
                                        : allowedScratchCount !== undefined
                                            ? <><span className="font-semibold" style={{ color: sk.shimmer }}>{selectedCount}</span> de {allowedScratchCount} seleccionada{selectedCount !== 1 ? 's' : ''}</>
                                            : <><span className="font-semibold" style={{ color: sk.shimmer }}>{selectedCount}</span> seleccionada{selectedCount !== 1 ? 's' : ''}</>
                                    }
                                </p>
                                <button
                                    onClick={startScratching}
                                    disabled={selectedCount === 0}
                                    className={cn(
                                        'flex items-center gap-2 px-5 h-10 rounded-xl font-bold text-[13px] text-black transition-all cursor-pointer active:scale-95',
                                        selectedCount === 0 ? 'opacity-40 cursor-not-allowed' : 'opacity-100'
                                    )}
                                    style={{ background: sk.shimmer }}
                                >
                                    Raspar {selectedCount > 0 ? `${selectedCount}` : ''}
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        )}
                    </motion.div>
                </div>
            </AnimatePresence>

            {/* Scratch phase overlay */}
            <AnimatePresence>
                {scratching && currentCard && (
                    <ScratchSingleModal
                        card={currentCard}
                        skin={skin}
                        sorteoName={sorteo.name}
                        queuePos={queueIndex + 1}
                        queueTotal={queue.length}
                        isLast={queueIndex === queue.length - 1}
                        onRevealed={handleRevealed}
                        onNext={handleNext}
                        onClose={() => setScratching(false)}
                    />
                )}
            </AnimatePresence>
        </>
    )
}
