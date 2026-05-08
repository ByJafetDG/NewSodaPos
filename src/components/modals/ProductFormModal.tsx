import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
    X, ArrowLeft, Check, Package, Droplets, Layers, Utensils,
    ScanLine, Tag, ChevronRight, DollarSign,
} from 'lucide-react'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import { useSubcategories } from '@/hooks/useSubcategories'
import { formatCurrency, cn } from '@/lib/utils'
import type { Product, Category, ProductUnit, Subcategory } from '@/types'

// ── Types & Constants ─────────────────────────────────────────────────────────

type WizardStep = 'draft-prompt' | 'name' | 'barcode' | 'unit' | 'category' | 'subcategory' | 'numbers' | 'recap'
const STEP_ORDER: WizardStep[] = ['name', 'barcode', 'unit', 'category', 'subcategory', 'numbers', 'recap']
const PROGRESS_STEPS: WizardStep[] = ['name', 'barcode', 'unit', 'category', 'numbers']

const DRAFT_KEY_NEW = 'pos_product_draft_new'
const draftKeyEdit = (id: string) => `pos_product_draft_edit_${id}`

type WizardData = {
    name: string; barcode: string; unit: ProductUnit; categoryId: string; subcategoryId: string
    price: string; stockQty: string; minStock: string; isInfinite: boolean; isActive: boolean
}
const EMPTY: WizardData = {
    name: '', barcode: '', unit: 'UNIDAD', categoryId: '', subcategoryId: '',
    price: '', stockQty: '0', minStock: '1', isInfinite: false, isActive: true,
}

const UNITS: { value: ProductUnit; label: string; sub: string; icon: React.ElementType }[] = [
    { value: 'UNIDAD',  label: 'Unidad',   sub: 'Piezas individuales', icon: Package  },
    { value: 'KG',      label: 'Kilogramo', sub: 'Productos por peso',  icon: Layers   },
    { value: 'LITRO',   label: 'Litro',     sub: 'Líquidos a granel',   icon: Droplets },
    { value: 'PORCION', label: 'Porción',   sub: 'Platos / raciones',   icon: Utensils },
]

