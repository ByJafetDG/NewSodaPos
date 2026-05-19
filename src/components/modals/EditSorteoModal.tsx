import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, AlertTriangle, DollarSign, Gift, Info } from 'lucide-react'
import { BaseModal } from '@/components/modals/BaseModal'
import { Button } from '@/components/atoms/Button'
import { cn } from '@/lib/utils'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import type { KeyboardMode } from '@/store/keyboardStore'
import { useQueryClient } from '@tanstack/react-query'
import {
    updateSorteo, updateSorteoOption, createSorteoOption, deleteSorteoOption,
    getSorteoOptions,
} from '@/services/sorteos'
import type { Sorteo, SorteoOption } from '@/types'

interface Props {
    sorteo: Sorteo | null
    onClose: () => void
}

interface DraftOption {
    _id: string
    existingId?: string
    label: string
    prizeType: 'efectivo' | 'otro'
    prizeValue: string
    quantity: string
    baseProbability: string
    color: string
}

const COLORS = [
    '#F59E0B', '#EF4444', '#3B82F6', '#10B981',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
    '#84CC16', '#6B7280',
]

function dateToInput(d: Date | null): string {
    if (!d) return ''
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function formatColones(raw: string): string {
    if (!raw) return ''
    const num = parseFloat(raw)
    if (isNaN(num)) return ''
    return '₡ ' + num.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function buildDescription(prizeType: 'efectivo' | 'otro', prizeValue: string): string | null {
    if (prizeType === 'efectivo') return prizeValue ? formatColones(prizeValue) : null
    return prizeValue.trim() || null
}

function optionToDraft(o: SorteoOption, idx: number): DraftOption {
    const isEfectivo = !!o.description?.startsWith('₡')
    let prizeValue = ''
    if (o.description) {
        if (isEfectivo) {
            const stripped = o.description.replace(/[₡\s ,]/g, '').match(/[\d.]+/)
            prizeValue = stripped ? stripped[0] : ''
        } else {
            prizeValue = o.description
        }
    }
    return {
        _id: crypto.randomUUID(),
        existingId: o.id,
        label: o.label,
        prizeType: isEfectivo ? 'efectivo' : 'otro',
        prizeValue,
        quantity: o.quantity !== null ? String(o.quantity) : '',
        baseProbability: String(o.baseProbability),
        color: o.color ?? COLORS[idx % COLORS.length],
    }
}

function KbInput({
    value, onChange, mode = 'alpha', placeholder, className,
}: {
    value: string; onChange: (v: string) => void; mode?: KeyboardMode
    placeholder?: string; className?: string
}) {
    const kb = useKeyboardInput(value, onChange, { mode })
    return <input {...kb} placeholder={placeholder} className={className} />
}

function OptionRow({ o, onUpdate, onRemove }: {
    o: DraftOption
    onUpdate: (patch: Partial<DraftOption>) => void
    onRemove: () => void
}) {
    return (
        <div className="p-3 rounded-xl border bg-[#101520] border-[#1E2A40] space-y-2">
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 flex-shrink-0">
                    {COLORS.map(c => (
                        <button
                            key={c}
                            onClick={() => onUpdate({ color: c })}
                            className="w-4 h-4 rounded-full border-2 transition-all cursor-pointer flex-shrink-0"
                            style={{ backgroundColor: c, borderColor: o.color === c ? 'white' : 'transparent' }}
                        />
                    ))}
                </div>
                <button
                    onClick={onRemove}
                    className="ml-auto w-6 h-6 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            <KbInput
                value={o.label}
                onChange={v => onUpdate({ label: v })}
                placeholder="Nombre del premio"
                className="w-full h-8 px-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
            />

            <div className="flex gap-2">
                <div className="flex p-0.5 bg-[#0B0E19] rounded-lg border border-[#1E2A40] flex-shrink-0">
                    <button
                        onClick={() => onUpdate({ prizeType: 'efectivo', prizeValue: '' })}
                        className={cn(
                            'flex items-center gap-1 px-2 h-7 rounded-md text-[11px] font-medium transition-all cursor-pointer',
                            o.prizeType === 'efectivo' ? 'bg-amber-500/20 text-amber-400' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                        )}
                    >
                        <DollarSign size={10} />
                        Efectivo
                    </button>
                    <button
                        onClick={() => onUpdate({ prizeType: 'otro', prizeValue: '' })}
                        className={cn(
                            'flex items-center gap-1 px-2 h-7 rounded-md text-[11px] font-medium transition-all cursor-pointer',
                            o.prizeType === 'otro' ? 'bg-amber-500/20 text-amber-400' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                        )}
                    >
                        <Gift size={10} />
                        Otro
                    </button>
                </div>

                {o.prizeType === 'efectivo' ? (
                    <div className="relative flex-1 min-w-0">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-400 text-[12px] font-bold pointer-events-none select-none">₡</span>
                        <KbInput
                            value={o.prizeValue}
                            onChange={v => onUpdate({ prizeValue: v.replace(/[^\d.]/g, '') })}
                            mode="numeric"
                            placeholder="0"
                            className="w-full h-8 pl-6 pr-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
                        />
                    </div>
                ) : (
                    <KbInput
                        value={o.prizeValue}
                        onChange={v => onUpdate({ prizeValue: v })}
                        placeholder="Descripción del premio..."
                        className="flex-1 min-w-0 h-8 px-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
                    />
                )}

                <KbInput
                    value={o.quantity}
                    onChange={v => onUpdate({ quantity: v })}
                    mode="numeric"
                    placeholder="Cant."
                    className="w-14 flex-shrink-0 h-8 px-2 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] text-center placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
                />

                <div className="relative w-16 flex-shrink-0">
                    <KbInput
                        value={o.baseProbability}
                        onChange={v => onUpdate({ baseProbability: v })}
                        mode="numeric"
                        placeholder="0"
                        className="w-full h-8 pl-2 pr-6 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#3D506A] pointer-events-none">%</span>
                </div>
            </div>

            {o.prizeType === 'efectivo' && o.prizeValue && (
                <p className="text-[10px] text-amber-400/60 pl-1">{formatColones(o.prizeValue)}</p>
            )}
        </div>
    )
}

export function EditSorteoModal({ sorteo, onClose }: Props) {
    const qc = useQueryClient()
    const isRaspadita = sorteo?.type === 'RASPADITA'

    const [name, setName] = useState('')
    const [options, setOptions] = useState<DraftOption[]>([])
    const [originalOptions, setOriginalOptions] = useState<SorteoOption[]>([])
    const [hasDates, setHasDates] = useState(false)
    const [startAt, setStartAt] = useState('')
    const [endAt, setEndAt] = useState('')
    const [minSpins, setMinSpins] = useState('8')
    const [submitting, setSubmitting] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const nameKb = useKeyboardInput(name, setName, { mode: 'alpha' })

    useEffect(() => {
        if (!sorteo) return
        setLoading(true)
        setError(null)
        getSorteoOptions(sorteo.id)
            .then(opts => {
                setOriginalOptions(opts)
                setOptions(opts.filter(o => !o.isFiller).map(optionToDraft))
                setName(sorteo.name)
                setHasDates(!!(sorteo.startAt || sorteo.endAt))
                setStartAt(dateToInput(sorteo.startAt))
                setEndAt(dateToInput(sorteo.endAt))
                setMinSpins(String(sorteo.minSpinsBetweenPrizes ?? 8))
            })
            .finally(() => setLoading(false))
    }, [sorteo?.id]) // eslint-disable-line

    const totalProb = options.reduce((s, o) => s + (parseFloat(o.baseProbability) || 0), 0)
    const probOver = totalProb > 100

    const canSaveRuleta = (
        name.trim().length > 0 &&
        options.length > 0 &&
        options.every(o => o.label.trim() && parseFloat(o.baseProbability) > 0) &&
        !probOver &&
        !submitting
    )
    const canSaveRaspadita = name.trim().length > 0 && !submitting
    const canSave = isRaspadita ? canSaveRaspadita : canSaveRuleta

    function updateOption(id: string, patch: Partial<DraftOption>) {
        setOptions(prev => prev.map(o => o._id === id ? { ...o, ...patch } : o))
    }

    function removeOption(id: string) {
        setOptions(prev => prev.filter(o => o._id !== id))
    }

    function addOption() {
        setOptions(prev => [...prev, {
            _id: crypto.randomUUID(),
            label: '',
            prizeType: 'efectivo',
            prizeValue: '',
            quantity: '1',
            baseProbability: '',
            color: COLORS[prev.length % COLORS.length],
        }])
    }

    async function handleSubmit() {
        if (!sorteo || !canSave) return
        setSubmitting(true)
        setError(null)
        try {
            if (isRaspadita) {
                await updateSorteo(sorteo.id, {
                    name: name.trim(),
                    startAt: hasDates && startAt ? startAt : null,
                    endAt: hasDates && endAt ? endAt : null,
                })
            } else {
                await updateSorteo(sorteo.id, {
                    name: name.trim(),
                    startAt: hasDates && startAt ? startAt : null,
                    endAt: hasDates && endAt ? endAt : null,
                    minSpinsBetweenPrizes: parseInt(minSpins) || 8,
                })

                const originalNonFillerIds = new Set(
                    originalOptions.filter(o => !o.isFiller).map(o => o.id)
                )
                const keptIds = new Set(options.filter(o => o.existingId).map(o => o.existingId!))

                for (const id of originalNonFillerIds) {
                    if (!keptIds.has(id)) await deleteSorteoOption(id)
                }

                for (let i = 0; i < options.length; i++) {
                    const o = options[i]
                    const qty = o.quantity === '' ? null : parseInt(o.quantity) || null
                    const description = buildDescription(o.prizeType, o.prizeValue)
                    if (o.existingId) {
                        await updateSorteoOption(o.existingId, {
                            label: o.label.trim(),
                            description: description ?? null,
                            quantity: qty,
                            baseProbability: parseFloat(o.baseProbability) || 0,
                            color: o.color,
                            sortOrder: i,
                        })
                    } else {
                        await createSorteoOption({
                            sorteoId: sorteo.id,
                            label: o.label.trim(),
                            description: description ?? undefined,
                            quantity: qty,
                            baseProbability: parseFloat(o.baseProbability) || 0,
                            isFiller: false,
                            color: o.color,
                            sortOrder: i,
                        })
                    }
                }

                const hasFiller = originalOptions.some(o => o.isFiller)
                if (!hasFiller) {
                    await createSorteoOption({
                        sorteoId: sorteo.id,
                        label: 'Sin premio',
                        description: null,
                        quantity: null,
                        baseProbability: 0,
                        isFiller: true,
                        color: '#6B7280',
                        sortOrder: options.length,
                    })
                }
            }

            await qc.invalidateQueries({ queryKey: ['sorteos'] })
            await qc.invalidateQueries({ queryKey: ['sorteoOptions', sorteo.id] })
            await qc.invalidateQueries({ queryKey: ['cartSorteo'] })
            onClose()
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Error al guardar')
        } finally {
            setSubmitting(false)
        }
    }

    // ─── Raspadita info display ───────────────────────────────────────────────

    function RaspaditaContent() {
        if (!sorteo) return null
        const skinLabel = sorteo.cardSkin === 'neon' ? 'Neón' : 'Dorada'
        const prizeOptions = options

        return (
            <div className="space-y-4">
                {sorteo.status === 'ACTIVE' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[12px] text-amber-400">
                        <AlertTriangle size={13} />
                        Este sorteo está activo. Los cambios aplican de inmediato.
                    </div>
                )}

                {/* Name */}
                <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Nombre</p>
                    <input
                        {...nameKb}
                        className="w-full h-10 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[14px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/40 transition-colors"
                    />
                </div>

                {/* Config (read-only) */}
                <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Configuración</p>
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { label: 'Raspas', value: sorteo.totalCards ?? '—' },
                            { label: 'Premios', value: sorteo.prizeCount ?? '—' },
                            { label: 'Slots', value: sorteo.slotsPerCard ?? '—' },
                            { label: 'Diseño', value: skinLabel },
                        ].map(c => (
                            <div key={c.label} className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-[#0B0E19] border border-[#1E2A40]">
                                <span className="text-[9px] uppercase tracking-wider text-[#3D506A]">{c.label}</span>
                                <span className="text-[13px] font-semibold text-[#E4ECF7]">{c.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B0E19] border border-[#1E2A40]">
                        <Info size={11} className="text-[#3D506A] flex-shrink-0" />
                        <p className="text-[11px] text-[#3D506A]">Raspas y configuración no se pueden cambiar después de activar.</p>
                    </div>
                </div>

                {/* Prize tiers (read-only) */}
                {prizeOptions.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Premios generados</p>
                        <div className="space-y-1.5">
                            {prizeOptions.map(o => (
                                <div
                                    key={o._id}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0B0E19] border border-[#1E2A40]"
                                >
                                    <div
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ background: o.color }}
                                    />
                                    <span className="text-[12px] font-medium text-[#E4ECF7] flex-1">{o.label}</span>
                                    {o.prizeValue && (
                                        <span className="text-[11px] text-[#7A8FAA]">
                                            {o.prizeType === 'efectivo' ? formatColones(o.prizeValue) : o.prizeValue}
                                        </span>
                                    )}
                                    <span className="text-[11px] text-[#3D506A] tabular-nums">×{o.quantity || '1'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Dates */}
                <DateSection
                    hasDates={hasDates}
                    setHasDates={setHasDates}
                    startAt={startAt}
                    setStartAt={setStartAt}
                    endAt={endAt}
                    setEndAt={setEndAt}
                />
            </div>
        )
    }

    // ─── Ruleta content ───────────────────────────────────────────────────────

    function RuletaContent() {
        return (
            <div className="space-y-4">
                {sorteo?.status === 'ACTIVE' && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[12px] text-amber-400">
                        <AlertTriangle size={13} />
                        Este sorteo está activo. Los cambios aplican de inmediato.
                    </div>
                )}

                {/* Name */}
                <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Nombre</p>
                    <input
                        {...nameKb}
                        className="w-full h-10 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[14px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/40 transition-colors"
                    />
                </div>

                {/* Probability bar */}
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0B0E19] border border-[#1E2A40]">
                    <span className="text-[12px] text-[#3D506A]">
                        {options.length} premio{options.length !== 1 ? 's' : ''}
                    </span>
                    <div className={cn(
                        'ml-auto text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg',
                        probOver ? 'text-red-400 bg-red-500/10' :
                        totalProb === 100 ? 'text-emerald-400 bg-emerald-500/10' :
                        'text-amber-400 bg-amber-500/10'
                    )}>
                        {totalProb.toFixed(1)}%
                        {totalProb < 100 && <span className="text-[#3D506A] font-normal"> + relleno</span>}
                    </div>
                </div>

                {probOver && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15 text-[12px] text-red-400">
                        <AlertTriangle size={13} />
                        Las probabilidades superan 100%. Reduce algún valor.
                    </div>
                )}

                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0B0E19] border border-[#1E2A40]">
                    <span className="text-[12px] text-[#7A8FAA]">Giros sin premio tras ganar</span>
                    <div className="relative ml-auto w-20">
                        <KbInput
                            value={minSpins}
                            onChange={v => setMinSpins(v)}
                            mode="numeric"
                            placeholder="8"
                            className="w-full h-7 pl-2 pr-8 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[12px] text-right placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#3D506A] pointer-events-none">giros</span>
                    </div>
                </div>

                {/* Options */}
                <div className="max-h-[42vh] overflow-y-auto pr-1 space-y-2">
                    {options.map(o => (
                        <OptionRow
                            key={o._id}
                            o={o}
                            onUpdate={patch => updateOption(o._id, patch)}
                            onRemove={() => removeOption(o._id)}
                        />
                    ))}

                    <button
                        onClick={addOption}
                        className="w-full h-9 rounded-xl border border-dashed border-[#1E2A40] text-[12px] text-[#3D506A] hover:text-[#7A8FAA] hover:border-[#283A56] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                        <Plus size={13} />
                        Agregar premio
                    </button>
                </div>

                {/* Dates */}
                <DateSection
                    hasDates={hasDates}
                    setHasDates={setHasDates}
                    startAt={startAt}
                    setStartAt={setStartAt}
                    endAt={endAt}
                    setEndAt={setEndAt}
                />
            </div>
        )
    }

    return (
        <BaseModal
            isOpen={!!sorteo}
            onClose={onClose}
            title={`Editar ${isRaspadita ? 'raspadita' : 'ruleta'}`}
            description={sorteo?.name ?? ''}
            width="max-w-2xl"
        >
            {loading ? (
                <div className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="max-h-[58vh] overflow-y-auto pr-1">
                        {isRaspadita ? <RaspaditaContent /> : <RuletaContent />}
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15 text-[12px] text-red-400">
                            <AlertTriangle size={13} />
                            {error}
                        </div>
                    )}

                    <div className="flex gap-2 pt-1 border-t border-[#192030]">
                        <Button variant="secondary" size="md" onClick={onClose} className="flex-1">
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            size="md"
                            onClick={handleSubmit}
                            disabled={!canSave}
                            loading={submitting}
                            className="flex-1"
                        >
                            Guardar cambios
                        </Button>
                    </div>
                </div>
            )}
        </BaseModal>
    )
}

// ─── DateSection (shared) ─────────────────────────────────────────────────────

function DateSection({ hasDates, setHasDates, startAt, setStartAt, endAt, setEndAt }: {
    hasDates: boolean
    setHasDates: (v: boolean | ((v: boolean) => boolean)) => void
    startAt: string
    setStartAt: (v: string) => void
    endAt: string
    setEndAt: (v: string) => void
}) {
    return (
        <div className="space-y-2">
            <button
                onClick={() => setHasDates(v => !v)}
                className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer text-left',
                    hasDates ? 'bg-amber-500/10 border-amber-500/25' : 'bg-[#101520] border-[#1E2A40] hover:border-[#283A56]'
                )}
            >
                <div className={cn(
                    'w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border',
                    hasDates ? 'bg-amber-500 border-amber-500' : 'border-[#283A56]'
                )}>
                    {hasDates && <Check size={10} className="text-black" />}
                </div>
                <p className={cn('text-[13px] font-medium', hasDates ? 'text-amber-400' : 'text-[#7A8FAA]')}>
                    {hasDates ? 'Fechas programadas' : 'Sin fecha límite'}
                </p>
            </button>

            {hasDates && (
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">Desde</p>
                        <input
                            type="datetime-local"
                            value={startAt}
                            onChange={e => setStartAt(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[12px] outline-none focus:border-amber-500/40 transition-colors"
                        />
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">Hasta</p>
                        <input
                            type="datetime-local"
                            value={endAt}
                            min={startAt}
                            onChange={e => setEndAt(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[12px] outline-none focus:border-amber-500/40 transition-colors"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
