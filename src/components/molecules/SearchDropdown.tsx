import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingCart, Package } from 'lucide-react'
import { cn, formatCurrency, normalizeStr } from '@/lib/utils'
import { useProductImage } from '@/hooks/useProductImage'
import type { Product, CartItem, Category } from '@/types'

interface SearchDropdownProps {
    products: Product[]
    categories?: Category[]
    search: string
    cartItems?: CartItem[]
    allowOutOfStock?: boolean
    onSelect: (product: Product) => void
}

function ProductThumb({ product, inCart }: { product: Product; inCart: boolean }) {
    const imgSrc = useProductImage(product.id, product.imageUrl)
    const [imgError, setImgError] = useState(false)

    useEffect(() => { setImgError(false) }, [imgSrc])

    const hasImage = !!imgSrc && !imgError

    if (hasImage) {
        return (
            <div className={cn(
                'w-8 h-8 rounded-lg shrink-0 overflow-hidden border',
                inCart ? 'border-orange-500/30' : 'border-[#1E2A40]'
            )}>
                <img
                    src={imgSrc!}
                    alt=""
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                />
            </div>
        )
    }

    return (
        <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            inCart ? 'bg-orange-500/15' : 'bg-[#1C2438]'
        )}>
            {inCart
                ? <ShoppingCart size={14} className="text-orange-400" />
                : <Package size={14} className="text-[#3D506A]" />
            }
        </div>
    )
}

export function SearchDropdown({ products, categories = [], search, cartItems = [], allowOutOfStock = false, onSelect }: SearchDropdownProps) {
    if (!search.trim()) return null

    const q = normalizeStr(search.trim())
    const results = products
        .filter(p => {
            if (!p.isActive) return false
            const catName = normalizeStr(categories.find(c => c.id === p.categoryId)?.name ?? '')
            return normalizeStr(p.name).includes(q) ||
                (p.barcode ?? '').includes(search.trim()) ||
                catName.includes(q)
        })
        .slice(0, 8)

    return (
        <AnimatePresence>
            {results.length > 0 && (
                <motion.div
                    key="dropdown"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl overflow-hidden border border-[#1E2A40] shadow-2xl shadow-black/40"
                >
                    <div className="bg-[#0F1523] max-h-[300px] overflow-y-auto">
                        {results.map((product, i) => {
                            const cartQty = cartItems.find(c => c.id === product.id)?.quantity ?? 0
                            const outOfStock = !product.isInfinite && product.stockQty <= 0
                            const blocked = outOfStock && !allowOutOfStock

                            return (
                                <button
                                    key={product.id}
                                    onPointerDown={(e) => e.preventDefault()}
                                    onClick={() => !blocked && onSelect(product)}
                                    disabled={blocked}
                                    className={cn(
                                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                                        'border-b border-[#192030] last:border-0 cursor-pointer',
                                        i === 0 ? 'bg-orange-500/5' : '',
                                        blocked
                                            ? 'opacity-40 cursor-not-allowed'
                                            : 'hover:bg-[#1A2236]'
                                    )}
                                >
                                    <ProductThumb product={product} inCart={cartQty > 0} />

                                    {/* Name + barcode */}
                                    <div className="flex-1 min-w-0">
                                        <HighlightedName name={product.name} query={search} />
                                        {product.barcode && (
                                            <p className="text-[10px] text-[#3D506A] font-mono mt-0.5">{product.barcode}</p>
                                        )}
                                    </div>

                                    {/* Price */}
                                    <span className="text-[13px] font-bold text-orange-400 font-mono shrink-0">
                                        {formatCurrency(product.price)}
                                    </span>

                                    {/* Stock / cart qty */}
                                    <div className="shrink-0 text-right min-w-[40px]">
                                        {cartQty > 0 && (
                                            <span className="text-[11px] font-bold bg-orange-500/15 text-orange-400 px-1.5 py-0.5 rounded-md">
                                                +{cartQty}
                                            </span>
                                        )}
                                        {outOfStock && (
                                            <span className="text-[10px] text-red-400">Agotado</span>
                                        )}
                                        {!cartQty && !outOfStock && product.isInfinite && (
                                            <span className="text-[10px] text-violet-400">∞</span>
                                        )}
                                        {!cartQty && !outOfStock && !product.isInfinite && (
                                            <span className="text-[10px] text-[#3D506A]">{product.stockQty}</span>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

function HighlightedName({ name, query }: { name: string; query: string }) {
    const idx = name.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1 || !query) {
        return <p className="text-[13px] font-medium text-[#CBD5E1] truncate">{name}</p>
    }
    return (
        <p className="text-[13px] font-medium text-[#CBD5E1] truncate">
            {name.slice(0, idx)}
            <span className="text-orange-400 font-bold">{name.slice(idx, idx + query.length)}</span>
            {name.slice(idx + query.length)}
        </p>
    )
}
