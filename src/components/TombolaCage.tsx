import { useEffect, useRef, useMemo, useState } from 'react'

const BALL_COLORS = [
    '#F59E0B', '#3B82F6', '#10B981', '#FACC15', '#8B5CF6',
    '#EF4444', '#06B6D4', '#F97316', '#EC4899', '#84CC16',
]
function ballColor(num: number) { return BALL_COLORS[Math.floor((num - 1) / 10) % 10] }

const C = 150
const CAGE_R = 118
const BALL_R = 8
const INNER_R = CAGE_R - BALL_R - 2   // 108
const SP = 18
const R2 = (CAGE_R - BALL_R - 4) ** 2
const SPIN_DURATION = 13000
const DECEL_DURATION = 7000   // gradual stop: 13s → 20s total
const GRAVITY = 0.09
const WALL_DAMPING = 0.88
const BALL_RESTITUTION = 0.86
const MAX_SPEED = 15
const MIN_D = BALL_R * 2
const MIN_D2 = MIN_D * MIN_D
const HOLE_HALF_W = 12   // physics hole width (slightly wider than visual 10px)

// Spatial grid for O(n) ball-ball collision
// INNER_R=108 → coords ∈ [-108,108]. offset=108 → [0,216]. cell=16 → 14 cells.
const GRID_CELL = MIN_D
const GRID_OFF = INNER_R           // 108 — shift so indices start at 0
const GRID_W = Math.ceil((INNER_R * 2) / GRID_CELL) + 1  // 15
const _gHead = new Int16Array(GRID_W * GRID_W).fill(-1)
const _gNext = new Int16Array(100).fill(-1)

function buildGridPositions(total: number): Array<{ x: number; y: number }> {
    const pts: Array<{ x: number; y: number }> = []
    for (let row = -7; row <= 7; row++) {
        for (let col = -7; col <= 7; col++) {
            const cx = col * SP, cy = row * SP
            if (cx * cx + cy * cy <= R2 && pts.length < total)
                pts.push({ x: cx, y: cy })
        }
    }
    return pts
}

interface PhysBall { x: number; y: number; vx: number; vy: number }

function startSpinSound(): () => void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
        const actx = new AudioCtx()
        const bufSize = Math.floor(actx.sampleRate * 0.5)
        const buf = actx.createBuffer(1, bufSize, actx.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1

        const noise = actx.createBufferSource()
        noise.buffer = buf
        noise.loop = true

        const noiseGain = actx.createGain()
        const t0 = actx.currentTime
        noiseGain.gain.setValueAtTime(0, t0)
        noiseGain.gain.linearRampToValueAtTime(0.07, t0 + 1.5)
        noiseGain.gain.linearRampToValueAtTime(0.10, t0 + 4)
        noiseGain.gain.linearRampToValueAtTime(0.10, t0 + 12)
        noiseGain.gain.linearRampToValueAtTime(0.04, t0 + 15)

        const filter = actx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 700
        filter.Q.value = 1.2

        const hum = actx.createOscillator()
        const humGain = actx.createGain()
        hum.type = 'sawtooth'
        hum.frequency.value = 75
        humGain.gain.setValueAtTime(0, t0)
        humGain.gain.linearRampToValueAtTime(0.025, t0 + 0.8)

        noise.connect(filter)
        filter.connect(noiseGain)
        noiseGain.connect(actx.destination)
        hum.connect(humGain)
        humGain.connect(actx.destination)
        noise.start()
        hum.start()

        return () => {
            try {
                const t = actx.currentTime
                noiseGain.gain.cancelScheduledValues(t)
                noiseGain.gain.setValueAtTime(noiseGain.gain.value, t)
                noiseGain.gain.linearRampToValueAtTime(0, t + 0.35)
                humGain.gain.cancelScheduledValues(t)
                humGain.gain.setValueAtTime(humGain.gain.value, t)
                humGain.gain.linearRampToValueAtTime(0, t + 0.35)
                setTimeout(() => { try { actx.close() } catch {} }, 450)
            } catch {}
        }
    } catch {
        return () => {}
    }
}

function playWinnerSound(): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext
        const actx = new AudioCtx()
        const now = actx.currentTime
        const osc = actx.createOscillator()
        const gain = actx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(380, now)
        osc.frequency.exponentialRampToValueAtTime(860, now + 0.65)
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.28, now + 0.06)
        gain.gain.setValueAtTime(0.28, now + 0.55)
        gain.gain.linearRampToValueAtTime(0, now + 0.75)
        osc.connect(gain)
        gain.connect(actx.destination)
        osc.start(now)
        osc.stop(now + 0.8)
        setTimeout(() => { try { actx.close() } catch {} }, 900)
    } catch {}
}

