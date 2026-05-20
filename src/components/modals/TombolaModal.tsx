import { useState, useEffect } from 'react'
import { AlertTriangle, Trophy, RotateCcw, Shuffle, Mail, X, CheckCircle } from 'lucide-react'
import { BaseModal } from '@/components/modals/BaseModal'
import { Button } from '@/components/atoms/Button'
import { cn } from '@/lib/utils'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useQueryClient } from '@tanstack/react-query'
import { createTombolaEntry, setTombolaWinner } from '@/services/tombola'
import { updateSorteo } from '@/services/sorteos'
import { sendTombolaWinnerEmail } from '@/services/emailTombola'
import { useTombolaEntries } from '@/hooks/useSorteos'
import { TombolaCage } from '@/components/TombolaCage'
import type { Sorteo, TombolaEntry } from '@/types'

interface Props {
    sorteo: Sorteo | null
    onClose: () => void
}

type View = 'grid' | 'sell' | 'draw'
type DrawPhase = 'idle' | 'confirm' | 'spinning' | 'result'

export function TombolaModal({ sorteo, onClose }: Props) {
    const qc = useQueryClient()
    const { data: entries = [] } = useTombolaEntries(sorteo?.id ?? null)

    const [view, setView] = useState<View>('grid')

    // ─── Sell state
    const [selectedNum, setSelectedNum] = useState<number | null>(null)
    const [detailEntry, setDetailEntry] = useState<TombolaEntry | null>(null)
    const [pName, setPName] = useState('')
    const [pCedula, setPCedula] = useState('')
    const [pEmail, setPEmail] = useState('')
    const [payMethod, setPayMethod] = useState<'EFECTIVO' | 'SINPE'>('EFECTIVO')
    const [submitting, setSubmitting] = useState(false)
    const [sellError, setSellError] = useState<string | null>(null)

    // ─── Draw state
    const [drawPhase, setDrawPhase] = useState<DrawPhase>('idle')
    const [drawnNumber, setDrawnNumber] = useState<number | null>(null)
    const [drawnEntry, setDrawnEntry] = useState<TombolaEntry | null>(null)
    const [isNoWinner, setIsNoWinner] = useState(false)
    const [prizeIdx, setPrizeIdx] = useState(0)
    const [confirming, setConfirming] = useState(false)
    const [finalizing, setFinalizing] = useState(false)
    const [drawError, setDrawError] = useState<string | null>(null)

    const nameKb = useKeyboardInput(pName, setPName, { mode: 'alpha' })
    const cedulaKb = useKeyboardInput(pCedula, setPCedula, { mode: 'numeric' })
    const emailKb = useKeyboardInput(pEmail, setPEmail, { mode: 'alpha' })

    useEffect(() => {
        if (sorteo) {
            setView('grid')
            setDetailEntry(null)
            setSelectedNum(null)
            setSellError(null)
            resetDraw(0)
        }
    }, [sorteo?.id]) // eslint-disable-line

    // ─── Derived
    const totalNumbers = sorteo?.totalNumbers ?? 0
    const price = sorteo?.pricePerNumber ?? 0
    const prizes = sorteo?.tombPrizes ?? []
    const soldMap = new Map(entries.map(e => [e.number, e]))
    const soldCount = soldMap.size
    const currentPrize = prizes[prizeIdx] ?? null
    const prizeAlreadyAwarded = entries.some(e => e.isWinner && e.prizePosition === prizeIdx)
    const allAwarded = prizes.length > 0 && prizes.every((_, i) =>
        entries.some(e => e.isWinner && e.prizePosition === i)
    )
    const cols = totalNumbers <= 100 ? 10 : totalNumbers <= 200 ? 20 : 25

    if (!sorteo) return null

    function resetDraw(idx: number) {
        setDrawPhase('idle')
        setDrawnNumber(null)
        setDrawnEntry(null)
        setIsNoWinner(false)
        setDrawError(null)
        setConfirming(false)
        setPrizeIdx(idx)
    }

    function openDraw() {
        const first = prizes.findIndex((_, i) => !entries.some(e => e.isWinner && e.prizePosition === i))
        resetDraw(first >= 0 ? first : 0)
        setView('draw')
    }

    // ─── Sell handlers
    function selectNumber(n: number) {
        setSelectedNum(n)
        setPName(''); setPCedula(''); setPEmail('')
        setPayMethod('EFECTIVO'); setSellError(null)
        setView('sell')
    }

    function backToGrid() {
        setView('grid'); setSelectedNum(null); setSellError(null)
    }

    const canSubmit = pName.trim().length > 0 && pCedula.trim().length > 0 && !submitting

    async function handleSell() {
        if (!canSubmit || !selectedNum || !sorteo) return
        setSubmitting(true); setSellError(null)
        try {
            await createTombolaEntry({
                sorteoId: sorteo.id,
                sorteoName: sorteo.name,
                number: selectedNum,
                participantName: pName.trim(),
                participantCedula: pCedula.trim(),
                participantEmail: pEmail.trim() || null,
                paymentMethod: payMethod,
                price,
            })
            qc.invalidateQueries({ queryKey: ['tombola-entries'] })
            qc.invalidateQueries({ queryKey: ['sales'] })
            qc.invalidateQueries({ queryKey: ['active-register'] })
            backToGrid()
        } catch (e: unknown) {
            setSellError(e instanceof Error ? e.message : 'Error al registrar')
        } finally { setSubmitting(false) }
    }

    // ─── Draw handlers
    function handleSpinComplete(n: number) {
        setDrawnNumber(n)
        const entry = entries.find(e => e.number === n && !e.isWinner) ?? null
        setDrawnEntry(entry)
        setIsNoWinner(!entry)
        setDrawPhase('result')
    }

    async function confirmWinner() {
        if (!drawnEntry || !sorteo) return
        setConfirming(true); setDrawError(null)
        try {
            await setTombolaWinner(drawnEntry.id, prizeIdx)
            qc.invalidateQueries({ queryKey: ['tombola-entries'] })
            if (drawnEntry.participantEmail) {
                const prize = prizes[prizeIdx]
                sendTombolaWinnerEmail({
                    to: drawnEntry.participantEmail,
                    participantName: drawnEntry.participantName,
                    sorteoName: sorteo.name,
                    number: drawnEntry.number,
                    prizeName: prize?.name ?? 'Premio',
                    prizeAmount: prize?.type === 'EFECTIVO' ? (prize.amount ?? null) : null,
                    drawDate: sorteo.drawDate ?? null,
                }).catch(() => {})
            }
            const next = prizes.findIndex((_, i) =>
                i > prizeIdx && !entries.some(e => e.isWinner && e.prizePosition === i)
            )
            resetDraw(next >= 0 ? next : prizeIdx)
        } catch (e: unknown) {
            setDrawError(e instanceof Error ? e.message : 'Error al confirmar')
        } finally { setConfirming(false) }
    }

    function redraw() {
        setDrawnNumber(null); setDrawnEntry(null)
        setIsNoWinner(false); setDrawError(null)
        setDrawPhase('spinning')
    }

    async function finalizeSorteo() {
        if (!sorteo) return
        setFinalizing(true); setDrawError(null)
        try {
            await updateSorteo(sorteo.id, { status: 'ENDED' })
            qc.invalidateQueries({ queryKey: ['sorteos'] })
            onClose()
        } catch (e: unknown) {
            setDrawError(e instanceof Error ? e.message : 'Error al finalizar')
        } finally { setFinalizing(false) }
    }

    // ─── Descriptions
    const gridDesc = `${soldCount} vendidos · ${totalNumbers - soldCount} disponibles · ₡${(soldCount * price).toLocaleString('es-CR')} recaudado`
    const sellDesc = `Número ${selectedNum} · ₡${price.toLocaleString('es-CR')}`
    const drawDesc = 'Sorteo de premios'

    // ════════════════════════════════════════════════════════════════
    // GRID VIEW
    // ════════════════════════════════════════════════════════════════
    if (view === 'grid') return (
        <BaseModal isOpen={!!sorteo} onClose={onClose}
            title={sorteo.name} description={gridDesc} width="max-w-3xl">
            <div className="space-y-3">
                {/* Number grid */}
                <div className="max-h-[52vh] overflow-y-auto pr-0.5">
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                        {Array.from({ length: totalNumbers }, (_, i) => i + 1).map(n => {
                            const entry = soldMap.get(n)
                            const isSold = !!entry
                            return (
                                <button
                                    key={n}
                                    onClick={() => isSold ? setDetailEntry(entry!) : selectNumber(n)}
                                    className={cn(
                                        'aspect-square rounded-lg flex flex-col items-center justify-center transition-all select-none active:scale-95',
                                        isSold
                                            ? 'bg-[#0A1A1A] border border-emerald-900/40 cursor-pointer active:bg-emerald-900/20'
                                            : 'bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 cursor-pointer'
                                    )}
                                >
                                    {isSold ? (
                                        <>
                                            <CheckCircle size={8} className="text-emerald-600 mb-0.5 flex-shrink-0" />
                                            <span className="text-[9px] font-bold text-emerald-700/80 leading-none">{n}</span>
                                        </>
                                    ) : (
                                        <span className="text-[11px] font-bold">{n}</span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Detail panel for sold numbers */}
                {detailEntry && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[#0A1E1E] border border-emerald-900/40">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[13px] font-black text-emerald-400 tabular-nums">{detailEntry.number}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-[#E4ECF7] truncate">{detailEntry.participantName}</p>
                            <p className="text-[11px] text-[#7A8FAA]">{detailEntry.participantCedula}</p>
                            {detailEntry.participantEmail && (
                                <p className="text-[10px] text-[#3D506A] flex items-center gap-1 mt-0.5">
                                    <Mail size={9} />{detailEntry.participantEmail}
                                </p>
                            )}
                            <p className="text-[10px] text-[#3D506A] mt-0.5">
                                {detailEntry.paymentMethod} · ₡{detailEntry.price.toLocaleString('es-CR')}
                            </p>
                        </div>
                        <button
                            onClick={() => setDetailEntry(null)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-[#E4ECF7] hover:bg-[#1E2A40] transition-all cursor-pointer flex-shrink-0"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}

                {/* Legend */}
                <div className="flex items-center gap-4 text-[10px] text-[#3D506A]">
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/30 inline-block" />
                        Disponible (toca para vender)
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-emerald-900/30 border border-emerald-900/40 inline-block" />
                        Vendido (toca para ver detalles)
                    </span>
                </div>

                <div className="flex gap-2 pt-1 border-t border-[#192030]">
                    <Button variant="secondary" size="md" onClick={onClose} className="flex-1">
                        Cerrar
                    </Button>
                    {prizes.length > 0 && soldCount > 0 && (
                        <Button variant="primary" size="md" onClick={openDraw} className="flex-1 gap-1.5">
                            <Shuffle size={14} />
                            {allAwarded ? 'Ver ganadores' : 'Realizar sorteo'}
                        </Button>
                    )}
                </div>
            </div>
        </BaseModal>
    )

    // ════════════════════════════════════════════════════════════════
    // SELL VIEW
    // ════════════════════════════════════════════════════════════════
    if (view === 'sell') return (
        <BaseModal isOpen={!!sorteo} onClose={onClose}
            title={sorteo.name} description={sellDesc} width="max-w-md">
            <div className="space-y-4">
                <div className="flex items-center justify-center py-2">
                    <div className="w-24 h-24 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center">
                        <span className="text-[36px] font-black text-amber-400 tabular-nums">{selectedNum}</span>
                    </div>
                </div>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Nombre</p>
                        <input {...nameKb} placeholder="Nombre del participante"
                            className="w-full h-10 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[14px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/40 transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Cédula</p>
                        <input {...cedulaKb} placeholder="Número de cédula"
                            className="w-full h-10 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[14px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/40 transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">
                            Correo <span className="normal-case font-normal text-[#283A56]">(opcional)</span>
                        </p>
                        <input {...emailKb} placeholder="correo@ejemplo.com"
                            className="w-full h-10 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[14px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/40 transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Método de pago</p>
                        <div className="flex p-1 bg-[#101520] rounded-xl border border-[#1E2A40] gap-1">
                            {(['EFECTIVO', 'SINPE'] as const).map(m => (
                                <button key={m} onClick={() => setPayMethod(m)}
                                    className={cn('flex-1 h-9 rounded-lg text-[13px] font-semibold transition-all cursor-pointer',
                                        payMethod === m ? 'bg-amber-500/20 text-amber-400' : 'text-[#3D506A] hover:text-[#7A8FAA]')}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                {sellError && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15 text-[12px] text-red-400">
                        <AlertTriangle size={13} />{sellError}
                    </div>
                )}
                <div className="flex gap-2 pt-1 border-t border-[#192030]">
                    <Button variant="secondary" size="md" onClick={backToGrid} className="flex-1">← Volver</Button>
                    <Button variant="primary" size="md" onClick={handleSell} disabled={!canSubmit} loading={submitting} className="flex-1">
                        Registrar venta · ₡{price.toLocaleString('es-CR')}
                    </Button>
                </div>
            </div>
        </BaseModal>
    )

    // ════════════════════════════════════════════════════════════════
    // DRAW VIEW
    // ════════════════════════════════════════════════════════════════
    return (
        <BaseModal isOpen={!!sorteo} onClose={onClose}
            title={sorteo.name} description={drawDesc} width="max-w-lg">
            <div className="space-y-4">

                {/* Prize selector */}
                {prizes.length > 0 && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => { if (prizeIdx > 0) resetDraw(prizeIdx - 1) }}
                            disabled={prizeIdx === 0 || drawPhase === 'spinning'}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#101520] border border-[#1E2A40] text-[#3D506A] hover:text-[#E4ECF7] disabled:opacity-30 disabled:cursor-default transition-all cursor-pointer text-lg"
                        >‹</button>
                        <div className="flex-1 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-[#3D506A]">
                                Premio {prizeIdx + 1} de {prizes.length}
                            </p>
                            <p className="text-[14px] font-semibold text-[#E4ECF7] truncate">
                                {currentPrize?.name ?? '—'}
                                {currentPrize?.type === 'EFECTIVO' && currentPrize.amount != null && (
                                    <span className="ml-2 text-emerald-400 text-[13px]">
                                        ₡{currentPrize.amount.toLocaleString('es-CR')}
                                    </span>
                                )}
                            </p>
                            {prizeAlreadyAwarded && (
                                <p className="text-[11px] text-emerald-400 mt-0.5">✓ Ya asignado</p>
                            )}
                        </div>
                        <button
                            onClick={() => { if (prizeIdx < prizes.length - 1) resetDraw(prizeIdx + 1) }}
                            disabled={prizeIdx >= prizes.length - 1 || drawPhase === 'spinning'}
                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#101520] border border-[#1E2A40] text-[#3D506A] hover:text-[#E4ECF7] disabled:opacity-30 disabled:cursor-default transition-all cursor-pointer text-lg"
                        >›</button>
                    </div>
                )}

                {/* Cage */}
                <div className="flex justify-center">
                    <TombolaCage
                        totalNumbers={Math.min(totalNumbers, 100)}
                        phase={drawPhase === 'confirm' ? 'idle' : drawPhase === 'result' || drawPhase === 'spinning' ? drawPhase : 'idle'}
                        drawnNumber={drawnNumber}
                        onSpinComplete={handleSpinComplete}
                    />
                </div>

                {/* Confirmation overlay */}
                {drawPhase === 'confirm' && (
                    <div className="px-4 py-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-center space-y-3">
                        <p className="text-[14px] font-semibold text-[#E4ECF7]">¿Iniciar el sorteo?</p>
                        <p className="text-[12px] text-[#7A8FAA]">
                            Se sorteará entre los {totalNumbers} números
                            {soldCount > 0 && ` · ${soldCount} vendidos`}
                        </p>
                        <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setDrawPhase('idle')} className="flex-1">
                                Cancelar
                            </Button>
                            <Button variant="primary" size="sm" onClick={() => setDrawPhase('spinning')} className="flex-1 gap-1.5">
                                <Shuffle size={13} />
                                Confirmar y sortear
                            </Button>
                        </div>
                    </div>
                )}

                {/* Result card */}
                {drawPhase === 'result' && drawnNumber && (
                    <div className={cn(
                        'px-4 py-4 rounded-2xl border text-center space-y-1',
                        drawnEntry
                            ? 'bg-emerald-500/5 border-emerald-500/25'
                            : 'bg-[#101520] border-[#1E2A40]'
                    )}>
                        <p className={cn('text-[28px] font-black tabular-nums',
                            drawnEntry ? 'text-emerald-400' : 'text-[#7A8FAA]')}>
                            #{drawnNumber}
                        </p>
                        {drawnEntry ? (
                            <>
                                <p className="text-[15px] font-semibold text-[#E4ECF7]">{drawnEntry.participantName}</p>
                                <p className="text-[12px] text-[#7A8FAA]">{drawnEntry.participantCedula}</p>
                                {drawnEntry.participantEmail && (
                                    <p className="text-[11px] text-[#3D506A] flex items-center justify-center gap-1">
                                        <Mail size={10} />{drawnEntry.participantEmail}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-[12px] text-[#3D506A]">Número no vendido · Premio queda en el negocio</p>
                        )}
                    </div>
                )}

                {/* All prizes awarded */}
                {allAwarded && drawPhase === 'idle' && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[13px] text-emerald-400">
                            <Trophy size={14} />
                            Todos los premios han sido asignados
                        </div>
                        <Button variant="primary" size="md" onClick={finalizeSorteo} loading={finalizing} className="w-full">
                            Finalizar sorteo
                        </Button>
                    </div>
                )}

                {drawError && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15 text-[12px] text-red-400">
                        <AlertTriangle size={13} />{drawError}
                    </div>
                )}

                {/* Winners list */}
                {entries.filter(e => e.isWinner).length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-[#3D506A]">Ganadores</p>
                        <div className="space-y-1 max-h-[18vh] overflow-y-auto pr-0.5">
                            {entries.filter(e => e.isWinner).map(e => {
                                const prize = prizes[e.prizePosition ?? 0]
                                return (
                                    <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0B1520] border border-[#1A2535]">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                            <span className="text-[11px] font-bold text-emerald-400 tabular-nums">{e.number}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-medium text-[#E4ECF7] truncate">{e.participantName}</p>
                                            {prize && <p className="text-[10px] text-[#3D506A] truncate">{prize.name}</p>}
                                        </div>
                                        {e.participantEmail && (
                                            <span title={e.participantEmail}>
                                                <Mail size={11} className="text-[#3D506A] flex-shrink-0" />
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-1 border-t border-[#192030]">
                    <Button variant="secondary" size="md" onClick={() => { setView('grid'); resetDraw(0) }} className="flex-1">
                        ← Volver
                    </Button>

                    {drawPhase === 'idle' && !prizeAlreadyAwarded && soldCount > 0 && (
                        <Button variant="primary" size="md" onClick={() => setDrawPhase('confirm')} className="flex-1 gap-1.5">
                            <Shuffle size={14} />
                            Sortear
                        </Button>
                    )}

                    {drawPhase === 'result' && drawnNumber && !prizeAlreadyAwarded && (
                        <>
                            <Button variant="secondary" size="md" onClick={redraw} className="gap-1.5">
                                <RotateCcw size={13} />
                                Re-sortear
                            </Button>
                            {drawnEntry && (
                                <Button variant="primary" size="md" onClick={confirmWinner} loading={confirming} className="flex-1">
                                    Confirmar ganador
                                </Button>
                            )}
                            {isNoWinner && (
                                <>
                                    <Button variant="secondary" size="md" onClick={() => resetDraw(prizeIdx)} className="flex-1">
                                        Siguiente
                                    </Button>
                                    <Button variant="primary" size="md" onClick={finalizeSorteo} loading={finalizing} className="flex-1">
                                        Finalizar sorteo
                                    </Button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </BaseModal>
    )
}
