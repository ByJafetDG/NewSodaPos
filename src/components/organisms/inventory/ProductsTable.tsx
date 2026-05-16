import { useState, useEffect, Fragment } from 'react'
import { Search, Plus, Settings2, Edit3, Trash2, Package, Infinity, Eye } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { Badge } from '@/components/atoms/Badge'
import { Button } from '@/components/atoms/Button'
import { EmptyState } from '@/components/atoms/EmptyState'
import { POSPreviewModal } from '@/components/modals/POSPreviewModal'
import { cn, formatCurrency } from '@/lib/utils'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import type { Product, Category, Subcategory } from '@/types'

interface ProductsTableProps {
    products: Product[]
    categories: Category[]
    subcategories: Subcategory[]
    onNew: () => void
    onEdit: (product: Product) => void
    onDelete: (product: Product) => void
    onToggle: (product: Product) => void
    onManageCategories: () => void
    onSearchEnter?: (barcode: string, found: boolean) => void
}

function stockVariant(p: Product): 'danger' | 'warning' | 'success' | 'info' {
    if (p.isInfinite) return 'info'
    if (p.stockQty === 0) return 'danger'
    if (p.stockQty < p.minStock) return 'warning'
    return 'success'
}

function StockCell({ product }: { product: Product }) {
    if (product.isInfinite) {
        return <Badge variant="info"><Infinity size={11} />∞</Badge>
    }
    return (
        <Badge variant={stockVariant(product)}>
            {product.stockQty}
            {product.stockQty < product.minStock && product.stockQty > 0 && (
                <span className="opacity-60 text-[10px]">/ mín {product.minStock}</span>
            )}
        </Badge>
    )
}

