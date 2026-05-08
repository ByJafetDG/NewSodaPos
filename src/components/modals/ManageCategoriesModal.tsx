import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Edit3, Trash2, Check, X, ArrowLeft, Layers, ListFilter, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useSubcategories, useCreateSubcategory, useUpdateSubcategory, useDeleteSubcategory } from '@/hooks/useSubcategories'
import { cn } from '@/lib/utils'
import type { Category, CategoryType, Subcategory } from '@/types'

interface ManageCategoriesModalProps {
    isOpen: boolean
    onClose: () => void
    categories: Category[]
    onCreate: (data: Pick<Category, 'name' | 'type'>) => void
    onUpdate: (id: string, data: Partial<Pick<Category, 'name' | 'type' | 'isActive' | 'sortOrder'>>) => void
    onDelete: (category: Category) => void
}

const TYPES: CategoryType[] = ['PRODUCTO', 'MENU', 'BUFFET']
const TYPE_LABELS: Record<CategoryType, string> = {
    PRODUCTO: 'Producto',
    MENU: 'Menú',
    BUFFET: 'Buffet',
    INGREDIENTE: 'Ingrediente',
}

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

type View = 'choice' | 'list' | 'create' | 'subcategories'

const slideVariants = {
    enter: (dir: number) => ({ x: dir >= 0 ? 52 : -52, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:  (dir: number) => ({ x: dir >= 0 ? -52 : 52, opacity: 0 }),
}

export function ManageCategoriesModal({
    isOpen, onClose, categories, onCreate, onUpdate, onDelete,
}: ManageCategoriesModalProps) {
    const [view, setView] = useState<View>('choice')
    const [dir, setDir] = useState(1)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editType, setEditType] = useState<CategoryType>('PRODUCTO')
    const [newName, setNewName] = useState('')
    const [newType, setNewType] = useState<CategoryType>('PRODUCTO')
    const [localCategories, setLocalCategories] = useState<Category[]>(categories)
    const [subcatCategoryId, setSubcatCategoryId] = useState<string | null>(null)

    // Subcategory form state
    const [newSubName, setNewSubName] = useState('')
    const [newSubDays, setNewSubDays] = useState<number[]>([])
    const [editingSubId, setEditingSubId] = useState<string | null>(null)
    const [editSubName, setEditSubName] = useState('')
    const [editSubDays, setEditSubDays] = useState<number[]>([])

    const { data: subcategories = [] } = useSubcategories()
    const createSubcat = useCreateSubcategory()
    const updateSubcat = useUpdateSubcategory()
    const deleteSubcat = useDeleteSubcategory()

    const editNameKb = useKeyboardInput(editName, setEditName)
    const newNameKb = useKeyboardInput(newName, setNewName)
    const newSubNameKb = useKeyboardInput(newSubName, setNewSubName)
    const editSubNameKb = useKeyboardInput(editSubName, setEditSubName)

    useEffect(() => { setLocalCategories(categories) }, [categories])

    useEffect(() => {
        if (!isOpen) {
            setView('choice')
            setEditingId(null)
            setNewName('')
            setDir(1)
            setSubcatCategoryId(null)
            resetSubForm()
        }
    }, [isOpen])

    function resetSubForm() {
        setNewSubName('')
        setNewSubDays([])
        setEditingSubId(null)
        setEditSubName('')
        setEditSubDays([])
    }

    function goTo(next: View, direction = 1) {
        setDir(direction)
        setView(next)
    }

    function openSubcategories(catId: string) {
        setSubcatCategoryId(catId)
        resetSubForm()
        goTo('subcategories', 1)
    }

    function startEdit(cat: Category) {
        setEditingId(cat.id)
        setEditName(cat.name)
        setEditType(cat.type)
    }

    function confirmEdit() {
        if (!editingId || !editName.trim()) return
        onUpdate(editingId, { name: editName.trim(), type: editType })
        setEditingId(null)
    }

    function confirmCreate() {
        if (!newName.trim()) return
        onCreate({ name: newName.trim(), type: newType })
        setNewName('')
        setNewType('PRODUCTO')
        goTo('list', 1)
    }

    function moveCategory(fromIndex: number, direction: -1 | 1) {
        const toIndex = fromIndex + direction
        if (toIndex < 0 || toIndex >= localCategories.length) return
        const reordered = [...localCategories]
        ;[reordered[fromIndex], reordered[toIndex]] = [reordered[toIndex], reordered[fromIndex]]
        setLocalCategories(reordered)
        reordered.forEach((cat, i) => {
            if (cat.sortOrder !== i) onUpdate(cat.id, { sortOrder: i })
        })
    }

    function toggleDay(days: number[], day: number): number[] {
        return days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => a - b)
    }

    async function confirmCreateSubcat() {
        if (!newSubName.trim() || !subcatCategoryId) return
        const catSubs = subcategories.filter(s => s.categoryId === subcatCategoryId)
        await createSubcat.mutateAsync({
            categoryId: subcatCategoryId,
            name: newSubName.trim(),
            showDays: newSubDays.length ? newSubDays : null,
            sortOrder: catSubs.length,
        })
        setNewSubName('')
        setNewSubDays([])
    }

    function startEditSubcat(sub: Subcategory) {
        setEditingSubId(sub.id)
        setEditSubName(sub.name)
        setEditSubDays(sub.showDays ?? [])
    }

    async function confirmEditSubcat() {
        if (!editingSubId || !editSubName.trim()) return
        await updateSubcat.mutateAsync({
            id: editingSubId,
            name: editSubName.trim(),
            showDays: editSubDays.length ? editSubDays : null,
        })
        setEditingSubId(null)
    }

    async function moveSubcat(subs: Subcategory[], fromIndex: number, direction: -1 | 1) {
        const toIndex = fromIndex + direction
        if (toIndex < 0 || toIndex >= subs.length) return
        const reordered = [...subs]
        ;[reordered[fromIndex], reordered[toIndex]] = [reordered[toIndex], reordered[fromIndex]]
        await Promise.all(
            reordered.map((s, i) => {
                if (s.sortOrder !== i) return updateSubcat.mutateAsync({ id: s.id, sortOrder: i })
            })
        )
    }

    const subcatCategory = subcatCategoryId ? categories.find(c => c.id === subcatCategoryId) : null
    const catSubcats = subcatCategoryId
        ? subcategories.filter(s => s.categoryId === subcatCategoryId).sort((a, b) => a.sortOrder - b.sortOrder)
        : []

    const title =
        view === 'choice'       ? 'Categorías' :
        view === 'list'         ? 'Ver categorías' :
        view === 'create'       ? 'Nueva categoría' :
                                  `${subcatCategory?.name ?? ''}`

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="" width="max-w-md">
            <div className="flex items-center justify-between mb-4 -mt-1">
                <div className="flex items-center gap-2">
                    {view !== 'choice' && (
                        <button
                            onClick={() => goTo(view === 'subcategories' ? 'list' : 'choice', -1)}
                            className="w-7 h-7 rounded-lg text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                        >
                            <ArrowLeft size={14} />
                        </button>
                    )}
                    <div>
                        <h2 className="text-[15px] font-semibold text-[#E4ECF7]">{title}</h2>
                        {view === 'subcategories' && (
                            <p className="text-[11px] text-[#3D506A]">Subcategorías</p>
                        )}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="overflow-hidden">
                <AnimatePresence mode="popLayout" custom={dir}>
                    {view === 'choice' && (
                        <motion.div
                            key="choice"
                            custom={dir}
                            variants={slideVariants}
                            initial="enter" animate="center" exit="exit"
                            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className="space-y-3 pb-1"
                        >
                            <button
                                onClick={() => goTo('create', 1)}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#1E2A40] hover:border-orange-500/30 hover:bg-orange-500/5 transition-all cursor-pointer group text-left"
                            >
                                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0 group-hover:bg-orange-500/20 transition-colors">
                                    <Plus size={20} className="text-orange-400" />
                                </div>
                                <div>
                                    <p className="text-[14px] font-medium text-[#E4ECF7]">Nueva categoría</p>
                                    <p className="text-[12px] text-[#3D506A]">Agregar una categoría al sistema</p>
                                </div>
                            </button>

                            <button
                                onClick={() => goTo('list', 1)}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border border-[#1E2A40] hover:border-blue-500/30 hover:bg-blue-500/5 transition-all cursor-pointer group text-left"
                            >
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                                    <ListFilter size={20} className="text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-[14px] font-medium text-[#E4ECF7]">Ver / editar categorías</p>
                                    <p className="text-[12px] text-[#3D506A]">{categories.length} categoría{categories.length !== 1 ? 's' : ''} registrada{categories.length !== 1 ? 's' : ''}</p>
                                </div>
                            </button>
                        </motion.div>
                    )}

                    {view === 'create' && (
                        <motion.div
                            key="create"
                            custom={dir}
                            variants={slideVariants}
                            initial="enter" animate="center" exit="exit"
                            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className="space-y-3 pb-1"
                        >
                            <input
                                type="text"
                                {...newNameKb}
                                placeholder="Nombre de la categoría"
                                className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                                autoFocus
                            />
                            <div className="flex gap-1">
                                {TYPES.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setNewType(t)}
                                        className={cn(
                                            'flex-1 h-8 rounded-lg text-[11px] font-medium border transition-all cursor-pointer',
                                            newType === t
                                                ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                                                : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA]'
                                        )}
                                    >
                                        {TYPE_LABELS[t]}
                                    </button>
                                ))}
                            </div>
                            <Button
                                variant="primary" size="md"
                                onClick={confirmCreate}
                                disabled={!newName.trim()}
                                className="w-full"
                            >
                                <Check size={14} />
                                Crear categoría
                            </Button>
                        </motion.div>
                    )}

                    {view === 'list' && (
                        <motion.div
                            key="list"
                            custom={dir}
                            variants={slideVariants}
                            initial="enter" animate="center" exit="exit"
                            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className="space-y-2 max-h-[55vh] overflow-y-auto pb-1"
                        >
                            {localCategories.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-10 text-[#3D506A]">
                                    <Layers size={32} className="mb-2 opacity-40" />
                                    <p className="text-[13px]">Sin categorías</p>
                                </div>
                            )}
                            {localCategories.map((cat, idx) => {
                                const subCount = subcategories.filter(s => s.categoryId === cat.id).length
                                return (
                                    <div key={cat.id} className="rounded-xl border border-[#1E2A40] overflow-hidden">
                                        {editingId === cat.id ? (
                                            <div className="p-3 bg-[#101520] space-y-2">
                                                <input
                                                    type="text"
                                                    {...editNameKb}
                                                    className="w-full h-9 px-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[13px] outline-none focus:border-orange-500/40"
                                                />
                                                <div className="flex gap-1">
                                                    {TYPES.map(t => (
                                                        <button
                                                            key={t}
                                                            onClick={() => setEditType(t)}
                                                            className={cn(
                                                                'flex-1 h-7 rounded-lg text-[11px] font-medium border transition-all cursor-pointer',
                                                                editType === t
                                                                    ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                                                                    : 'bg-[#0B0E19] border-[#1E2A40] text-[#7A8FAA]'
                                                            )}
                                                        >
                                                            {TYPE_LABELS[t]}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="flex-1">
                                                        <X size={13} />
                                                        Cancelar
                                                    </Button>
                                                    <Button variant="primary" size="sm" onClick={confirmEdit} className="flex-1">
                                                        <Check size={13} />
                                                        Guardar
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 px-3 py-2.5">
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button
                                                        onClick={() => moveCategory(idx, -1)}
                                                        disabled={idx === 0}
                                                        className="w-5 h-5 rounded flex items-center justify-center text-[#3D506A] hover:text-[#E4ECF7] hover:bg-[#1C2438] transition-all cursor-pointer disabled:opacity-20 disabled:cursor-default"
                                                    >
                                                        <ChevronUp size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => moveCategory(idx, 1)}
                                                        disabled={idx === localCategories.length - 1}
                                                        className="w-5 h-5 rounded flex items-center justify-center text-[#3D506A] hover:text-[#E4ECF7] hover:bg-[#1C2438] transition-all cursor-pointer disabled:opacity-20 disabled:cursor-default"
                                                    >
                                                        <ChevronDown size={12} />
                                                    </button>
                                                </div>
                                                <GripVertical size={13} className="shrink-0 text-[#283A56]" />
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-[13px] font-medium text-[#E4ECF7]">{cat.name}</span>
                                                    <span className="ml-2 text-[11px] text-[#3D506A]">{TYPE_LABELS[cat.type]}</span>
                                                </div>
                                                <button
                                                    onClick={() => openSubcategories(cat.id)}
                                                    title="Subcategorías"
                                                    className={cn(
                                                        'flex items-center gap-1 px-2 h-6 rounded-md text-[10px] font-medium border transition-all cursor-pointer shrink-0',
                                                        subCount > 0
                                                            ? 'bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/15'
                                                            : 'bg-[#101520] border-[#1E2A40] text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#1C2438]'
                                                    )}
                                                >
                                                    <Layers size={10} />
                                                    {subCount > 0 ? subCount : '+'}
                                                </button>
                                                <button
                                                    onClick={() => onUpdate(cat.id, { isActive: !cat.isActive })}
                                                    className={cn(
                                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0',
                                                        cat.isActive ? 'bg-orange-500' : 'bg-[#1C2438]'
                                                    )}
                                                >
                                                    <span className={cn(
                                                        'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                                                        cat.isActive ? 'translate-x-4.5' : 'translate-x-0.5'
                                                    )} />
                                                </button>
                                                <button
                                                    onClick={() => startEdit(cat)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-[#E4ECF7] hover:bg-[#1C2438] transition-all cursor-pointer"
                                                >
                                                    <Edit3 size={13} />
                                                </button>
                                                <button
                                                    onClick={() => onDelete(cat)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </motion.div>
                    )}

                    {view === 'subcategories' && (
                        <motion.div
                            key="subcategories"
                            custom={dir}
                            variants={slideVariants}
                            initial="enter" animate="center" exit="exit"
                            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className="space-y-2 pb-1"
                        >
                            <div className="max-h-[32vh] overflow-y-auto space-y-2">
                                {catSubcats.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-6 text-[#3D506A]">
                                        <Layers size={28} className="mb-2 opacity-40" />
                                        <p className="text-[12px]">Sin subcategorías</p>
                                    </div>
                                )}
                                {catSubcats.map((sub, idx) => (
                                    <div key={sub.id} className="rounded-xl border border-[#1E2A40] overflow-hidden">
                                        {editingSubId === sub.id ? (
                                            <div className="p-3 bg-[#101520] space-y-2">
                                                <input
                                                    type="text"
                                                    {...editSubNameKb}
                                                    className="w-full h-9 px-3 rounded-lg bg-[#0B0E19] border border-[#1E2A40] text-[#E4ECF7] text-[13px] outline-none focus:border-violet-500/40"
                                                />
                                                <DayPicker days={editSubDays} onChange={setEditSubDays} />
                                                <div className="flex gap-2">
                                                    <Button variant="ghost" size="sm" onClick={() => setEditingSubId(null)} className="flex-1">
                                                        <X size={13} />
                                                        Cancelar
                                                    </Button>
                                                    <Button variant="primary" size="sm" onClick={confirmEditSubcat} className="flex-1">
                                                        <Check size={13} />
                                                        Guardar
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 px-3 py-2">
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button
                                                        onClick={() => moveSubcat(catSubcats, idx, -1)}
                                                        disabled={idx === 0}
                                                        className="w-5 h-5 rounded flex items-center justify-center text-[#3D506A] hover:text-[#E4ECF7] hover:bg-[#1C2438] transition-all cursor-pointer disabled:opacity-20 disabled:cursor-default"
                                                    >
                                                        <ChevronUp size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => moveSubcat(catSubcats, idx, 1)}
                                                        disabled={idx === catSubcats.length - 1}
                                                        className="w-5 h-5 rounded flex items-center justify-center text-[#3D506A] hover:text-[#E4ECF7] hover:bg-[#1C2438] transition-all cursor-pointer disabled:opacity-20 disabled:cursor-default"
                                                    >
                                                        <ChevronDown size={12} />
                                                    </button>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-medium text-[#E4ECF7] truncate">{sub.name}</p>
                                                    <div className="flex gap-0.5 mt-0.5">
                                                        {sub.showDays
                                                            ? sub.showDays.map(d => (
                                                                <span key={d} className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-500/15 text-violet-400">
                                                                    {DAY_LABELS[d]}
                                                                </span>
                                                            ))
                                                            : <span className="text-[9px] text-[#3D506A]">Siempre visible</span>
                                                        }
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => updateSubcat.mutateAsync({ id: sub.id, isActive: !sub.isActive })}
                                                    className={cn(
                                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0',
                                                        sub.isActive ? 'bg-violet-500' : 'bg-[#1C2438]'
                                                    )}
                                                >
                                                    <span className={cn(
                                                        'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                                                        sub.isActive ? 'translate-x-4.5' : 'translate-x-0.5'
                                                    )} />
                                                </button>
                                                <button
                                                    onClick={() => startEditSubcat(sub)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-[#E4ECF7] hover:bg-[#1C2438] transition-all cursor-pointer"
                                                >
                                                    <Edit3 size={13} />
                                                </button>
                                                <button
                                                    onClick={() => deleteSubcat.mutateAsync(sub.id)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-[#1E2A40] pt-3 space-y-2">
                                <p className="text-[11px] text-[#3D506A] uppercase tracking-wider font-semibold">Nueva subcategoría</p>
                                <input
                                    type="text"
                                    {...newSubNameKb}
                                    placeholder="Ej: Lunes, Martes..."
                                    className="w-full h-9 px-3 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
                                />
                                <DayPicker days={newSubDays} onChange={setNewSubDays} />
                                <Button
                                    variant="primary" size="sm"
                                    onClick={confirmCreateSubcat}
                                    disabled={!newSubName.trim() || createSubcat.isPending}
                                    className="w-full bg-violet-600 hover:bg-violet-700 border-violet-500/30"
                                >
                                    <Plus size={13} />
                                    Crear subcategoría
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </BaseModal>
    )
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
    function toggle(day: number) {
        onChange(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => a - b))
    }
    return (
        <div className="flex gap-1">
            <span className="text-[10px] text-[#3D506A] self-center mr-1 shrink-0">Días:</span>
            {DAY_LABELS.map((label, day) => (
                <button
                    key={day}
                    onClick={() => toggle(day)}
                    title={DAY_NAMES[day]}
                    className={cn(
                        'flex-1 h-7 rounded-lg text-[11px] font-bold border transition-all cursor-pointer',
                        days.includes(day)
                            ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                            : 'bg-[#0B0E19] border-[#1E2A40] text-[#3D506A] hover:text-[#7A8FAA]'
                    )}
                >
                    {label}
                </button>
            ))}
            {days.length === 0 && (
                <span className="text-[9px] text-[#3D506A] self-center ml-1 shrink-0">siempre</span>
            )}
        </div>
    )
}
