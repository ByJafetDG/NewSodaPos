import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
    X, ArrowLeft, Check, ChevronRight,
    User, Briefcase, Building2, Phone, FileText, Tag,
} from 'lucide-react'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import { cn } from '@/lib/utils'
import type { Client, ClientType } from '@/types'

// ── Types & Constants ─────────────────────────────────────────────────────────

type WizardStep = 'draft-prompt' | 'name' | 'type' | 'contact' | 'notes' | 'recap'
const STEP_ORDER: WizardStep[] = ['name', 'type', 'contact', 'notes', 'recap']
const PROGRESS_STEPS: WizardStep[] = ['name', 'type', 'contact', 'notes']

const DRAFT_KEY_NEW = 'pos_client_draft'
const draftKeyEdit = (id: string) => `pos_client_draft_edit_${id}`

type WizardData = {
    name: string; type: ClientType; phone: string
    email: string; cedula: string; code: string; notes: string; isActive: boolean
}
const EMPTY: WizardData = {
    name: '', type: 'GENERAL', phone: '', email: '',
    cedula: '', code: '', notes: '', isActive: true,
}

const CLIENT_TYPES: { value: ClientType; label: string; sub: string; icon: React.ElementType; color: string; bg: string }[] = [
    { value: 'TRABAJADOR', label: 'Trabajador',  sub: 'Empleado interno',      icon: Briefcase,  color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
    { value: 'ASOCIACION', label: 'Asociación',  sub: 'Grupo u organización',  icon: Building2,  color: 'text-amber-400',  bg: 'bg-amber-500/10'  },
    { value: 'GENERAL',    label: 'General',     sub: 'Cliente regular',        icon: User,       color: 'text-violet-400', bg: 'bg-violet-500/10' },
]

const slideVariants = {
    enter: (dir: number) => ({ x: dir >= 0 ? 52 : -52, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:  (dir: number) => ({ x: dir >= 0 ? -52 : 52, opacity: 0 }),
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ClientFormModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (data: Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => void
    client?: Client | null
    isPending?: boolean
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClientFormModal({ isOpen, onClose, onConfirm, client, isPending }: ClientFormModalProps) {
    const [step, setStep] = useState<WizardStep>('name')
    const [dir, setDir]   = useState(1)
    const [data, setData] = useState<WizardData>(EMPTY)

    const draftKey = client ? draftKeyEdit(client.id) : DRAFT_KEY_NEW

    useEffect(() => {
        if (!isOpen) return
        useKeyboardStore.getState().close()

        const draft = (() => {
            try { return JSON.parse(localStorage.getItem(draftKey) ?? 'null') as WizardData | null }
            catch { return null }
        })()

        if (client) {
            const base: WizardData = {
                name: client.name, type: client.type,
                phone: client.phone ?? '', email: client.email ?? '',
                cedula: client.cedula ?? '', code: client.code ?? '',
                notes: client.notes ?? '', isActive: client.isActive,
            }
            if (draft?.name) { setData(draft); setStep('draft-prompt') }
            else             { setData(base);  setStep('name') }
        } else {
            if (draft?.name) { setData(draft); setStep('draft-prompt') }
            else             { setData(EMPTY); setStep('name') }
        }
        setDir(1)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || step === 'draft-prompt') return
        if (!data.name) return
        localStorage.setItem(draftKey, JSON.stringify(data))
    }, [data, step, isOpen])

    function go(next: WizardStep, direction = 1) {
        useKeyboardStore.getState().close()
        setDir(direction)
        setStep(next)
    }

    function advance(next: WizardStep) { go(next, 1) }

    function back() {
        const idx = STEP_ORDER.indexOf(step)
        if (idx > 0) go(STEP_ORDER[idx - 1], -1)
    }

    function goToStep(s: WizardStep) {
        const curr = STEP_ORDER.indexOf(step)
        const next = STEP_ORDER.indexOf(s)
        go(s, next >= curr ? 1 : -1)
    }

    function handleConfirm() {
        if (isPending) return
        localStorage.removeItem(draftKey)
        onConfirm({
            name:    data.name.trim(),
            type:    data.type,
            phone:   data.phone.trim() || null,
            email:   data.email.trim() || null,
            cedula:  data.cedula.trim() || null,
            code:    data.code.trim() || null,
            company: null,
            notes:   data.notes.trim() || null,
            isActive: data.isActive,
        })
    }

    function discardDraft() {
        localStorage.removeItem(draftKey)
        const base = client
            ? { name: client.name, type: client.type, phone: client.phone ?? '', email: client.email ?? '', cedula: client.cedula ?? '', code: client.code ?? '', notes: client.notes ?? '', isActive: client.isActive }
            : EMPTY
        setData(base)
        go('name', 1)
    }

    function handleClose() { useKeyboardStore.getState().close(); onClose() }

    const progressIdx = PROGRESS_STEPS.indexOf(step)

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                        onClick={handleClose}
                    />
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="fixed z-50 inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-sm px-4"
                    >
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">

                            {/* Header */}
                            {step !== 'draft-prompt' && (
                                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                                    <div className="flex items-center gap-2">
                                        {step !== 'name' && (
                                            <button onClick={back} className="w-7 h-7 rounded-lg text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                                                <ArrowLeft size={14} />
                                            </button>
                                        )}
                                        <h2 className="text-[15px] font-semibold text-[#E4ECF7]">
                                            {client ? 'Editar cliente' : 'Nuevo cliente'}
                                        </h2>
                                    </div>
                                    <button onClick={handleClose} className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Progress bar */}
                            {progressIdx >= 0 && (
                                <div className="flex gap-1 px-5 pb-4">
                                    {PROGRESS_STEPS.map((_, i) => (
                                        <div key={i} className={cn(
                                            'h-1 rounded-full transition-all duration-300',
                                            i < progressIdx  ? 'bg-violet-500 flex-1' :
                                            i === progressIdx ? 'bg-violet-500 flex-[2]' :
                                            'bg-[#1E2A40] flex-1'
                                        )} />
                                    ))}
                                </div>
                            )}

                            {/* Step content */}
                            <div className="overflow-hidden">
                                <AnimatePresence mode="popLayout" custom={dir}>
                                    <motion.div
                                        key={step}
                                        custom={dir}
                                        variants={slideVariants}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                                        className="px-5 pb-6"
                                    >
                                        {step === 'draft-prompt' && (
                                            <DraftPromptStep data={data} isEdit={!!client} onContinue={() => go('name', 1)} onDiscard={discardDraft} onClose={handleClose} />
                                        )}
                                        {step === 'name' && (
                                            <NameStep value={data.name} onChange={v => setData(d => ({ ...d, name: v }))} onNext={() => advance('type')} />
                                        )}
                                        {step === 'type' && (
                                            <TypeStep value={data.type} onSelect={t => { setData(d => ({ ...d, type: t })); advance('contact') }} />
                                        )}
                                        {step === 'contact' && (
                                            <ContactStep data={data} onChange={patch => setData(d => ({ ...d, ...patch }))} onNext={() => advance('notes')} />
                                        )}
                                        {step === 'notes' && (
                                            <NotesStep value={data.notes} onChange={v => setData(d => ({ ...d, notes: v }))} onNext={() => advance('recap')} onSkip={() => { setData(d => ({ ...d, notes: '' })); advance('recap') }} />
                                        )}
                                        {step === 'recap' && (
                                            <RecapStep data={data} isEdit={!!client} isPending={isPending} onToggleActive={() => setData(d => ({ ...d, isActive: !d.isActive }))} onConfirm={handleConfirm} onEdit={goToStep} />
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StepQuestion({ children }: { children: React.ReactNode }) {
    return <p className="text-[15px] font-semibold text-[#E4ECF7] mb-4">{children}</p>
}

function StepInput({ value, onChange, placeholder, mode = 'alpha' }: {
    value: string; onChange: (v: string) => void; placeholder?: string; mode?: 'alpha' | 'numeric'
}) {
    const kb = useKeyboardInput(value, onChange, { mode })
    return (
        <input
            type="text"
            {...kb}
            placeholder={placeholder}
            className="w-full h-12 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[14px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
        />
    )
}

function SmallInput({ value, onChange, placeholder, mode = 'alpha' }: {
    value: string; onChange: (v: string) => void; placeholder?: string; mode?: 'alpha' | 'numeric'
}) {
    const kb = useKeyboardInput(value, onChange, { mode })
    return (
        <input
            type="text"
            {...kb}
            placeholder={placeholder}
            className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
        />
    )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">{children}</p>
}

function NextBtn({ onClick, disabled, label = 'Continuar' }: { onClick: () => void; disabled?: boolean; label?: string }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="mt-4 w-full h-11 rounded-xl bg-violet-500 text-white text-[13px] font-semibold hover:bg-violet-600 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-2"
        >
            {label}
            <ChevronRight size={15} />
        </button>
    )
}

// ── Step: Draft prompt ────────────────────────────────────────────────────────

function DraftPromptStep({ data, isEdit, onContinue, onDiscard, onClose }: {
    data: WizardData; isEdit: boolean; onContinue: () => void; onDiscard: () => void; onClose: () => void
}) {
    return (
        <div className="pt-2">
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-[16px] font-semibold text-[#E4ECF7]">Borrador pendiente</h2>
                <button onClick={onClose} className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                    <X size={16} />
                </button>
            </div>
            <div className="mb-5 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20">
                <p className="text-[12px] text-amber-400 font-semibold mb-1">{isEdit ? 'Edición sin guardar' : 'Cliente sin terminar'}</p>
                <p className="text-[14px] text-[#E4ECF7] font-semibold truncate">{data.name || '(sin nombre)'}</p>
                {data.type && <p className="text-[12px] text-[#7A8FAA] mt-0.5">{CLIENT_TYPES.find(t => t.value === data.type)?.label}</p>}
            </div>
            <div className="space-y-2">
                <button
                    onClick={onContinue}
                    className="w-full h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/15 font-semibold text-[13px] transition-all cursor-pointer"
                >
                    Continuar borrador
                </button>
                <button
                    onClick={onDiscard}
                    className="w-full h-11 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] hover:text-red-400 hover:border-red-500/20 font-semibold text-[13px] transition-all cursor-pointer"
                >
                    Descartar y empezar de nuevo
                </button>
            </div>
        </div>
    )
}

// ── Step: Name ────────────────────────────────────────────────────────────────

function NameStep({ value, onChange, onNext }: { value: string; onChange: (v: string) => void; onNext: () => void }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Tag size={15} className="text-violet-400" />
                </div>
                <StepQuestion>¿Cómo se llama el cliente?</StepQuestion>
            </div>
            <StepInput value={value} onChange={onChange} placeholder="Nombre completo..." />
            <NextBtn onClick={onNext} disabled={!value.trim()} />
        </div>
    )
}

// ── Step: Type ────────────────────────────────────────────────────────────────

function TypeStep({ value, onSelect }: { value: ClientType; onSelect: (t: ClientType) => void }) {
    return (
        <div>
            <StepQuestion>¿Qué tipo de cliente es?</StepQuestion>
            <div className="space-y-2">
                {CLIENT_TYPES.map(t => {
                    const Icon = t.icon
                    const active = value === t.value
                    return (
                        <button
                            key={t.value}
                            onClick={() => onSelect(t.value)}
                            className={cn(
                                'w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left',
                                active ? 'border-violet-500/30 bg-violet-500/8' : 'bg-[#101520] border-[#1E2A40] hover:border-[#283A56]'
                            )}
                        >
                            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', active ? t.bg : 'bg-[#1C2438]')}>
                                <Icon size={16} className={active ? t.color : 'text-[#3D506A]'} />
                            </div>
                            <div>
                                <p className={cn('text-[13px] font-semibold', active ? t.color : 'text-[#E4ECF7]')}>{t.label}</p>
                                <p className="text-[10px] text-[#3D506A] leading-tight">{t.sub}</p>
                            </div>
                            {active && <Check size={14} className="text-violet-400 ml-auto shrink-0" />}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ── Step: Contact ─────────────────────────────────────────────────────────────

function ContactStep({ data, onChange, onNext }: {
    data: WizardData
    onChange: (p: Partial<WizardData>) => void
    onNext: () => void
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Phone size={15} className="text-blue-400" />
                </div>
                <StepQuestion>Datos de contacto</StepQuestion>
            </div>
            <div>
                <FieldLabel>Cédula</FieldLabel>
                <SmallInput value={data.cedula} onChange={v => onChange({ cedula: v })} placeholder="1-1234-5678" />
            </div>
            <div>
                <FieldLabel>Teléfono</FieldLabel>
                <SmallInput value={data.phone} onChange={v => onChange({ phone: v })} placeholder="8888-0000" mode="numeric" />
            </div>
            <div>
                <FieldLabel>Correo</FieldLabel>
                <SmallInput value={data.email} onChange={v => onChange({ email: v })} placeholder="correo@ejemplo.com" />
            </div>
            {data.type === 'ASOCIACION' && (
                <div>
                    <FieldLabel>Código interno</FieldLabel>
                    <SmallInput value={data.code} onChange={v => onChange({ code: v })} placeholder="ASO-001" />
                </div>
            )}
            <NextBtn onClick={onNext} label="Continuar" />
            <button onClick={onNext} className="w-full h-9 rounded-xl text-[12px] text-[#3D506A] hover:text-[#7A8FAA] transition-colors cursor-pointer">
                Saltar — sin datos de contacto
            </button>
        </div>
    )
}

// ── Step: Notes ───────────────────────────────────────────────────────────────

function NotesStep({ value, onChange, onNext, onSkip }: {
    value: string; onChange: (v: string) => void; onNext: () => void; onSkip: () => void
}) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <FileText size={15} className="text-emerald-400" />
                </div>
                <StepQuestion>¿Alguna nota del cliente?</StepQuestion>
            </div>
            <StepInput value={value} onChange={onChange} placeholder="Observaciones opcionales..." />
            <NextBtn onClick={onNext} disabled={!value.trim()} label="Continuar con nota" />
            <button onClick={onSkip} className="mt-2 w-full h-9 rounded-xl text-[12px] text-[#3D506A] hover:text-[#7A8FAA] transition-colors cursor-pointer">
                Saltar — sin notas
            </button>
        </div>
    )
}

// ── Step: Recap ───────────────────────────────────────────────────────────────

function RecapStep({ data, isEdit, isPending, onToggleActive, onConfirm, onEdit }: {
    data: WizardData; isEdit: boolean; isPending?: boolean
    onToggleActive: () => void; onConfirm: () => void; onEdit: (s: WizardStep) => void
}) {
    const typeInfo = CLIENT_TYPES.find(t => t.value === data.type)

    const rows: { label: string; value: string; step: WizardStep }[] = [
        { label: 'Nombre',   value: data.name || '—',               step: 'name'    },
        { label: 'Tipo',     value: typeInfo?.label ?? '—',         step: 'type'    },
        { label: 'Cédula',   value: data.cedula || 'Sin cédula',    step: 'contact' },
        { label: 'Teléfono', value: data.phone || 'Sin teléfono',   step: 'contact' },
        { label: 'Correo',   value: data.email || 'Sin correo',     step: 'contact' },
        ...(data.type === 'ASOCIACION' ? [
            { label: 'Código interno', value: data.code || 'Sin código', step: 'contact' as WizardStep },
        ] : []),
        { label: 'Notas',    value: data.notes || 'Sin notas',      step: 'notes'   },
    ]

    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Check size={15} className="text-emerald-400" />
                </div>
                <StepQuestion>Confirmar cliente</StepQuestion>
            </div>

            <div className="rounded-xl bg-[#101520] border border-[#1E2A40] divide-y divide-[#192030] mb-3">
                {rows.map(row => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-[#3D506A] uppercase tracking-wider">{row.label}</p>
                            <p className="text-[13px] text-[#E4ECF7] font-medium truncate mt-0.5">{row.value}</p>
                        </div>
                        <button
                            onClick={() => onEdit(row.step)}
                            className="ml-3 px-2 py-1 rounded-lg text-[11px] text-[#3D506A] hover:text-violet-400 hover:bg-violet-500/10 transition-all cursor-pointer shrink-0"
                        >
                            Editar
                        </button>
                    </div>
                ))}
            </div>

            {/* Active toggle */}
            <button
                onClick={onToggleActive}
                className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left mb-3',
                    data.isActive ? 'bg-violet-500/8 border-violet-500/20' : 'bg-[#101520] border-[#1E2A40]'
                )}
            >
                <div>
                    <p className={cn('text-[12px] font-semibold', data.isActive ? 'text-violet-400' : 'text-[#E4ECF7]')}>Cliente activo</p>
                    <p className="text-[11px] text-[#3D506A]">Visible al seleccionar crédito</p>
                </div>
                <div className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0', data.isActive ? 'bg-violet-500' : 'bg-[#1C2438]')}>
                    <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', data.isActive ? 'translate-x-4.5' : 'translate-x-0.5')} />
                </div>
            </button>

            <button
                onClick={onConfirm}
                disabled={isPending}
                className="w-full h-12 rounded-xl bg-violet-500 text-white text-[14px] font-bold hover:bg-violet-600 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
                {isPending ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear cliente')}
                {!isPending && <Check size={16} />}
            </button>
        </div>
    )
}
