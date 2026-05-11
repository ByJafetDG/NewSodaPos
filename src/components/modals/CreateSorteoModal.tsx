import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, AlertTriangle, DollarSign, Gift, Search, Lock } from 'lucide-react'
import { BaseModal } from '@/components/modals/BaseModal'
import { Button } from '@/components/atoms/Button'
import { cn } from '@/lib/utils'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import type { KeyboardMode } from '@/store/keyboardStore'
import { useCategories } from '@/hooks/useCategories'
import { useProducts } from '@/hooks/useProducts'
import { useQueryClient } from '@tanstack/react-query'
import {
    createSorteo, createSorteoOption,
    setSorteoParticipants, updateSorteo,
} from '@/services/sorteos'
import { useOccupiedParticipants } from '@/hooks/useSorteos'

interface Props {
    isOpen: boolean
    onClose: () => void
}

interface DraftOption {
    _id: string
    label: string
    prizeType: 'efectivo' | 'otro'
    prizeValue: string
    quantity: string
    baseProbability: string
    color: string
}

type Participant = { type: 'PRODUCT' | 'CATEGORY'; refId: string }

const COLORS = [
    '#F59E0B', '#EF4444', '#3B82F6', '#10B981',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
    '#84CC16', '#6B7280',
]

const WHEEL_SIZES = [10, 20, 30, 50, 100]
const FILLER_COLOR = '#6B7280'
const STEPS = ['Nombre', 'Premios', 'Participantes', 'Vigencia', 'Resumen']

