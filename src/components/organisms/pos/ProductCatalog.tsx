import { Search } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { CategoryFilterBar } from '@/components/molecules/CategoryFilterBar'
import { ProductCard } from '@/components/molecules/ProductCard'
import { EmptyState } from '@/components/atoms/EmptyState'
import type { Product, Category, CartItem } from '@/types'

interface ProductCatalogProps {
    products: Product[]
    categories: Category[]
    cartItems: CartItem[]
    selectedCategory: string | null
    onSelectCategory: (id: string | null) => void
    onAddProduct: (product: Product) => void
    hideCategoryBar?: boolean
}

export function ProductCatalog({
    products, categories, cartItems, selectedCategory, onSelectCategory, onAddProduct, hideCategoryBar
}: ProductCatalogProps) {
    const filtered = products.filter(p =>
        p.isActive && (!selectedCategory || p.categoryId === selectedCategory)
    )

    return (
        <div className="flex flex-col h-full min-h-0">
            {!hideCategoryBar && (
                <CategoryFilterBar
                    categories={categories}
                    products={products.filter(p => p.isActive)}
                    selected={selectedCategory}
                    onSelect={onSelectCategory}
                />
            )}

            <div className="flex-1 overflow-y-auto p-4">
                {filtered.length === 0 ? (
                    <EmptyState
                        icon={<Search size={40} />}
                        title="Sin productos"
                        description="No hay productos en esta categoría"
                        className="h-full"
                    />
                ) : (
                    <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                        <AnimatePresence>
                            {filtered.map((product, i) => {
                                const cartQty = cartItems.find(item => item.id === product.id)?.quantity ?? 0
                                return (
                                    <ProductCard
                                        key={product.id}
                                        product={product}
                                        cartQty={cartQty}
                                        onAdd={() => onAddProduct(product)}
                                        index={i}
                                    />
                                )
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    )
}
