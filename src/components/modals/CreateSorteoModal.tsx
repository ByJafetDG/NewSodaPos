import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, AlertTriangle, Infinity } from 'lucide-react'
import { BaseModal } from '@/components/modals/BaseModal'
import { Button } from '@/components/atoms/Button'
import { cn } from '@/lib/utils'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useCategories } from '@/hooks/useCategories'
import { useProducts } from '@/hooks/useProducts'
import { useQueryClient } from '@tanstack/react-query'
import {
    createSorteo, createSorteoOption,
    setSorteoParticipants, updateSorteo,
} from '@/services/sorteos'

interface Props {
    isOpen: boolean
    onClose: () => void
}

interface DraftOption {
    _id: string
    label: string
    description: string
    quantity: string
    baseProbability: string
    isFiller: boolean
    color: string
}

type Participant = { type: 'PRODUCT' | 'CATEGORY'; refId: string }

const COLORS = [
    '#F59E0B', '#EF4444', '#3B82F6', '#10B981',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
    '#84CC16', '#6B7280',
]

const STEPS = ['Nombre', 'Premios', 'Participantes', 'Vigencia', 'Resumen']

function makeOption(sortOrder: number): DraftOption {
    return {
        _id: crypto.randomUUID(),
        label: '',
        description: '',
        quantity: '1',
        baseProbability: '',
        isFiller: false,
        color: COLORS[sortOrder % COLORS.length],
    }
}