interface Props {
    totalNumbers: number
    phase: 'idle' | 'spinning' | 'result'
    drawnNumber: number | null
    onSpinComplete: (n: number) => void
}

export function TombolaCage({ totalNumbers, phase, drawnNumber, onSpinComplete }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const cageWiresRef = useRef<SVGGElement>(null)
    const winnerRef = useRef<SVGGElement>(null)
    const rafRef = useRef<number | undefined>(undefined)
    const startRef = useRef<number | undefined>(undefined)
    const cageAngleRef = useRef(0)
    const physBallsRef = useRef<PhysBall[]>([])
    const phaseRef = useRef(phase)
    const drawnNumberRef = useRef(drawnNumber)
    const totalRef = useRef(totalNumbers)
    const cbRef = useRef(onSpinComplete)
    const stopSoundRef = useRef<() => void>(() => {})
    const winnerCalledRef = useRef(false)
    const winnerIdxRef = useRef(-1)
    const [holeActive, setHoleActive] = useState(false)
    const [countdown, setCountdown] = useState<number | null>(null)

    phaseRef.current = phase
    drawnNumberRef.current = drawnNumber
    totalRef.current = totalNumbers
    cbRef.current = onSpinComplete

    const gridPositions = useMemo(() => buildGridPositions(Math.min(totalNumbers, 100)), [totalNumbers])
    const gridPosRef = useRef(gridPositions)
    gridPosRef.current = gridPositions

    const [winnerPos, setWinnerPos] = useState<{ x: number; y: number } | null>(null)

    // Init physics balls from grid positions
    useEffect(() => {
        physBallsRef.current = gridPositions.map(p => ({ x: p.x, y: p.y, vx: 0, vy: 0 }))
    }, [totalNumbers]) // eslint-disable-line

    // On spinning start: kick balls + start sound + countdown
    useEffect(() => {
        if (phase === 'spinning') {
            const startTime = performance.now()
            startRef.current = startTime
            winnerCalledRef.current = false
            winnerIdxRef.current = -1
            setHoleActive(false)
            setCountdown(Math.ceil((SPIN_DURATION + DECEL_DURATION) / 1000))
            const shuffled = [...gridPosRef.current].sort(() => Math.random() - 0.5)
            physBallsRef.current = shuffled.map(p => ({
                x: p.x, y: p.y,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12,
            }))
            stopSoundRef.current = startSpinSound()
            const total = SPIN_DURATION + DECEL_DURATION
            const holeTimer = window.setTimeout(() => setHoleActive(true), total)
            const countdownInterval = setInterval(() => {
                const remaining = Math.max(0, total - (performance.now() - startTime))
                setCountdown(Math.ceil(remaining / 1000))
                if (remaining <= 0) clearInterval(countdownInterval)
            }, 200)
            return () => {
                window.clearTimeout(holeTimer)
                clearInterval(countdownInterval)
            }
        } else {
            setCountdown(null)
            stopSoundRef.current()
            stopSoundRef.current = () => {}
            if (phase === 'result') playWinnerSound()
        }
        return () => {
            stopSoundRef.current()
            stopSoundRef.current = () => {}
        }
    }, [phase])

    // Capture winner ball position when result arrives
    useEffect(() => {
        if (phase !== 'result' || !drawnNumber) { setWinnerPos(null); return }
        const pb = physBallsRef.current[drawnNumber - 1]
        const gp = gridPosRef.current[drawnNumber - 1]
        const p = pb ?? gp
        setWinnerPos(p ? { x: p.x + C, y: p.y + C } : { x: C, y: C })
    }, [phase, drawnNumber])

    // Winner exit animation
    useEffect(() => {
        if (phase !== 'result' || !winnerPos || !winnerRef.current) return
        const el = winnerRef.current
        const dx = C - winnerPos.x
        const dy = (C + CAGE_R + 60) - winnerPos.y
        const r1 = requestAnimationFrame(() => {
            el.style.transition = 'none'
            el.style.transform = 'scale(1)'
            el.style.filter = 'none'
            const r2 = requestAnimationFrame(() => {
                el.style.transition = 'transform 1.2s 0.12s cubic-bezier(0.34,1.56,0.64,1), filter 1.2s 0.12s'
                el.style.transform = `translate(${dx}px,${dy}px) scale(6)`
                el.style.filter = 'drop-shadow(0 0 18px rgba(255,255,255,0.95))'
            })
            return () => cancelAnimationFrame(r2)
        })
        return () => cancelAnimationFrame(r1)
    }, [phase, winnerPos])

    // Single continuous RAF loop: physics + canvas draw
    useEffect(() => {
        const tick = (now: number) => {
            const canvas = canvasRef.current
            const ctx = canvas?.getContext('2d')
            const cp = phaseRef.current

            if (cp === 'spinning') {
                const elapsed = now - (startRef.current ?? now)
                const holeOpen = elapsed >= SPIN_DURATION + DECEL_DURATION
                let angularVel = 0

                if (elapsed < SPIN_DURATION) {
                    const t = elapsed / SPIN_DURATION
                    angularVel = (3 + 12 * Math.sin(t * Math.PI)) * 0.45
                } else if (!holeOpen) {
                    const dt = Math.min((elapsed - SPIN_DURATION) / DECEL_DURATION, 1)
                    angularVel = 3 * 0.45 * (1 - dt) * (1 - dt)
                }

                if (cageWiresRef.current && angularVel > 0) {
                    cageWiresRef.current.style.transform = `rotate(${cageAngleRef.current += angularVel}deg)`
                }

                const balls = physBallsRef.current
                const n = balls.length

                // spinFraction: 1 at full spin → 0 at end of decel → 0 during hole
                // Used to blend physics toward gravity-dominant as cage slows
                const spinFraction = elapsed < SPIN_DURATION ? 1.0 :
                    holeOpen ? 0.0 :
                    (1 - Math.min((elapsed - SPIN_DURATION) / DECEL_DURATION, 1)) ** 2

                const spinScale = holeOpen ? 0 : angularVel * 0.04
                const inDecel = !holeOpen && elapsed >= SPIN_DURATION
                const turbScale = holeOpen ? 0 : (inDecel ? angularVel * 0.24 : Math.max(angularVel * 0.24, 0.5))
                // Friction increases as spin dies: 0.997 at full spin → 0.907 at stop → 0.90 during hole
                const friction = holeOpen ? 0.90 : 0.997 - (1 - spinFraction) * 0.09
                // Wall damping increases as spin dies: 0.88 at full spin → 0.30 at stop → 0.25 during hole
                const wallDamp = holeOpen ? 0.25 : 0.30 + 0.58 * spinFraction

                for (let i = 0; i < n; i++) {
                    const b = balls[i]
                    const dist = Math.sqrt(b.x * b.x + b.y * b.y)

                    if (!holeOpen && dist > 1) {
                        const tx = -b.y / dist, ty = b.x / dist
                        const f = spinScale * (0.4 + 0.6 * dist / INNER_R)
                        b.vx += tx * f
                        b.vy += ty * f
                    }

                    if (!holeOpen) {
                        b.vx += (Math.random() - 0.5) * turbScale
                        b.vy += (Math.random() - 0.5) * turbScale
                    } else {
                        // Funnel toward exit: pull laterally toward x=0
                        b.vx -= b.x * 0.008
                    }

                    b.vy += holeOpen ? GRAVITY * 2.5 : GRAVITY
                    b.vx *= friction
                    b.vy *= friction
                    const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
                    if (spd > MAX_SPEED) { b.vx *= MAX_SPEED / spd; b.vy *= MAX_SPEED / spd }
                    b.x += b.vx
                    b.y += b.vy

                    const d = Math.sqrt(b.x * b.x + b.y * b.y)
                    if (d > INNER_R) {
                        if (holeOpen && b.y > 0 && Math.abs(b.x) < HOLE_HALF_W && !winnerCalledRef.current) {
                            winnerCalledRef.current = true
                            winnerIdxRef.current = i
                            cbRef.current(i + 1)
                        } else if (winnerIdxRef.current === i) {
                            // Winner ball already exited, let gravity carry it out
                        } else {
                            const nx = b.x / d, ny = b.y / d
                            b.x = nx * INNER_R
                            b.y = ny * INNER_R
                            const dot = b.vx * nx + b.vy * ny
                            b.vx = (b.vx - 2 * dot * nx) * wallDamp
                            b.vy = (b.vy - 2 * dot * ny) * wallDamp
                        }
                    }
                }

                // Ball-ball collisions via spatial grid — O(n) average vs O(n²) brute force
                _gHead.fill(-1)
                for (let i = 0; i < n; i++) {
                    const gx = Math.floor((balls[i].x + GRID_OFF) / GRID_CELL)
                    const gy = Math.floor((balls[i].y + GRID_OFF) / GRID_CELL)
                    const key = gy * GRID_W + gx
                    _gNext[i] = _gHead[key]
                    _gHead[key] = i as unknown as never
                }
                for (let i = 0; i < n; i++) {
                    const gx = Math.floor((balls[i].x + GRID_OFF) / GRID_CELL)
                    const gy = Math.floor((balls[i].y + GRID_OFF) / GRID_CELL)
                    for (let ddx = -1; ddx <= 1; ddx++) {
                        const ngx = gx + ddx
                        if (ngx < 0 || ngx >= GRID_W) continue
                        for (let ddy = -1; ddy <= 1; ddy++) {
                            const ngy = gy + ddy
                            if (ngy < 0 || ngy >= GRID_W) continue
                            let j = _gHead[ngy * GRID_W + ngx] as unknown as number
                            while (j !== -1) {
                                if (j > i) {
                                    const dx = balls[j].x - balls[i].x
                                    const dy = balls[j].y - balls[i].y
                                    const d2 = dx * dx + dy * dy
                                    if (d2 < MIN_D2 && d2 > 0.01) {
                                        const d = Math.sqrt(d2)
                                        const nx = dx / d, ny = dy / d
                                        const ov = (MIN_D - d) * 0.5
                                        balls[i].x -= nx * ov; balls[i].y -= ny * ov
                                        balls[j].x += nx * ov; balls[j].y += ny * ov
                                        const dvx = balls[i].vx - balls[j].vx
                                        const dvy = balls[i].vy - balls[j].vy
                                        const dot = dvx * nx + dvy * ny
                                        if (dot > 0) {
                                            const imp = dot * BALL_RESTITUTION
                                            balls[i].vx -= imp * nx; balls[i].vy -= imp * ny
                                            balls[j].vx += imp * nx; balls[j].vy += imp * ny
                                        }
                                    }
                                }
                                j = _gNext[j] as unknown as number
                            }
                        }
                    }
                }

                // Fallback: if hole open > 8s and no ball exited (e.g. all stuck), pick nearest
                if (holeOpen && !winnerCalledRef.current && elapsed > SPIN_DURATION + DECEL_DURATION + 8000) {
                    winnerCalledRef.current = true
                    let minD2 = Infinity, fallbackIdx = 0
                    for (let i = 0; i < n; i++) {
                        const bdy = balls[i].y - INNER_R
                        const d2 = balls[i].x * balls[i].x + bdy * bdy
                        if (d2 < minD2) { minD2 = d2; fallbackIdx = i }
                    }
                    cbRef.current(fallbackIdx + 1)
                }
            }

            // Draw balls to canvas
            if (ctx) {
                ctx.clearRect(0, 0, 300, 300)
                ctx.save()
                ctx.beginPath()
                ctx.arc(C, C, CAGE_R - 1, 0, Math.PI * 2)
                ctx.clip()
                ctx.fillStyle = '#040C18'
                ctx.fillRect(0, 0, 300, 300)

                const drawnNum = drawnNumberRef.current
                const balls = physBallsRef.current
                const gridPos = gridPosRef.current
                const usePhys = cp === 'spinning' || cp === 'result'

                // Set text state once outside the loop
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                let curFont = ''

                for (let i = 0; i < totalRef.current; i++) {
                    const num = i + 1
                    if (cp === 'result' && num === drawnNum) continue
                    const src = usePhys ? (balls[i] ?? gridPos[i]) : gridPos[i]
                    const bx = src.x + C, by = src.y + C
                    const color = ballColor(num)

                    ctx.beginPath()
                    ctx.arc(bx, by, BALL_R, 0, Math.PI * 2)
                    ctx.fillStyle = color
                    ctx.fill()

                    ctx.beginPath()
                    ctx.arc(bx - BALL_R * 0.27, by - BALL_R * 0.27, BALL_R * 0.33, 0, Math.PI * 2)
                    ctx.fillStyle = 'rgba(255,255,255,0.22)'
                    ctx.fill()

                    const newFont = num >= 10 ? '900 5.5px system-ui' : '900 6.5px system-ui'
                    if (newFont !== curFont) { ctx.font = newFont; curFont = newFont }
                    ctx.fillStyle = 'rgba(255,255,255,0.92)'
                    ctx.fillText(String(num), bx, by + 0.3)
                }
                ctx.restore()
            }

            rafRef.current = requestAnimationFrame(tick)
        }

        rafRef.current = requestAnimationFrame(tick)
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    }, [])

    const wires = [0, 30, 60, 90, 120, 150]

    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 300, height: 300 }}>
            <canvas ref={canvasRef} width={300} height={300}
                style={{ position: 'absolute', top: 0, left: 0 }} />
            <svg width={300} height={300} viewBox="0 0 300 300"
                style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                <defs>
                    <clipPath id="tombola-cage-clip">
                        <circle cx={C} cy={C} r={CAGE_R - 1} />
                    </clipPath>
                </defs>

                {/* Rotating vertical wires */}
                <g ref={cageWiresRef} clipPath="url(#tombola-cage-clip)"
                    style={{ transformOrigin: `${C}px ${C}px` }}>
                    {wires.map(deg => {
                        const rad = (deg * Math.PI) / 180
                        return (
                            <line key={deg}
                                x1={C + CAGE_R * Math.cos(rad)} y1={C + CAGE_R * Math.sin(rad)}
                                x2={C - CAGE_R * Math.cos(rad)} y2={C - CAGE_R * Math.sin(rad)}
                                stroke="#C97B3A" strokeWidth="1.5" opacity="0.38" />
                        )
                    })}
                </g>

                {/* Horizontal ellipses — depth illusion, static */}
                <ellipse cx={C} cy={112} rx={CAGE_R} ry={24} fill="none" stroke="#C97B3A" strokeWidth="1.5" opacity="0.5" />
                <ellipse cx={C} cy={150} rx={CAGE_R} ry={52} fill="none" stroke="#C97B3A" strokeWidth="2" opacity="0.5" />
                <ellipse cx={C} cy={188} rx={CAGE_R} ry={24} fill="none" stroke="#C97B3A" strokeWidth="1.5" opacity="0.5" />

                {/* Outer ring */}
                <circle cx={C} cy={C} r={CAGE_R} fill="none" stroke="#C97B3A" strokeWidth="3.5" />

                {/* Exit opening at bottom */}
                <path d={`M ${C - 10} ${C + CAGE_R - 1} A ${CAGE_R} ${CAGE_R} 0 0 0 ${C + 10} ${C + CAGE_R - 1}`}
                    fill="none" stroke="#040C18" strokeWidth="7" />
                {holeActive && (
                    <path d={`M ${C - 10} ${C + CAGE_R - 1} A ${CAGE_R} ${CAGE_R} 0 0 0 ${C + 10} ${C + CAGE_R - 1}`}
                        fill="none" stroke="#F59E0B" strokeWidth="2.5" opacity="0.85"
                        style={{ filter: 'drop-shadow(0 0 5px #F59E0B)' }} />
                )}

                {/* Stand */}
                <line x1={114} y1={265} x2={150} y2={278} stroke="#C97B3A" strokeWidth="4" strokeLinecap="round" />
                <line x1={186} y1={265} x2={150} y2={278} stroke="#C97B3A" strokeWidth="4" strokeLinecap="round" />
                <line x1={126} y1={278} x2={174} y2={278} stroke="#C97B3A" strokeWidth="4" strokeLinecap="round" />

                {/* Axis handles */}
                <line x1={C - CAGE_R} y1={C} x2={C - CAGE_R - 12} y2={C} stroke="#C97B3A" strokeWidth="3" strokeLinecap="round" />
                <circle cx={C - CAGE_R - 12} cy={C} r={5} fill="#C97B3A" />
                <line x1={C + CAGE_R} y1={C} x2={C + CAGE_R + 12} y2={C} stroke="#C97B3A" strokeWidth="3" strokeLinecap="round" />
                <circle cx={C + CAGE_R + 12} cy={C} r={5} fill="#C97B3A" />

                {/* Exiting winner ball — rendered last so it appears above stand */}
                {phase === 'result' && winnerPos && drawnNumber && (
                    <g ref={winnerRef}
                        style={{ transformOrigin: `${winnerPos.x}px ${winnerPos.y}px` }}>
                        <circle cx={winnerPos.x} cy={winnerPos.y} r={BALL_R}
                            fill={ballColor(drawnNumber)} stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
                        <text x={winnerPos.x} y={winnerPos.y + 0.3}
                            textAnchor="middle" dominantBaseline="middle"
                            fontSize={drawnNumber >= 10 ? '5.5' : '6.5'} fontWeight="900"
                            fill="white" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                            {drawnNumber}
                        </text>
                    </g>
                )}
            </svg>
        </div>
        {phase === 'spinning' && countdown !== null && countdown > 0 && (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 14px', borderRadius: 999,
                background: countdown <= 3 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                border: `1px solid ${countdown <= 3 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.25)'}`,
            }}>
                <span style={{
                    fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                    color: countdown <= 3 ? '#EF4444' : '#F59E0B',
                    lineHeight: 1,
                }}>{countdown}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#7A8FAA' }}>seg</span>
            </div>
        )}
        </div>
    )
}
