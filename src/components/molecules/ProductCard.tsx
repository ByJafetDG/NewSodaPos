import { motion } from 'framer-motion'
import { cn, formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

interface ProductCardProps {
    product: Product
    cartQty: number
    onAdd: () => void
    index: number
}

export function ProductCard({ product, cartQty, onAdd, index }: ProductCardProps) {
    const isOutOfStock = !product.isInfinite && product.stockQty <= 0
    const inCart = cartQty > 0

    return (
        <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02, duration: 0.2 }}
            whileTap={isOutOfStock ? undefined : { scale: 0.96 }}
            onClick={isOutOfStock ? undefined : onAdd}
            disabled={isOutOfStock}
            className={cn(
                'relative flex flex-col p-4 rounded-2xl border text-left transition-all duration-150 select-none',
                'min-h-[108px] cursor-pointer group',
                isOutOfStock
                    ? 'opacity-40 cursor-not-allowed bg-[#101520] border-[#192030]'
                    : inCart
                        ? 'bg-orange-500/8 border-orange-500/30 shadow-md shadow-orange-500/10'
                        : 'bg-[#101520] border-[#192030] hover:bg-[#161D2E] hover:border-[#243050]'
            )}
        >
            {/* Cart count badge */}
            {inCart && (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-orange-500 text-white text-[11px] font-black flex items-center justify-center shadow-lg shadow-orange-500/40 z-10"
                >
                    {cartQty}
                </motion.span>
            )}

            {/* Out of stock */}
            {isOutOfStock && (
                <span className="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-wide bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-md">
                    Agotado
                </span>
            )}

            {/* Product name */}
            <p className={cn(
                'text-[13px] font-semibold leading-snug line-clamp-3 flex-1 pr-1',
                inCart ? 'text-orange-100' : 'text-[#CBD5E1]',
                'group-hover:text-[#E4ECF7]'
            )}>
                {product.name}
            </p>

            {/* Bottom row: price + stock */}
            <div className="flex items-end justify-between mt-3 gap-1">
                <span className={cn(
                    'text-[15px] font-bold font-mono leading-none',
                    inCart ? 'text-orange-400' : 'text-[#94A3B8]'
                )}>
                    {formatCurrency(product.price)}
                </span>

                {product.isInfinite ? (
                    <span className="text-[9px] font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">∞</span>
                ) : product.stockQty > 0 ? (
                    <span className="text-[10px] text-[#3D506A] font-mono">{product.stockQty}</span>
                ) : null}
            </div>
        </motion.button>
    )
}