function makeOption(sortOrder: number): DraftOption {
    return {
        _id: crypto.randomUUID(),
        label: '',
        prizeType: 'efectivo',
        prizeValue: '',
        quantity: '1',
        baseProbability: '',
        color: COLORS[sortOrder % COLORS.length],
    }
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

function KbInput({
    value, onChange, mode = 'alpha', placeholder, className, disabled,
}: {
    value: string; onChange: (v: string) => void; mode?: KeyboardMode
    placeholder?: string; className?: string; disabled?: boolean
}) {
    const kb = useKeyboardInput(value, onChange, { mode })
    return <input {...kb} placeholder={placeholder} disabled={disabled} className={className} />
}

function OptionRow({ o, onUpdate, onRemove }: {
    o: DraftOption
    onUpdate: (patch: Partial<DraftOption>) => void
    onRemove: () => void
}) {
    return (
        <div className="p-3 rounded-xl border bg-[#101520] border-[#1E2A40] space-y-2">
            {/* Color + remove */}
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

            {/* Prize name */}
            <KbInput
                value={o.label}
                onChange={v => onUpdate({ label: v })}
                placeholder="Nombre del premio (ej: Premio Mayor)"
                className="w-full h-8 px-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
            />

            {/* Type + value + quantity */}
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
                        placeholder="Ej: Pollo asado..."
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

export function CreateSorteoModal({ isOpen, onClose }: Props) {
    const qc = useQueryClient()
    const { data: categories = [] } = useCategories(false)
    const { data: products = [] } = useProducts()

    const [step, setStep] = useState(1)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [name, setName] = useState('')
    const [wheelSize, setWheelSize] = useState(20)
    const [options, setOptions] = useState<DraftOption[]>([makeOption(0)])
    const [participants, setParticipants] = useState<Participant[]>([])
    const [participantTab, setParticipantTab] = useState<'cat' | 'prod'>('cat')
    const [participantSearch, setParticipantSearch] = useState('')
    const [hasDates, setHasDates] = useState(false)
    const [startAt, setStartAt] = useState('')
    const [endAt, setEndAt] = useState('')
    const [minSpins, setMinSpins] = useState('8')

    const nameKb = useKeyboardInput(name, setName, { mode: 'alpha' })
    const searchKb = useKeyboardInput(participantSearch, setParticipantSearch, { mode: 'alpha' })

    const { data: occupiedParticipants = [] } = useOccupiedParticipants()

    function getConflict(type: 'PRODUCT' | 'CATEGORY', refId: string): string | null {
        if (type === 'CATEGORY') {
            const direct = occupiedParticipants.find(op => op.type === 'CATEGORY' && op.refId === refId)
            if (direct) return direct.sorteoName
            const catProds = products.filter(p => p.categoryId === refId)
            for (const cp of catProds) {
                const indirect = occupiedParticipants.find(op => op.type === 'PRODUCT' && op.refId === cp.id)
                if (indirect) return indirect.sorteoName
            }
        } else {
            const direct = occupiedParticipants.find(op => op.type === 'PRODUCT' && op.refId === refId)
            if (direct) return direct.sorteoName
            const prod = products.find(p => p.id === refId)
            if (prod) {
                const indirect = occupiedParticipants.find(op => op.type === 'CATEGORY' && op.refId === prod.categoryId)
                if (indirect) return indirect.sorteoName
            }
        }
        return null
    }

    const fillerSlots = Math.max(0, wheelSize - options.length)
    const totalProb = options.reduce((s, o) => s + (parseFloat(o.baseProbability) || 0), 0)
    const probOver = totalProb > 100

    useEffect(() => {
        if (isOpen) {
            setStep(1)
            setName('')
            setWheelSize(20)
            setOptions([makeOption(0)])
            setParticipants([])
            setParticipantTab('cat')
            setParticipantSearch('')
            setHasDates(false)
            setStartAt('')
            setEndAt('')
            setMinSpins('8')
            setError(null)
        }
    }, [isOpen])

    function updateOption(id: string, patch: Partial<DraftOption>) {
        setOptions(prev => prev.map(o => o._id === id ? { ...o, ...patch } : o))
    }

    function removeOption(id: string) {
        setOptions(prev => prev.filter(o => o._id !== id))
    }

    function addOption() {
        if (options.length >= wheelSize) return
        setOptions(prev => [...prev, makeOption(prev.length)])
    }

    function toggleParticipant(type: 'PRODUCT' | 'CATEGORY', refId: string) {
        const exists = participants.some(p => p.type === type && p.refId === refId)
        if (!exists) {
            const conflict = getConflict(type, refId)
            if (conflict) { setError(`Ya participa en otro sorteo activo: "${conflict}"`); return }
        }
        setError(null)
        setParticipants(prev =>
            exists ? prev.filter(p => !(p.type === type && p.refId === refId)) : [...prev, { type, refId }]
        )
    }

    function isSelected(type: 'PRODUCT' | 'CATEGORY', refId: string) {
        return participants.some(p => p.type === type && p.refId === refId)
    }

    function canAdvance(): boolean {
        if (step === 1) return name.trim().length > 0
        if (step === 2) return (
            options.length > 0 &&
            options.length <= wheelSize &&
            options.every(o => o.label.trim() && parseFloat(o.baseProbability) > 0) &&
            !probOver
        )
        if (step === 3) return participants.length > 0
        if (step === 4) return !hasDates || (!!startAt && !!endAt)
        return true
    }

    async function handleSubmit(activate: boolean) {
        setSubmitting(true)
        setError(null)
        try {
            const sorteo = await createSorteo({ name: name.trim(), minSpinsBetweenPrizes: parseInt(minSpins) || 8 })

            for (let i = 0; i < options.length; i++) {
                const o = options[i]
                const qty = o.quantity === '' ? null : parseInt(o.quantity) || null
                const description = buildDescription(o.prizeType, o.prizeValue)
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

            if (fillerSlots > 0) {
                await createSorteoOption({
                    sorteoId: sorteo.id,
                    label: 'Sin premio',
                    description: null,
                    quantity: null,
                    baseProbability: 0,
                    isFiller: true,
                    color: FILLER_COLOR,
                    sortOrder: options.length,
                })
            }

            if (participants.length > 0) {
                await setSorteoParticipants(sorteo.id, participants)
            }

            if (activate) {
                await updateSorteo(sorteo.id, {
                    status: 'ACTIVE',
                    startAt: hasDates && startAt ? startAt : null,
                    endAt: hasDates && endAt ? endAt : null,
                })
            }

            await qc.invalidateQueries({ queryKey: ['sorteos'] })
            onClose()
        } catch (e: any) {
            setError(e?.message ?? 'Error al crear el sorteo')
        } finally {
            setSubmitting(false)
        }
    }

    const catParticipants = participants.filter(p => p.type === 'CATEGORY')
    const prodParticipants = participants.filter(p => p.type === 'PRODUCT')

    const q = participantSearch.toLowerCase()
    const filteredCats = categories.filter(c => c.isActive && (!q || c.name.toLowerCase().includes(q)))
    const filteredProds = products.filter(p => p.isActive && (!q || p.name.toLowerCase().includes(q)))

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Nuevo Sorteo"
            description={`Paso ${step} de ${STEPS.length} — ${STEPS[step - 1]}`}
            width="max-w-2xl"
        >
            <div className="space-y-5">
                {/* Step indicator */}
                <div className="flex items-center gap-1">
                    {STEPS.map((_, i) => {
                        const n = i + 1
                        const done = n < step
                        const active = n === step
                        return (
                            <div key={n} className="flex items-center gap-1 flex-1">
                                <div className={cn(
                                    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0',
                                    done ? 'bg-amber-500 text-black' :
                                    active ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400' :
                                    'bg-[#101520] border border-[#1E2A40] text-[#3D506A]'
                                )}>
                                    {done ? <Check size={11} /> : n}
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div className={cn('flex-1 h-px', done ? 'bg-amber-500/40' : 'bg-[#1E2A40]')} />
                                )}
                            </div>
                        )
                    })}
                </div>

                <div className="max-h-[52vh] overflow-y-auto pr-1">

                    {/* Step 1 */}
                    {step === 1 && (
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Nombre del sorteo</p>
                            <input
                                type="text"
                                {...nameKb}
                                placeholder="Ej: Sorteo de verano, Rifa del mes..."
                                className="w-full h-11 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[14px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/40 transition-colors"
                                autoFocus
                            />
                            <p className="text-[12px] text-[#3D506A]">
                                Tipo: <span className="text-amber-400 font-medium">Ruleta</span>
                            </p>
                        </div>
                    )}

                    {/* Step 2 */}
                    {step === 2 && (
                        <div className="space-y-3">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-2">Tamaño de la ruleta</p>
                                <div className="flex gap-1.5">
                                    {WHEEL_SIZES.map(sz => (
                                        <button
                                            key={sz}
                                            onClick={() => setWheelSize(sz)}
                                            className={cn(
                                                'flex-1 h-8 rounded-lg text-[12px] font-semibold border transition-all cursor-pointer',
                                                wheelSize === sz
                                                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                                                    : 'bg-[#0B0E19] border-[#1E2A40] text-[#3D506A] hover:text-[#7A8FAA] hover:border-[#283A56]'
                                            )}
                                        >
                                            {sz}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Slots + probability status */}
                            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0B0E19] border border-[#1E2A40]">
                                <span className="text-[12px]">
                                    <span className="font-bold text-amber-400">{options.length}</span>
                                    <span className="text-[#3D506A]"> de {wheelSize} slots · {fillerSlots} relleno auto</span>
                                </span>
                                <div className={cn(
                                    'ml-auto text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg',
                                    probOver ? 'text-red-400 bg-red-500/10' :
                                    totalProb === 100 ? 'text-emerald-400 bg-emerald-500/10' :
                                    'text-amber-400 bg-amber-500/10'
                                )}>
                                    {totalProb.toFixed(1)}%
                                    {fillerSlots > 0 && <span className="text-[#3D506A] font-normal"> + relleno</span>}
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

                            <div className="space-y-2">
                                {options.map(o => (
                                    <OptionRow
                                        key={o._id}
                                        o={o}
                                        onUpdate={patch => updateOption(o._id, patch)}
                                        onRemove={() => removeOption(o._id)}
                                    />
                                ))}
                            </div>

                            <button
                                onClick={addOption}
                                disabled={options.length >= wheelSize}
                                className={cn(
                                    'w-full h-9 rounded-xl border border-dashed text-[12px] transition-all flex items-center justify-center gap-1.5',
                                    options.length >= wheelSize
                                        ? 'border-[#0F1523] text-[#1E2A40] cursor-not-allowed'
                                        : 'border-[#1E2A40] text-[#3D506A] hover:text-[#7A8FAA] hover:border-[#283A56] cursor-pointer'
                                )}
                            >
                                <Plus size={13} />
                                Agregar premio
                            </button>
                        </div>
                    )}

                    {/* Step 3 */}
                    {step === 3 && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Participantes</p>
                                <span className="text-[11px] text-amber-400">
                                    {catParticipants.length > 0 && `${catParticipants.length} categ.`}
                                    {catParticipants.length > 0 && prodParticipants.length > 0 && ' · '}
                                    {prodParticipants.length > 0 && `${prodParticipants.length} prod.`}
                                </span>
                            </div>

                            <div className="relative">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none" />
                                <input
                                    {...searchKb}
                                    placeholder="Buscar categoría o producto..."
                                    className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/30 transition-colors"
                                />
                            </div>

                            <div className="flex gap-1 p-1 bg-[#0B0E19] rounded-xl">
                                {(['cat', 'prod'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setParticipantTab(tab)}
                                        className={cn(
                                            'flex-1 h-7 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
                                            participantTab === tab ? 'bg-amber-500/15 text-amber-400' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                                        )}
                                    >
                                        {tab === 'cat' ? 'Categorías' : 'Productos'}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-1.5">
                                {participantTab === 'cat' && (
                                    filteredCats.length > 0
                                        ? filteredCats.map(cat => {
                                            const conflict = getConflict('CATEGORY', cat.id)
                                            const selected = isSelected('CATEGORY', cat.id)
                                            return (
                                                <button
                                                    key={cat.id}
                                                    onClick={() => !conflict && toggleParticipant('CATEGORY', cat.id)}
                                                    disabled={!!conflict}
                                                    className={cn(
                                                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left',
                                                        conflict
                                                            ? 'bg-[#0B0E19] border-[#1E2A40] text-[#3D506A] cursor-not-allowed opacity-60'
                                                            : selected
                                                                ? 'bg-amber-500/10 border-amber-500/25 text-amber-400 cursor-pointer'
                                                                : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:border-[#283A56] cursor-pointer'
                                                    )}
                                                >
                                                    <div className={cn(
                                                        'w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border',
                                                        conflict ? 'border-[#1E2A40] bg-transparent' :
                                                        selected ? 'bg-amber-500 border-amber-500' : 'border-[#283A56] bg-transparent'
                                                    )}>
                                                        {conflict
                                                            ? <Lock size={8} className="text-[#3D506A]" />
                                                            : selected && <Check size={10} className="text-black" />
                                                        }
                                                    </div>
                                                    <span className="text-[13px] font-medium">{cat.name}</span>
                                                    {conflict
                                                        ? <span className="text-[10px] text-red-400/60 ml-auto truncate max-w-[130px]">{conflict}</span>
                                                        : <span className="text-[11px] text-[#3D506A] ml-auto">{cat.type}</span>
                                                    }
                                                </button>
                                            )
                                        })
                                        : <p className="text-center text-[12px] text-[#3D506A] py-4">Sin resultados</p>
                                )}

                                {participantTab === 'prod' && (
                                    filteredProds.length > 0
                                        ? filteredProds.map(prod => {
                                            const conflict = getConflict('PRODUCT', prod.id)
                                            const selected = isSelected('PRODUCT', prod.id)
                                            return (
                                                <button
                                                    key={prod.id}
                                                    onClick={() => !conflict && toggleParticipant('PRODUCT', prod.id)}
                                                    disabled={!!conflict}
                                                    className={cn(
                                                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left',
                                                        conflict
                                                            ? 'bg-[#0B0E19] border-[#1E2A40] text-[#3D506A] cursor-not-allowed opacity-60'
                                                            : selected
                                                                ? 'bg-amber-500/10 border-amber-500/25 text-amber-400 cursor-pointer'
                                                                : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:border-[#283A56] cursor-pointer'
                                                    )}
                                                >
                                                    <div className={cn(
                                                        'w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border',
                                                        conflict ? 'border-[#1E2A40] bg-transparent' :
                                                        selected ? 'bg-amber-500 border-amber-500' : 'border-[#283A56] bg-transparent'
                                                    )}>
                                                        {conflict
                                                            ? <Lock size={8} className="text-[#3D506A]" />
                                                            : selected && <Check size={10} className="text-black" />
                                                        }
                                                    </div>
                                                    <span className="text-[13px] font-medium">{prod.name}</span>
                                                    {conflict && (
                                                        <span className="text-[10px] text-red-400/60 ml-auto truncate max-w-[130px]">{conflict}</span>
                                                    )}
                                                </button>
                                            )
                                        })
                                        : <p className="text-center text-[12px] text-[#3D506A] py-4">Sin resultados</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 4 */}
                    {step === 4 && (
                        <div className="space-y-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Fechas de vigencia</p>

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
                                <div>
                                    <p className={cn('text-[13px] font-medium', hasDates ? 'text-amber-400' : 'text-[#7A8FAA]')}>
                                        Programar fechas
                                    </p>
                                    <p className="text-[11px] text-[#3D506A]">
                                        {hasDates ? 'El sorteo se activa y termina automáticamente' : 'El sorteo no tiene fecha límite'}
                                    </p>
                                </div>
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
                    )}

                    {/* Step 5 */}
                    {step === 5 && (
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Revisión final</p>

                            <div className="space-y-2">
                                {[
                                    { label: 'Nombre', value: name },
                                    { label: 'Tipo', value: 'Ruleta' },
                                    {
                                        label: 'Ruleta',
                                        value: `${wheelSize} opciones · ${options.length} premio${options.length !== 1 ? 's' : ''} + ${fillerSlots} relleno`
                                    },
                                    {
                                        label: 'Participantes',
                                        value: [
                                            catParticipants.length > 0 ? `${catParticipants.length} categoría${catParticipants.length !== 1 ? 's' : ''}` : '',
                                            prodParticipants.length > 0 ? `${prodParticipants.length} producto${prodParticipants.length !== 1 ? 's' : ''}` : '',
                                        ].filter(Boolean).join(', ') || 'Ninguno'
                                    },
                                    {
                                        label: 'Vigencia',
                                        value: hasDates && startAt && endAt
                                            ? `${new Date(startAt).toLocaleDateString()} → ${new Date(endAt).toLocaleDateString()}`
                                            : 'Sin fecha límite'
                                    },
                                ].map(row => (
                                    <div key={row.label} className="flex items-start gap-3 px-4 py-2.5 rounded-xl bg-[#0B0E19] border border-[#192030]">
                                        <span className="text-[11px] text-[#3D506A] uppercase tracking-wide w-24 flex-shrink-0 pt-0.5">{row.label}</span>
                                        <span className="text-[13px] text-[#E4ECF7] font-medium">{row.value}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                {options.map(o => (
                                    <div
                                        key={o._id}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-black"
                                        style={{ backgroundColor: o.color }}
                                    >
                                        <span>{o.label}</span>
                                        {o.prizeType === 'efectivo' && o.prizeValue && (
                                            <span className="opacity-70">({formatColones(o.prizeValue)})</span>
                                        )}
                                        {o.prizeType === 'otro' && o.prizeValue && (
                                            <span className="opacity-70">({o.prizeValue})</span>
                                        )}
                                    </div>
                                ))}
                                {fillerSlots > 0 && (
                                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-white bg-[#6B7280]">
                                        Sin premio
                                        <span className="opacity-60 ml-1">×{fillerSlots}</span>
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15 text-[12px] text-red-400">
                                    <AlertTriangle size={13} />
                                    {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <div className="flex gap-2 pt-1 border-t border-[#192030]">
                    {step > 1 && (
                        <Button variant="secondary" size="md" onClick={() => setStep(s => s - 1)} className="flex-1">
                            Anterior
                        </Button>
                    )}
                    {step < 5 && (
                        <Button variant="primary" size="md" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()} className="flex-1">
                            Siguiente
                        </Button>
                    )}
                    {step === 5 && (
                        <>
                            <Button variant="secondary" size="md" onClick={() => handleSubmit(false)} loading={submitting} className="flex-1">
                                Guardar borrador
                            </Button>
                            <Button variant="primary" size="md" onClick={() => handleSubmit(true)} loading={submitting} className="flex-1">
                                Activar ahora
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </BaseModal>
    )
}
