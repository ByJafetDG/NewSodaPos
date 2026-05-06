import { useState, useEffect } from 'react'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { cn } from '@/lib/utils'
import type { Product, Category, ProductUnit } from '@/types'

const DRAFT_KEY = 'pos_product_draft'
type DraftData = { name: string; barcode: string; categoryId: string; price: string; stockQty: string; unit: ProductUnit; minStock: string; isInfinite: boolean; isActive: boolean }

interface ProductFormModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => void
    product?: Product | null
    categories: Category[]
    isPending?: boolean
}

const UNITS: ProductUnit[] = ['UNIDAD', 'KG', 'LITRO', 'PORCION']
const UNIT_LABELS: Record<ProductUnit, string> = {
    UNIDAD: 'Unidad',
    KG: 'Kg',
    LITRO: 'Litro',
    PORCION: 'Porción',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">{children}</p>
}

function TextInput({ value, onChange, placeholder, mode = 'alpha' }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    mode?: 'alpha' | 'numeric'
}) {
    const kb = useKeyboardInput(value, onChange, { mode })
    return (
        <input
            type="text"
            {...kb}
            placeholder={placeholder}
            className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
        />
    )
}

export function ProductFormModal({ isOpen, onClose, onConfirm, product, categories, isPending }: ProductFormModalProps) {
    const [name, setName] = useState('')
    const [barcode, setBarcode] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [price, setPrice] = useState('')
    const [stockQty, setStockQty] = useState('0')
    const [unit, setUnit] = useState<ProductUnit>('UNIDAD')
    const [minStock, setMinStock] = useState('1')
    const [isInfinite, setIsInfinite] = useState(false)
    const [isActive, setIsActive] = useState(true)
    const [hasDraft, setHasDraft] = useState(false)

    useEffect(() => {
        if (isOpen) {
            if (product) {
                setName(product.name)
                setBarcode(product.barcode ?? '')
                setCategoryId(product.categoryId)
                setPrice(String(product.price))
                setStockQty(String(product.stockQty))
                setUnit(product.unit)
                setMinStock(String(product.minStock))
                setIsInfinite(product.isInfinite)
                setIsActive(product.isActive)
                setHasDraft(false)
            } else {
                const draft = (() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as DraftData | null } catch { return null } })()
                if (draft?.name) {
                    setName(draft.name); setBarcode(draft.barcode ?? '')
                    setCategoryId(draft.categoryId || (categories[0]?.id ?? ''))
                    setPrice(draft.price ?? ''); setStockQty(draft.stockQty ?? '0')
                    setUnit(draft.unit ?? 'UNIDAD'); setMinStock(draft.minStock ?? '1')
                    setIsInfinite(draft.isInfinite ?? false); setIsActive(draft.isActive ?? true)
                    setHasDraft(true)
                } else {
                    setName(''); setBarcode('')
                    setCategoryId(categories[0]?.id ?? '')
                    setPrice(''); setStockQty('0')
                    setUnit('UNIDAD'); setMinStock('1')
                    setIsInfinite(false); setIsActive(true)
                    setHasDraft(false)
                }
            }
        }
    }, [isOpen, product, categories])

    useEffect(() => {
        if (!isOpen || product) return
        if (!name && !price) return
        const draft: DraftData = { name, barcode, categoryId, price, stockQty, unit, minStock, isInfinite, isActive }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    }, [name, barcode, categoryId, price, stockQty, unit, minStock, isInfinite, isActive, isOpen, product])

    function handleDiscardDraft() {
        localStorage.removeItem(DRAFT_KEY)
        setHasDraft(false)
        setName(''); setBarcode('')
        setCategoryId(categories[0]?.id ?? '')
        setPrice(''); setStockQty('0')
        setUnit('UNIDAD'); setMinStock('1')
        setIsInfinite(false); setIsActive(true)
    }

    const isValid = name.trim().length > 0 && parseFloat(price) > 0 && categoryId

    function handleConfirm() {
        if (!isValid || isPending) return
        localStorage.removeItem(DRAFT_KEY)
        setHasDraft(false)
        onConfirm({
            name: name.trim(),
            barcode: barcode.trim() || null,
            categoryId,
            price: parseFloat(price),
            cost: 0,
            unit,
            minStock: parseInt(minStock) || 1,
            stockQty: isInfinite ? (product?.stockQty ?? 0) : (parseFloat(stockQty) || 0),
            isInfinite,
            isActive,
            imageUrl: null,
        })
    }

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={product ? 'Editar producto' : 'Nuevo producto'}
            width="max-w-lg"
        >
            <div className="space-y-4">
                {/* Draft recovery banner */}
                {hasDraft && !product && (
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <div>
                            <p className="text-[13px] font-semibold text-amber-400">Producto pendiente</p>
                            <p className="text-[11px] text-[#7A8FAA]">Continúa donde lo dejaste o descarta el borrador</p>
                        </div>
                        <button
                            onClick={handleDiscardDraft}
                            className="text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer ml-3 shrink-0"
                        >
                            Descartar
                        </button>
                    </div>
                )}

                {/* Name + Barcode */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                        <FieldLabel>Nombre *</FieldLabel>
                        <TextInput value={name} onChange={setName} placeholder="Nombre del producto" />
                    </div>
                    <div>
                        <FieldLabel>Código de barras</FieldLabel>
                        <TextInput value={barcode} onChange={setBarcode} placeholder="Opcional" mode="alpha" />
                    </div>
                    <div>
                        <FieldLabel>Unidad</FieldLabel>
                        <div className="flex gap-1">
                            {UNITS.map(u => (
                                <button
                                    key={u}
                                    onClick={() => setUnit(u)}
                                    className={cn(
                                        'flex-1 h-10 rounded-xl text-[12px] font-medium border transition-all cursor-pointer',
                                        unit === u
                                            ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                                            : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#1C2438]'
                                    )}
                                >
                                    {UNIT_LABELS[u]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Category */}
                <div>
                    <FieldLabel>Categoría *</FieldLabel>
                    <div className="flex flex-wrap gap-1.5">
                        {categories.filter(c => c.isActive).map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setCategoryId(cat.id)}
                                className={cn(
                                    'px-3 h-8 rounded-lg text-[12px] font-medium border transition-all cursor-pointer',
                                    categoryId === cat.id
                                        ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                                        : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#1C2438]'
                                )}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Price + Qty + Min stock */}
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <FieldLabel>Precio *</FieldLabel>
                        <TextInput value={price} onChange={setPrice} placeholder="0" mode="numeric" />
                    </div>
                    <div className={cn(isInfinite && 'opacity-40 pointer-events-none')}>
                        <FieldLabel>{product ? 'Cantidad' : 'Stock inicial'}</FieldLabel>
                        <TextInput value={isInfinite ? '∞' : stockQty} onChange={setStockQty} placeholder="0" mode="numeric" />
                    </div>
                    <div>
                        <FieldLabel>Stock mínimo</FieldLabel>
                        <TextInput value={minStock} onChange={setMinStock} placeholder="1" mode="numeric" />
                    </div>
                </div>

                {/* Toggles */}
                <div className="flex gap-3">
                    <ToggleRow
                        label="Inventario infinito"
                        description="Sin control de stock"
                        value={isInfinite}
                        onChange={setIsInfinite}
                    />
                    <ToggleRow
                        label="Activo"
                        description="Visible en venta"
                        value={isActive}
                        onChange={setIsActive}
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <Button variant="secondary" size="md" onClick={onClose} className="flex-1">
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        onClick={handleConfirm}
                        disabled={!isValid}
                        loading={isPending}
                        className="flex-1"
                    >
                        {product ? 'Guardar cambios' : 'Crear producto'}
                    </Button>
                </div>
            </div>
        </BaseModal>
    )
}

function ToggleRow({ label, description, value, onChange }: {
    label: string
    description: string
    value: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <button
            onClick={() => onChange(!value)}
            className={cn(
                'flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left',
                value
                    ? 'bg-orange-500/8 border-orange-500/20'
                    : 'bg-[#101520] border-[#1E2A40]'
            )}
        >
            <div>
                <p className={cn('text-[12px] font-semibold', value ? 'text-orange-400' : 'text-[#E4ECF7]')}>{label}</p>
                <p className="text-[11px] text-[#3D506A]">{description}</p>
            </div>
            <div className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                value ? 'bg-orange-500' : 'bg-[#1C2438]'
            )}>
                <span className={cn(
                    'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                    value ? 'translate-x-4.5' : 'translate-x-0.5'
                )} />
            </div>
        </button>
    )
}