const slideVariants = {
    enter: (dir: number) => ({ x: dir >= 0 ? 52 : -52, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:  (dir: number) => ({ x: dir >= 0 ? -52 : 52, opacity: 0 }),
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProductFormModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => void
    product?: Product | null
    categories: Category[]
    isPending?: boolean
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductFormModal({ isOpen, onClose, onConfirm, product, categories, isPending }: ProductFormModalProps) {
    const [step, setStep] = useState<WizardStep>('name')
    const [dir, setDir]   = useState(1)
    const [data, setData] = useState<WizardData>(EMPTY)
    const { data: allSubcategories = [] } = useSubcategories()

    const draftKey = product ? draftKeyEdit(product.id) : DRAFT_KEY_NEW

    useEffect(() => {
        if (!isOpen) return
        useKeyboardStore.getState().close()

        const draft = (() => { try { return JSON.parse(localStorage.getItem(draftKey) ?? 'null') as WizardData | null } catch { return null } })()

        if (product) {
            const base: WizardData = {
                name: product.name, barcode: product.barcode ?? '',
                unit: product.unit, categoryId: product.categoryId,
                subcategoryId: product.subcategoryId ?? '',
                price: String(product.price), stockQty: String(product.stockQty),
                minStock: String(product.minStock), isInfinite: product.isInfinite, isActive: product.isActive,
            }
            if (draft?.name) { setData(draft); setStep('draft-prompt') }
            else             { setData(base);  setStep('name') }
        } else {
            if (draft?.name) { setData(draft); setStep('draft-prompt') }
            else             { setData({ ...EMPTY, categoryId: categories[0]?.id ?? '' }); setStep('name') }
        }
        setDir(1)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || step === 'draft-prompt') return
        if (!data.name && !data.price) return
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
        if (idx <= 0) return
        const catSubcats = allSubcategories.filter(s => s.categoryId === data.categoryId && s.isActive)
        let prevStep = STEP_ORDER[idx - 1]
        if (prevStep === 'subcategory' && catSubcats.length === 0) {
            prevStep = STEP_ORDER[idx - 2] ?? prevStep
        }
        go(prevStep, -1)
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
            name: data.name.trim(),
            barcode: data.barcode.trim() || null,
            categoryId: data.categoryId,
            subcategoryId: data.subcategoryId || null,
            price: parseFloat(data.price) || 0,
            cost: 0,
            unit: data.unit,
            minStock: parseInt(data.minStock) || 1,
            stockQty: data.isInfinite ? (product?.stockQty ?? 0) : (parseFloat(data.stockQty) || 0),
            isInfinite: data.isInfinite,
            isActive: data.isActive,
            imageUrl: null,
        })
    }

    function discardDraft() {
        localStorage.removeItem(draftKey)
        const base = product
            ? { name: product.name, barcode: product.barcode ?? '', unit: product.unit, categoryId: product.categoryId, subcategoryId: product.subcategoryId ?? '', price: String(product.price), stockQty: String(product.stockQty), minStock: String(product.minStock), isInfinite: product.isInfinite, isActive: product.isActive }
            : { ...EMPTY, categoryId: categories[0]?.id ?? '' }
        setData(base)
        go('name', 1)
    }

    function handleClose() { useKeyboardStore.getState().close(); onClose() }

    const progressIdx = PROGRESS_STEPS.indexOf(step)
    const activeCategories = categories.filter(c => c.isActive)
    const catName = activeCategories.find(c => c.id === data.categoryId)?.name ?? '—'
    const catSubcats = allSubcategories.filter(s => s.categoryId === data.categoryId && s.isActive)
    const subName = catSubcats.find(s => s.id === data.subcategoryId)?.name ?? null

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
                                            {product ? 'Editar producto' : 'Nuevo producto'}
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
                                            i < progressIdx ? 'bg-orange-500 flex-1' :
                                            i === progressIdx ? 'bg-orange-500 flex-[2]' :
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
                                        {step === 'draft-prompt'  && <DraftPromptStep data={data} isEdit={!!product} onContinue={() => go('name', 1)} onDiscard={discardDraft} onClose={handleClose} />}
                                        {step === 'name'          && <NameStep value={data.name} onChange={v => setData(d => ({ ...d, name: v }))} onNext={() => advance('barcode')} />}
                                        {step === 'barcode'       && <BarcodeStep value={data.barcode} onChange={v => setData(d => ({ ...d, barcode: v }))} onNext={() => advance('unit')} onSkip={() => { setData(d => ({ ...d, barcode: '' })); advance('unit') }} />}
                                        {step === 'unit'          && <UnitStep value={data.unit} onSelect={u => { setData(d => ({ ...d, unit: u })); advance('category') }} />}
                                        {step === 'category'      && <CategoryStep value={data.categoryId} categories={activeCategories} onChange={id => setData(d => ({ ...d, categoryId: id, subcategoryId: '' }))} onNext={() => catSubcats.length > 0 ? advance('subcategory') : advance('numbers')} />}
                                        {step === 'subcategory'   && <SubcategoryStep value={data.subcategoryId} subcategories={catSubcats} onChange={id => setData(d => ({ ...d, subcategoryId: id }))} onNext={() => advance('numbers')} onSkip={() => { setData(d => ({ ...d, subcategoryId: '' })); advance('numbers') }} />}
                                        {step === 'numbers'       && <NumbersStep data={data} isEdit={!!product} onChange={patch => setData(d => ({ ...d, ...patch }))} onNext={() => advance('recap')} />}
                                        {step === 'recap'         && <RecapStep data={data} catName={catName} subName={subName} isEdit={!!product} isPending={isPending} onConfirm={handleConfirm} onEdit={goToStep} hasSubs={catSubcats.length > 0} />}
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

// ── Step sub-components ───────────────────────────────────────────────────────

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
            className="w-full h-12 px-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[14px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
        />
    )
}

function NextBtn({ onClick, disabled, label = 'Continuar' }: { onClick: () => void; disabled?: boolean; label?: string }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="mt-4 w-full h-11 rounded-xl bg-orange-500 text-white text-[13px] font-semibold hover:bg-orange-600 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-2"
        >
            {label}
            <ChevronRight size={15} />
        </button>
    )
}

function Toggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left', value ? 'bg-orange-500/8 border-orange-500/20' : 'bg-[#101520] border-[#1E2A40]')}
        >
            <div>
                <p className={cn('text-[12px] font-semibold', value ? 'text-orange-400' : 'text-[#E4ECF7]')}>{label}</p>
                <p className="text-[11px] text-[#3D506A]">{description}</p>
            </div>
            <div className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0', value ? 'bg-orange-500' : 'bg-[#1C2438]')}>
                <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', value ? 'translate-x-4.5' : 'translate-x-0.5')} />
            </div>
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
                <p className="text-[12px] text-amber-400 font-semibold mb-1">{isEdit ? 'Edición sin guardar' : 'Producto sin terminar'}</p>
                <p className="text-[14px] text-[#E4ECF7] font-semibold truncate">{data.name || '(sin nombre)'}</p>
                {data.price ? <p className="text-[12px] text-[#7A8FAA] mt-0.5">{formatCurrency(parseFloat(data.price) || 0)}</p> : null}
            </div>
            <div className="space-y-2">
                <button
                    onClick={onContinue}
                    className="w-full h-11 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/15 font-semibold text-[13px] transition-all cursor-pointer"
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
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                    <Tag size={15} className="text-orange-400" />
                </div>
                <StepQuestion>¿Cómo se llama el producto?</StepQuestion>
            </div>
            <StepInput value={value} onChange={onChange} placeholder="Ej: Casado con pollo, Refresco..." />
            <NextBtn onClick={onNext} disabled={!value.trim()} />
        </div>
    )
}

