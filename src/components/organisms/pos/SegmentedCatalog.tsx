import { AnimatePresence } from 'framer-motion'
import { ProductCard } from '@/components/molecules/ProductCard'
import { EmptyState } from '@/components/atoms/EmptyState'
import { Layers } from 'lucide-react'
import type { Product, Subcategory, CartItem } from '@/types'

interface SegmentedCatalogProps {
    products: Product[]
    subcategories: Subcategory[]   // already filtered: active + matching today
    cartItems: CartItem[]
    onAddProduct: (product: Product) => void
}

export function SegmentedCatalog({ products, subcategories, cartItems, onAddProduct }: SegmentedCatalogProps) {
    const visibleSubcatIds = new Set(subcategories.map(s => s.id))

    const grouped = new Map<string | null, Product[]>()
    subcategories.forEach(s => grouped.set(s.id, []))
    grouped.set(null, [])

    for (const product of products) {
        const ids = product.subcategoryIds ?? []
        const matchedSubs = ids.filter(id => visibleSubcatIds.has(id))
        if (matchedSubs.length > 0) {
            for (const subId of matchedSubs) {
                grouped.get(subId)!.push(product)
            }
        } else {
            grouped.get(null)!.push(product)
        }
    }

    const generalProds = grouped.get(null) ?? []
    const hasAny = subcategories.some(s => (grouped.get(s.id) ?? []).length > 0) || generalProds.length > 0

    if (!hasAny) {
        return (
            <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
                <EmptyState
                    icon={<Layers size={40} />}
                    title="Sin productos hoy"
                    description="No hay productos disponibles para este día"
                    className="h-full"
                />
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {subcategories.map(sub => {
                const prods = grouped.get(sub.id) ?? []
                if (prods.length === 0) return null
                return (
                    <div key={sub.id}>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                            <h3 className="text-[12px] font-semibold text-[#7A8FAA] uppercase tracking-wider">{sub.name}</h3>
                            <div className="flex-1 h-px bg-[#1E2A40]" />
                            <span className="text-[10px] text-[#3D506A]">{prods.length}</span>
                        </div>
                        <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                            <AnimatePresence>
                                {prods.map((product, i) => (
                                    <ProductCard
                                        key={product.id}
                                        product={product}
                                        cartQty={cartItems.find(item => item.id === product.id)?.quantity ?? 0}
                                        onAdd={() => onAddProduct(product)}
                                        index={i}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                )
            })}

            {generalProds.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#3D506A] shrink-0" />
                        <h3 className="text-[12px] font-semibold text-[#3D506A] uppercase tracking-wider">General</h3>
                        <div className="flex-1 h-px bg-[#1E2A40]" />
                        <span className="text-[10px] text-[#3D506A]">{generalProds.length}</span>
                    </div>
                    <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                        <AnimatePresence>
                            {generalProds.map((product, i) => (
                                <ProductCard
                                    key={product.id}
                                    product={product}
                                    cartQty={cartItems.find(item => item.id === product.id)?.quantity ?? 0}
                                    onAdd={() => onAddProduct(product)}
                                    index={i}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            )}
        </div>
    )
}