export function ProductsTable({
    products,
    categories,
    subcategories,
    onNew,
    onEdit,
    onDelete,
    onToggle,
    onManageCategories,
    onSearchEnter,
}: ProductsTableProps) {
    const { inventorySearch, setInventorySearch } = useUIStore()
    const [search, setSearch] = useState(inventorySearch)
    const [selectedCat, setSelectedCat] = useState<string | null>(null)
    const [selectedSub, setSelectedSub] = useState<string | null>(null)
    const [previewOpen, setPreviewOpen] = useState(false)
    const searchKb = useKeyboardInput(search, setSearch, { mode: 'alpha' })

    useEffect(() => {
        if (inventorySearch) setInventorySearch('')
    }, [])

    const catSubcategories = selectedCat
        ? subcategories.filter(s => s.categoryId === selectedCat && s.isActive)
        : []

    function selectCat(id: string | null) {
        setSelectedCat(id)
        setSelectedSub(null)
    }

    const filtered = products.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode ?? '').includes(search)
        const matchSub = !selectedSub || (p.subcategoryIds ?? []).includes(selectedSub)
        return matchSearch && matchSub
    })

    const grouped = categories
        .filter(c => c.isActive)
        .map(cat => ({
            category: cat,
            products: filtered.filter(p => p.categoryId === cat.id),
        }))
        .filter(g => g.products.length > 0)

    const groupedVisible = selectedCat ? grouped.filter(g => g.category.id === selectedCat) : grouped
    const uncategorized = selectedCat ? [] : filtered.filter(p => !categories.find(c => c.id === p.categoryId))

    return (
        <div className="flex flex-col h-full">
            {/* Top bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#192030] shrink-0">
                <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none" />
                    <input
                        type="text"
                        {...searchKb}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                const trimmed = search.trim()
                                if (trimmed) onSearchEnter?.(trimmed, filtered.length > 0)
                            }
                        }}
                        placeholder="Buscar producto o código..."
                        className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                    />
                </div>
                <Button variant="secondary" size="sm" onClick={onManageCategories} className="shrink-0 gap-1.5">
                    <Settings2 size={14} />
                    Categorías
                </Button>
                <Button variant="primary" size="sm" onClick={onNew} className="shrink-0 gap-1.5">
                    <Plus size={14} />
                    Nuevo producto
                </Button>
            </div>

            {/* Category filter pills */}
            {categories.filter(c => c.isActive).length > 0 && (
                <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#192030] overflow-x-auto shrink-0">
                    <button
                        onClick={() => selectCat(null)}
                        className={cn(
                            'px-3 h-7 rounded-lg text-[12px] font-medium border transition-all cursor-pointer whitespace-nowrap',
                            !selectedCat
                                ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                                : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#1C2438]'
                        )}
                    >
                        Todos
                    </button>
                    {categories.filter(c => c.isActive).map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => selectCat(selectedCat === cat.id ? null : cat.id)}
                            className={cn(
                                'px-3 h-7 rounded-lg text-[12px] font-medium border transition-all cursor-pointer whitespace-nowrap',
                                selectedCat === cat.id
                                    ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                                    : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#1C2438]'
                            )}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Vista POS button — when a category is selected */}
            {selectedCat && (
                <div className="flex justify-end px-4 py-1.5 border-b border-[#192030] shrink-0 bg-[#0D1020]/40">
                    <button
                        onClick={() => setPreviewOpen(true)}
                        className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-medium bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 transition-all cursor-pointer"
                    >
                        <Eye size={12} />
                        Vista POS
                    </button>
                </div>
            )}

            {/* Subcategory filter pills — only when a category is selected and has subcategories */}
            {catSubcategories.length > 0 && (
                <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-[#192030] overflow-x-auto shrink-0 bg-[#0D1020]/40">
                    <button
                        onClick={() => setSelectedSub(null)}
                        className={cn(
                            'px-2.5 h-6 rounded-md text-[11px] font-medium border transition-all cursor-pointer whitespace-nowrap',
                            !selectedSub
                                ? 'bg-violet-500/15 border-violet-500/30 text-violet-400'
                                : 'bg-transparent border-[#1E2A40] text-[#3D506A] hover:text-[#7A8FAA]'
                        )}
                    >
                        Todas
                    </button>
                    {catSubcategories.map(sub => (
                        <button
                            key={sub.id}
                            onClick={() => setSelectedSub(selectedSub === sub.id ? null : sub.id)}
                            className={cn(
                                'px-2.5 h-6 rounded-md text-[11px] font-medium border transition-all cursor-pointer whitespace-nowrap',
                                selectedSub === sub.id
                                    ? 'bg-violet-500/15 border-violet-500/30 text-violet-400'
                                    : 'bg-transparent border-[#1E2A40] text-[#3D506A] hover:text-[#7A8FAA]'
                            )}
                        >
                            {sub.name}
                        </button>
                    ))}
                </div>
            )}

            {/* POS Preview Modal */}
            <POSPreviewModal
                isOpen={previewOpen}
                onClose={() => setPreviewOpen(false)}
                category={categories.find(c => c.id === selectedCat) ?? null}
                products={products}
                subcategories={subcategories}
            />

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                    <EmptyState
                        icon={<Package size={32} />}
                        title={search ? 'Sin resultados' : 'Sin productos'}
                        description={search ? `No se encontró "${search}"` : 'Agrega tu primer producto'}
                    />
                ) : (
                    <table className="w-full text-[13px]">
                        <thead className="sticky top-0 z-10 bg-[#0B0E19]">
                            <tr className="border-b border-[#192030]">
                                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] w-[40%]">Producto</th>
                                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Código</th>
                                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Precio</th>
                                <th className="text-right px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Costo</th>
                                <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Stock</th>
                                <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Estado</th>
                                <th className="w-20 py-2.5" />
                            </tr>
                        </thead>
                        <tbody>
                            {groupedVisible.map(({ category, products: catProducts }) => (
                                <Fragment key={category.id}>
                                    <tr className="bg-[#0D1117]">
                                        <td colSpan={7} className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-[#3D506A]">
                                            {category.name}
                                            <span className="ml-2 text-[#1E2A40] font-normal normal-case tracking-normal">
                                                {catProducts.length} tipo{catProducts.length !== 1 ? 's' : ''}
                                                {' · '}
                                                {catProducts.filter(p => !p.isInfinite).reduce((sum, p) => sum + p.stockQty, 0)}
                                                {catProducts.some(p => p.isInfinite) ? '+' : ''} en stock
                                            </span>
                                        </td>
                                    </tr>
                                    {catProducts.map(product => (
                                        <ProductRow
                                            key={product.id}
                                            product={product}
                                            subNames={subcategories.filter(s => (product.subcategoryIds ?? []).includes(s.id)).map(s => s.name)}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                            onToggle={onToggle}
                                        />
                                    ))}
                                </Fragment>
                            ))}
                            {uncategorized.length > 0 && (
                                <Fragment key="uncategorized">
                                    <tr className="bg-[#0D1117]">
                                        <td colSpan={7} className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-[#3D506A]">
                                            Sin categoría
                                        </td>
                                    </tr>
                                    {uncategorized.map(product => (
                                        <ProductRow
                                            key={product.id}
                                            product={product}
                                            subNames={subcategories.filter(s => (product.subcategoryIds ?? []).includes(s.id)).map(s => s.name)}
                                            onEdit={onEdit}
                                            onDelete={onDelete}
                                            onToggle={onToggle}
                                        />
                                    ))}
                                </Fragment>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

function ProductRow({
    product,
    subNames,
    onEdit,
    onDelete,
    onToggle,
}: {
    product: Product
    subNames: string[]
    onEdit: (p: Product) => void
    onDelete: (p: Product) => void
    onToggle: (p: Product) => void
}) {
    return (
        <tr
            className={cn(
                'border-b border-[#0F1523] transition-colors hover:bg-[#101828]/60',
                !product.isActive && 'opacity-40'
            )}
        >
            <td className="px-4 py-3">
                <div className="flex items-baseline gap-2">
                    <span className="font-medium text-[#E4ECF7]">{product.name}</span>
                    <span className="text-[10px] text-[#3D506A]">{product.unit}</span>
                </div>
                {subNames.length > 0 && (
                    <span className="text-[10px] text-violet-400 mt-0.5 block">{subNames.join(', ')}</span>
                )}
            </td>
            <td className="px-3 py-3">
                <span className="font-mono text-[12px] text-[#7A8FAA]">
                    {product.barcode ?? <span className="text-[#283A56]">—</span>}
                </span>
            </td>
            <td className="px-3 py-3 text-right font-bold text-orange-400 font-mono">
                {formatCurrency(product.price)}
            </td>
            <td className="px-3 py-3 text-right text-[#7A8FAA] font-mono">
                {product.cost ? formatCurrency(product.cost) : <span className="text-[#283A56]">—</span>}
            </td>
            <td className="px-3 py-3 text-center">
                <StockCell product={product} />
            </td>
            <td className="px-3 py-3 text-center">
                <button
                    onClick={() => onToggle(product)}
                    className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer',
                        product.isActive ? 'bg-orange-500' : 'bg-[#1C2438]'
                    )}
                >
                    <span className={cn(
                        'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                        product.isActive ? 'translate-x-4.5' : 'translate-x-0.5'
                    )} />
                </button>
            </td>
            <td className="px-3 py-3">
                <div className="flex items-center gap-1 justify-end">
                    <button
                        onClick={() => onEdit(product)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-[#E4ECF7] hover:bg-[#1C2438] transition-all cursor-pointer"
                    >
                        <Edit3 size={13} />
                    </button>
                    <button
                        onClick={() => onDelete(product)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            </td>
        </tr>
    )
}