// ── Step: Barcode ─────────────────────────────────────────────────────────────

function BarcodeStep({ value, onChange, onNext, onSkip }: { value: string; onChange: (v: string) => void; onNext: () => void; onSkip: () => void }) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <ScanLine size={15} className="text-blue-400" />
                </div>
                <StepQuestion>¿Tiene código de barras?</StepQuestion>
            </div>
            <StepInput value={value} onChange={onChange} placeholder="Escanea o escribe el código" mode="alpha" />
            <NextBtn onClick={onNext} disabled={!value.trim()} label="Continuar con código" />
            <button onClick={onSkip} className="mt-2 w-full h-9 rounded-xl text-[12px] text-[#3D506A] hover:text-[#7A8FAA] transition-colors cursor-pointer">
                Saltar — no tiene código
            </button>
        </div>
    )
}

// ── Step: Unit ────────────────────────────────────────────────────────────────

function UnitStep({ value, onSelect }: { value: ProductUnit; onSelect: (u: ProductUnit) => void }) {
    return (
        <div>
            <StepQuestion>¿En qué unidad se vende?</StepQuestion>
            <div className="grid grid-cols-2 gap-2">
                {UNITS.map(u => {
                    const Icon = u.icon
                    const active = value === u.value
                    return (
                        <button
                            key={u.value}
                            onClick={() => onSelect(u.value)}
                            className={cn(
                                'flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left',
                                active ? 'bg-orange-500/10 border-orange-500/30' : 'bg-[#101520] border-[#1E2A40] hover:border-[#283A56]'
                            )}
                        >
                            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', active ? 'bg-orange-500/15' : 'bg-[#1C2438]')}>
                                <Icon size={16} className={active ? 'text-orange-400' : 'text-[#3D506A]'} />
                            </div>
                            <div>
                                <p className={cn('text-[13px] font-semibold', active ? 'text-orange-400' : 'text-[#E4ECF7]')}>{u.label}</p>
                                <p className="text-[10px] text-[#3D506A] leading-tight">{u.sub}</p>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ── Step: Category ────────────────────────────────────────────────────────────

function CategoryStep({ value, categories, onChange, onNext }: { value: string; categories: Category[]; onChange: (id: string) => void; onNext: () => void }) {
    return (
        <div>
            <StepQuestion>¿A qué categoría pertenece?</StepQuestion>
            <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto -mx-1 px-1 pb-1">
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => onChange(cat.id)}
                        className={cn(
                            'px-3 h-9 rounded-xl text-[12px] font-medium border transition-all cursor-pointer',
                            value === cat.id ? 'bg-orange-500/15 border-orange-500/30 text-orange-400' : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#1C2438]'
                        )}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>
            <NextBtn onClick={onNext} disabled={!value} />
        </div>
    )
}

// ── Step: Subcategory ─────────────────────────────────────────────────────────

function SubcategoryStep({ value, subcategories, onChange, onNext, onSkip }: {
    value: string; subcategories: Subcategory[]
    onChange: (id: string) => void; onNext: () => void; onSkip: () => void
}) {
    const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                    <Layers size={15} className="text-violet-400" />
                </div>
                <StepQuestion>¿A qué subcategoría pertenece?</StepQuestion>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto -mx-1 px-1 pb-1">
                {subcategories.map(sub => (
                    <button
                        key={sub.id}
                        onClick={() => onChange(sub.id)}
                        className={cn(
                            'flex flex-col items-start px-3 py-2 rounded-xl text-left border transition-all cursor-pointer',
                            value === sub.id
                                ? 'bg-violet-500/15 border-violet-500/30 text-violet-400'
                                : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#1C2438]'
                        )}
                    >
                        <span className="text-[12px] font-medium">{sub.name}</span>
                        {sub.showDays && (
                            <span className="text-[10px] opacity-60 mt-0.5">
                                {sub.showDays.map(d => DAY_LABELS[d]).join(' ')}
                            </span>
                        )}
                    </button>
                ))}
            </div>
            <NextBtn onClick={onNext} disabled={!value} />
            <button onClick={onSkip} className="mt-2 w-full h-9 rounded-xl text-[12px] text-[#3D506A] hover:text-[#7A8FAA] transition-colors cursor-pointer">
                Sin subcategoría
            </button>
        </div>
    )
}

// ── Step: Numbers ─────────────────────────────────────────────────────────────

function NumbersStep({ data, isEdit, onChange, onNext }: { data: WizardData; isEdit: boolean; onChange: (p: Partial<WizardData>) => void; onNext: () => void }) {
    const valid = parseFloat(data.price) > 0
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <DollarSign size={15} className="text-emerald-400" />
                </div>
                <StepQuestion>Precio y existencias</StepQuestion>
            </div>
            <div>
                <p className="text-[11px] text-[#3D506A] uppercase tracking-wider font-semibold mb-1.5">Precio de venta *</p>
                <StepInput value={data.price} onChange={v => onChange({ price: v })} placeholder="0" mode="numeric" />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className={cn(data.isInfinite && 'opacity-40 pointer-events-none')}>
                    <p className="text-[11px] text-[#3D506A] uppercase tracking-wider font-semibold mb-1.5">{isEdit ? 'Cantidad' : 'Stock inicial'}</p>
                    <StepInput value={data.isInfinite ? '∞' : data.stockQty} onChange={v => onChange({ stockQty: v })} placeholder="0" mode="numeric" />
                </div>
                <div>
                    <p className="text-[11px] text-[#3D506A] uppercase tracking-wider font-semibold mb-1.5">Stock mínimo</p>
                    <StepInput value={data.minStock} onChange={v => onChange({ minStock: v })} placeholder="1" mode="numeric" />
                </div>
            </div>
            <div className="space-y-2">
                <Toggle label="Inventario infinito" description="Sin control de stock" value={data.isInfinite} onChange={v => onChange({ isInfinite: v })} />
                <Toggle label="Activo" description="Visible en punto de venta" value={data.isActive} onChange={v => onChange({ isActive: v })} />
            </div>
            <NextBtn onClick={onNext} disabled={!valid} label="Ver resumen" />
        </div>
    )
}

// ── Step: Recap ───────────────────────────────────────────────────────────────

function RecapStep({ data, catName, subName, isEdit, isPending, onConfirm, onEdit, hasSubs }: {
    data: WizardData; catName: string; subName: string | null; isEdit: boolean; hasSubs: boolean
    isPending?: boolean; onConfirm: () => void; onEdit: (s: WizardStep) => void
}) {
    const rows: { label: string; value: string; step: WizardStep }[] = [
        { label: 'Nombre',     value: data.name || '—',                                      step: 'name'        },
        { label: 'Código',     value: data.barcode || 'Sin código de barras',                  step: 'barcode'     },
        { label: 'Unidad',     value: UNITS.find(u => u.value === data.unit)?.label ?? '—',   step: 'unit'        },
        { label: 'Categoría',  value: catName,                                                 step: 'category'    },
        ...(hasSubs ? [{ label: 'Subcategoría', value: subName ?? 'Sin subcategoría', step: 'subcategory' as WizardStep }] : []),
        { label: 'Precio',     value: formatCurrency(parseFloat(data.price) || 0),             step: 'numbers'     },
        { label: 'Stock',      value: data.isInfinite ? 'Infinito' : `${data.stockQty} uds`,  step: 'numbers'     },
        { label: 'Mín. stock', value: data.isInfinite ? '—' : data.minStock,                  step: 'numbers'     },
        { label: 'Activo',     value: data.isActive ? 'Sí' : 'No',                            step: 'numbers'     },
    ]

    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Check size={15} className="text-emerald-400" />
                </div>
                <StepQuestion>Confirmar producto</StepQuestion>
            </div>
            <div className="rounded-xl bg-[#101520] border border-[#1E2A40] divide-y divide-[#192030] mb-4">
                {rows.map(row => (
                    <div key={row.label} className="flex items-center justify-between px-4 py-2.5 group">
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-[#3D506A] uppercase tracking-wider">{row.label}</p>
                            <p className="text-[13px] text-[#E4ECF7] font-medium truncate mt-0.5">{row.value}</p>
                        </div>
                        <button
                            onClick={() => onEdit(row.step)}
                            className="ml-3 px-2 py-1 rounded-lg text-[11px] text-[#3D506A] hover:text-orange-400 hover:bg-orange-500/10 transition-all cursor-pointer shrink-0"
                        >
                            Editar
                        </button>
                    </div>
                ))}
            </div>
            <button
                onClick={onConfirm}
                disabled={isPending}
                className="w-full h-12 rounded-xl bg-orange-500 text-white text-[14px] font-bold hover:bg-orange-600 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
                {isPending ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear producto')}
                {!isPending && <Check size={16} />}
            </button>
        </div>
    )
}
