import { useState, useEffect } from 'react'
import { Plus, Edit3, Trash2, Check, X } from 'lucide-react'
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

const TYPES: CategoryType[] = ['PRODUCTO', 'MENU', 'BUFFET', 'INGREDIENTE']
const TYPE_LABELS: Record<CategoryType, string> = {
    PRODUCTO: 'Producto',
    MENU: 'Menú',
    BUFFET: 'Buffet',
    INGREDIENTE: 'Ingrediente',
}

export function ManageCategoriesModal({
    isOpen, onClose, categories, onCreate, onUpdate, onDelete,
}: ManageCategoriesModalProps) {
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editType, setEditType] = useState<CategoryType>('PRODUCTO')
    const [isCreating, setIsCreating] = useState(false)
    const [newName, setNewName] = useState('')
    const [newType, setNewType] = useState<CategoryType>('PRODUCTO')

    const editNameKb = useKeyboardInput(editName, setEditName)
    const newNameKb = useKeyboardInput(newName, setNewName)

    useEffect(() => {
        if (!isOpen) {
            setEditingId(null)
            setIsCreating(false)
            setNewName('')
        }
    }, [isOpen])

    function startEdit(cat: Category) {
        setEditingId(cat.id)
        setEditName(cat.name)
        setEditType(cat.type)
        setIsCreating(false)
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
        setIsCreating(false)
    }

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title="Gestionar categorías" width="max-w-md">
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {/* Existing categories */}
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

                {/* Create new */}
                {isCreating ? (
                    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
                        <input
                            type="text"
                            {...newNameKb}
                            placeholder="Nombre de la categoría"
                            className="w-full h-9 px-3 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40"
                            autoFocus
                        />
                        <div className="flex gap-1">
                            {TYPES.map(t => (
                                <button
                                    key={t}
                                    onClick={() => setNewType(t)}
                                    className={cn(
                                        'flex-1 h-7 rounded-lg text-[11px] font-medium border transition-all cursor-pointer',
                                        newType === t
                                            ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                                            : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA]'
                                    )}
                                >
                                    {TYPE_LABELS[t]}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)} className="flex-1">
                                <X size={13} />
                                Cancelar
                            </Button>
                            <Button variant="primary" size="sm" onClick={confirmCreate} disabled={!newName.trim()} className="flex-1">
                                <Check size={13} />
                                Crear
                            </Button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => { setIsCreating(true); setEditingId(null) }}
                        className="w-full h-10 rounded-xl border border-dashed border-[#1E2A40] text-[#3D506A] hover:border-orange-500/30 hover:text-orange-400 hover:bg-orange-500/5 transition-all flex items-center justify-center gap-2 text-[13px] cursor-pointer"
                    >
                        <Plus size={14} />
                        Nueva categoría
                    </button>
                )}

                <div className="pt-2">
                    <Button variant="secondary" size="md" onClick={onClose} className="w-full">
                        Cerrar
                    </Button>
                </div>
            </div>
        </BaseModal>
    )
}