export function CreateSorteoModal({ isOpen, onClose }: Props) {
    const qc = useQueryClient()
    const { data: categories = [] } = useCategories(false)
    const { data: products = [] } = useProducts()

    const [step, setStep] = useState(1)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [name, setName] = useState('')
    const [options, setOptions] = useState<DraftOption[]>([makeOption(0)])
    const [participants, setParticipants] = useState<Participant[]>([])
    const [participantTab, setParticipantTab] = useState<'cat' | 'prod'>('cat')
    const [hasDates, setHasDates] = useState(false)
    const [startAt, setStartAt] = useState('')
    const [endAt, setEndAt] = useState('')

    const nameKb = useKeyboardInput(name, setName, { mode: 'alpha' })

    useEffect(() => {
        if (isOpen) {
            setStep(1)
            setName('')
            setOptions([makeOption(0)])
            setParticipants([])
            setParticipantTab('cat')
            setHasDates(false)
            setStartAt('')
            setEndAt('')
            setError(null)
        }
    }, [isOpen])

    const totalProb = options.reduce((s, o) => {
        if (o.isFiller) return s
        return s + (parseFloat(o.baseProbability) || 0)
    }, 0)

    const probOver = totalProb > 100
    const hasFillers = options.some(o => o.isFiller)

    function updateOption(id: string, patch: Partial<DraftOption>) {
        setOptions(prev => prev.map(o => o._id === id ? { ...o, ...patch } : o))
    }

    function removeOption(id: string) {
        setOptions(prev => prev.filter(o => o._id !== id))
    }

    function addOption() {
        setOptions(prev => [...prev, makeOption(prev.length)])
    }

    function toggleParticipant(type: 'PRODUCT' | 'CATEGORY', refId: string) {
        setParticipants(prev => {
            const exists = prev.some(p => p.type === type && p.refId === refId)
            return exists
                ? prev.filter(p => !(p.type === type && p.refId === refId))
                : [...prev, { type, refId }]
        })
    }

    function isSelected(type: 'PRODUCT' | 'CATEGORY', refId: string) {
        return participants.some(p => p.type === type && p.refId === refId)
    }

    function canAdvance(): boolean {
        if (step === 1) return name.trim().length > 0
        if (step === 2) return options.length > 0 &&
            options.every(o => o.label.trim() && (parseFloat(o.baseProbability) > 0 || o.isFiller)) &&
            !probOver
        if (step === 3) return participants.length > 0
        if (step === 4) return !hasDates || (!!startAt && !!endAt)
        return true
    }

    async function handleSubmit(activate: boolean) {
        setSubmitting(true)
        setError(null)
        try {
            const sorteo = await createSorteo({ name: name.trim() })

            for (let i = 0; i < options.length; i++) {
                const o = options[i]
                const qty = o.isFiller || o.quantity === '' ? null : parseInt(o.quantity) || null
                await createSorteoOption({
                    sorteoId: sorteo.id,
                    label: o.label.trim(),
                    description: o.description.trim() || undefined,
                    quantity: qty,
                    baseProbability: parseFloat(o.baseProbability) || 0,
                    isFiller: o.isFiller,
                    color: o.color,
                    sortOrder: i,
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

            qc.invalidateQueries({ queryKey: ['sorteos'] })
            onClose()
        } catch (e: any) {
            setError(e?.message ?? 'Error al crear el sorteo')
        } finally {
            setSubmitting(false)
        }
    }

    const catParticipants = participants.filter(p => p.type === 'CATEGORY')
    const prodParticipants = participants.filter(p => p.type === 'PRODUCT')

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
                    {STEPS.map((label, i) => {
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
                                    <div className={cn(
                                        'flex-1 h-px',
                                        done ? 'bg-amber-500/40' : 'bg-[#1E2A40]'
                                    )} />
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Step content */}
                <div className="max-h-[52vh] overflow-y-auto pr-1">

                    {/* Step 1: Nombre */}
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

                    {/* Step 2: Opciones de premio */}
                    {step === 2 && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Opciones de la ruleta</p>
                                <div className={cn(
                                    'text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg',
                                    probOver ? 'text-red-400 bg-red-500/10' :
                                    totalProb === 100 ? 'text-emerald-400 bg-emerald-500/10' :
                                    'text-amber-400 bg-amber-500/10'
                                )}>
                                    {totalProb.toFixed(1)}%
                                    {hasFillers && <span className="text-[#3D506A] font-normal"> + relleno</span>}
                                </div>
                            </div>

                            {probOver && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15 text-[12px] text-red-400">
                                    <AlertTriangle size={13} />
                                    Las probabilidades superan 100%. Reduce algún valor.
                                </div>
                            )}

                            <div className="space-y-2">
                                {options.map((o) => (
                                    <div key={o._id} className={cn(
                                        'p-3 rounded-xl border space-y-2',
                                        o.isFiller ? 'bg-[#0D1117] border-[#192030]' : 'bg-[#101520] border-[#1E2A40]'
                                    )}>
                                        <div className="flex items-center gap-2">
                                            {/* Color picker */}
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {COLORS.map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => updateOption(o._id, { color: c })}
                                                        className="w-4 h-4 rounded-full border-2 transition-all cursor-pointer flex-shrink-0"
                                                        style={{
                                                            backgroundColor: c,
                                                            borderColor: o.color === c ? 'white' : 'transparent',
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                            <div className="flex-1 flex items-center gap-1 justify-end">
                                                <button
                                                    onClick={() => updateOption(o._id, { isFiller: !o.isFiller })}
                                                    className={cn(
                                                        'px-2 h-6 rounded-md text-[10px] font-medium border transition-all cursor-pointer flex items-center gap-1',
                                                        o.isFiller
                                                            ? 'bg-[#192030] border-[#283A56] text-[#7A8FAA]'
                                                            : 'bg-transparent border-[#1E2A40] text-[#3D506A] hover:text-[#7A8FAA]'
                                                    )}
                                                >
                                                    <Infinity size={10} />
                                                    Relleno
                                                </button>
                                                <button
                                                    onClick={() => removeOption(o._id)}
                                                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-[1fr_1fr_80px_72px] gap-2">
                                            <input
                                                type="text"
                                                value={o.label}
                                                onChange={e => updateOption(o._id, { label: e.target.value })}
                                                placeholder="Premio Mayor"
                                                className="h-8 px-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
                                            />
                                            <input
                                                type="text"
                                                value={o.description}
                                                onChange={e => updateOption(o._id, { description: e.target.value })}
                                                placeholder="10,000 colones"
                                                className="h-8 px-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
                                            />
                                            {o.isFiller ? (
                                                <div className="h-8 px-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] flex items-center text-[12px] text-[#3D506A]">
                                                    ∞
                                                </div>
                                            ) : (
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={o.quantity}
                                                    onChange={e => updateOption(o._id, { quantity: e.target.value })}
                                                    placeholder="Cant."
                                                    className="h-8 px-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/30"
                                                />
                                            )}
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.1"
                                                    value={o.baseProbability}
                                                    onChange={e => updateOption(o._id, { baseProbability: e.target.value })}
                                                    placeholder="0"
                                                    disabled={o.isFiller}
                                                    className={cn(
                                                        'h-8 pl-3 pr-7 rounded-lg border text-[12px] outline-none focus:border-amber-500/30 w-full',
                                                        o.isFiller
                                                            ? 'bg-[#0D1117] border-[#192030] text-[#3D506A]'
                                                            : 'bg-[#0B0E19] border-[#1E2A40] text-[#E4ECF7] placeholder:text-[#3D506A]'
                                                    )}
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[#3D506A]">%</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2 text-[10px] text-[#3D506A] px-0.5">
                                            <span>Premio</span>
                                            <span>Descripción</span>
                                            <span>{o.isFiller ? '' : 'Cantidad'}</span>
                                            <span>{o.isFiller ? 'Automático' : 'Probabilidad'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={addOption}
                                className="w-full h-9 rounded-xl border border-dashed border-[#1E2A40] text-[12px] text-[#3D506A] hover:text-[#7A8FAA] hover:border-[#283A56] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <Plus size={13} />
                                Agregar opción
                            </button>
                        </div>
                    )}

                    {/* Step 3: Participantes */}
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

                            <div className="flex gap-1 p-1 bg-[#0B0E19] rounded-xl">
                                {(['cat', 'prod'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setParticipantTab(tab)}
                                        className={cn(
                                            'flex-1 h-7 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
                                            participantTab === tab
                                                ? 'bg-amber-500/15 text-amber-400'
                                                : 'text-[#3D506A] hover:text-[#7A8FAA]'
                                        )}
                                    >
                                        {tab === 'cat' ? 'Categorías' : 'Productos'}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-1.5">
                                {participantTab === 'cat' && categories.filter(c => c.isActive).map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => toggleParticipant('CATEGORY', cat.id)}
                                        className={cn(
                                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left',
                                            isSelected('CATEGORY', cat.id)
                                                ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                                                : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:border-[#283A56]'
                                        )}
                                    >
                                        <div className={cn(
                                            'w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border',
                                            isSelected('CATEGORY', cat.id)
                                                ? 'bg-amber-500 border-amber-500'
                                                : 'border-[#283A56] bg-transparent'
                                        )}>
                                            {isSelected('CATEGORY', cat.id) && <Check size={10} className="text-black" />}
                                        </div>
                                        <span className="text-[13px] font-medium">{cat.name}</span>
                                        <span className="text-[11px] text-[#3D506A] ml-auto">{cat.type}</span>
                                    </button>
                                ))}

                                {participantTab === 'prod' && products.filter(p => p.isActive).map(prod => (
                                    <button
                                        key={prod.id}
                                        onClick={() => toggleParticipant('PRODUCT', prod.id)}
                                        className={cn(
                                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left',
                                            isSelected('PRODUCT', prod.id)
                                                ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                                                : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:border-[#283A56]'
                                        )}
                                    >
                                        <div className={cn(
                                            'w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border',
                                            isSelected('PRODUCT', prod.id)
                                                ? 'bg-amber-500 border-amber-500'
                                                : 'border-[#283A56] bg-transparent'
                                        )}>
                                            {isSelected('PRODUCT', prod.id) && <Check size={10} className="text-black" />}
                                        </div>
                                        <span className="text-[13px] font-medium">{prod.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 4: Vigencia */}
                    {step === 4 && (
                        <div className="space-y-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Fechas de vigencia</p>

                            <button
                                onClick={() => setHasDates(v => !v)}
                                className={cn(
                                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer text-left',
                                    hasDates
                                        ? 'bg-amber-500/10 border-amber-500/25'
                                        : 'bg-[#101520] border-[#1E2A40] hover:border-[#283A56]'
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

                    {/* Step 5: Resumen */}
                    {step === 5 && (
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Revisión final</p>

                            <div className="space-y-2">
                                {[
                                    { label: 'Nombre', value: name },
                                    { label: 'Tipo', value: 'Ruleta' },
                                    {
                                        label: 'Opciones',
                                        value: `${options.length} opción${options.length !== 1 ? 'es' : ''} (${options.filter(o => !o.isFiller).length} con stock, ${options.filter(o => o.isFiller).length} relleno)`
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

                            {/* Options preview */}
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {options.map(o => (
                                    <div
                                        key={o._id}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-black"
                                        style={{ backgroundColor: o.color }}
                                    >
                                        <span>{o.label}</span>
                                        {!o.isFiller && <span className="opacity-70">({o.baseProbability}%)</span>}
                                        {o.isFiller && <Infinity size={9} />}
                                    </div>
                                ))}
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
                        <Button
                            variant="primary"
                            size="md"
                            onClick={() => setStep(s => s + 1)}
                            disabled={!canAdvance()}
                            className="flex-1"
                        >
                            Siguiente
                        </Button>
                    )}

                    {step === 5 && (
                        <>
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => handleSubmit(false)}
                                loading={submitting}
                                className="flex-1"
                            >
                                Guardar borrador
                            </Button>
                            <Button
                                variant="primary"
                                size="md"
                                onClick={() => handleSubmit(true)}
                                loading={submitting}
                                className="flex-1"
                            >
                                Activar ahora
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </BaseModal>
    )
}
