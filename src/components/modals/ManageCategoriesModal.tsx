import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Edit3, Trash2, Check, X, ArrowLeft, Layers, ListFilter } from 'lucide-react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { cn } from '@/lib/utils'
import type { Category, CategoryType } from '@/types'

interface ManageCategoriesModalProps {
    isOpen: boolean
    onClose: () => void
    categories: Category[]
    onCreate: (data: Pick<Category, 'name' | 'type'>) => void
    onUpdate: (id: string, data: Partial<Pick<Category, 'name' | 'type' | 'isActive'>>) => void
    onDelete: (category: Category) => void
}

const TYPES: CategoryType[] = ['PRODUCTO', 'MENU', 'BUFFET']
const TYPE_LABELS: Record<CategoryType, string> = {
    PRODUCTO: 'Producto',
    MENU: 'Menú',
    BUFFET: 'Buffet',
    INGREDIENTE: 'Ingrediente',
}

type View = 'choice' | 'list' | 'create'

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

    const editNameKb = useKeyboardInput(editName, setEditName)
    const newNameKb = useKeyboardInput(newName, setNewName)

    useEffect(() => {
        if (!isOpen) {
            setView('choice')
            setEditingId(null)
            setNewName('')
            setDir(1)
        }
    }, [isOpen])

    function goTo(next: View, direction = 1) {
        setDir(direction)
        setView(next)
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

    const title =
        view === 'choice' ? 'Categorías' :
        view === 'list'   ? 'Ver categorías' :
                            'Nueva categoría'

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="" width="max-w-md">
            {/* Custom header */}
            <div className="flex items-center justify-between mb-4 -mt-1">
                <div className="flex items-center gap-2">
                    {view !== 'choice' && (
                        <button
                            onClick={() => goTo('choice', -1)}
                            className="w-7 h-7 rounded-lg text-[#3D506A] hover:text-[#7A8FAA] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                        >
                            <ArrowLeft size={14} />
                        </button>
                    )}
                    <h2 className="text-[15px] font-semibold text-[#E4ECF7]">{title}</h2>
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
                            {categories.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-10 text-[#3D506A]">
                                    <Layers size={32} className="mb-2 opacity-40" />
                                    <p className="text-[13px]">Sin categorías</p>
                                </div>
                            )}
                            {categories.map(cat => (
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
                                        <div className="flex items-center gap-3 px-3 py-2.5">
                                            <div className="flex-1 min-w-0">
                                                <span className="text-[13px] font-medium text-[#E4ECF7]">{cat.name}</span>
                                                <span className="ml-2 text-[11px] text-[#3D506A]">{TYPE_LABELS[cat.type]}</span>
                                            </div>
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
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </BaseModal>
    )
}
