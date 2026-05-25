import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn, formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

interface ProductCardProps {
    product: Product
    cartQty: number
    onAdd: () => void
    index: number
    forceNoImage?: boolean
}

const ACCENTS = [
    { bg: 'bg-orange-500/20',  text: 'text-orange-300',  grad: 'from-orange-500/25' },
    { bg: 'bg-blue-500/20',    text: 'text-blue-300',    grad: 'from-blue-500/25' },
    { bg: 'bg-violet-500/20',  text: 'text-violet-300',  grad: 'from-violet-500/25' },
    { bg: 'bg-emerald-500/20', text: 'text-emerald-300', grad: 'from-emerald-500/25' },
    { bg: 'bg-pink-500/20',    text: 'text-pink-300',    grad: 'from-pink-500/25' },
    { bg: 'bg-amber-500/20',   text: 'text-amber-300',   grad: 'from-amber-500/25' },
    { bg: 'bg-cyan-500/20',    text: 'text-cyan-300',    grad: 'from-cyan-500/25' },
    { bg: 'bg-indigo-500/20',  text: 'text-indigo-300',  grad: 'from-indigo-500/25' },
]

function accentFor(name: string) {
    return ACCENTS[name.charCodeAt(0) % ACCENTS.length]
}

function StockBadge({ product, onImage = false }: { product: Product; onImage?: boolean }) {
    if (product.isInfinite) {
        return (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-violet-300 bg-violet-500/20 px-2 py-0.5 rounded-full border border-violet-500/20">
                ∞
            </span>
        )
    }
    if (product.stockQty <= 0) return null

    const isLow = product.stockQty <= Math.max(product.minStock ?? 0, 3)
    return (
        <span className={cn(
            'inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border',
            isLow
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/25'
                : onImage
                    ? 'bg-black/40 text-white/55 border-white/10'
                    : 'bg-white/6 text-[#5A7590] border-white/8'
        )}>
            {product.stockQty}
        </span>
    )
}

export function ProductCard({ product, cartQty, onAdd, index, forceNoImage = false }: ProductCardProps) {
    const isOutOfStock = !product.isInfinite && product.stockQty <= 0
    const inCart = cartQty > 0
    const [imgSrc, setImgSrc] = useState<string | null>(product.imageUrl ?? null)
    const [imgError, setImgError] = useState(false)
    const accent = accentFor(product.name)
    const initial = product.name.charAt(0).toUpperCase()

    useEffect(() => {
        setImgSrc(product.imageUrl ?? null)
        setImgError(false)
    }, [product.imageUrl])

    useEffect(() => {
        if (!product.imageUrl || !window.electronAPI) return
        window.electronAPI.getProductLocalImage(product.id)
            .then(local => { if (local) setImgSrc(local) })
            .catch(() => {})
    }, [product.id, product.imageUrl])

    const hasImage = !!imgSrc && !imgError && !forceNoImage

    return (
        <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02, duration: 0.2 }}
            whileTap={isOutOfStock ? undefined : { scale: 0.97 }}
            onClick={isOutOfStock ? undefined : onAdd}
            disabled={isOutOfStock}
            className={cn(
                'relative flex flex-col rounded-2xl border text-left transition-all duration-150 select-none overflow-hidden',
                'h-[160px] cursor-pointer group',
                isOutOfStock
                    ? 'opacity-40 cursor-not-allowed bg-[#0E1420] border-[#192030]'
                    : inCart
                        ? 'border-orange-500/45 shadow-lg shadow-orange-500/15'
                        : 'bg-[#0E1420] border-[#1E2D42] hover:border-[#2A3F5C] hover:bg-[#111927]'
            )}
        >
            {/* Cart count badge */}
            {inCart && (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-orange-500 text-white text-[11px] font-black flex items-center justify-center shadow-lg shadow-orange-500/50 z-20"
                >
                    {cartQty}
                </motion.span>
            )}

            {hasImage ? (
                /* ── IMAGE CARD ── */
                <>
                    <img
                        src={imgSrc!}
                        alt=""
                        onError={() => setImgError(true)}
                        className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                    />

                    {/* Subtle scrim */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />

                    {inCart && <div className="absolute inset-0 bg-orange-500/8 pointer-events-none" />}

                    {isOutOfStock && (
                        <div className="absolute inset-0 bg-black/65 flex items-center justify-center z-10">
                            <span className="text-[10px] font-bold uppercase tracking-widest bg-red-500 text-white px-2.5 py-1 rounded-lg shadow-lg">
                                Agotado
                            </span>
                        </div>
                    )}

                    {/* Text chip at bottom */}
                    <div className="absolute bottom-0 inset-x-0 px-2 pb-2 z-10">
                        <div className={cn(
                            'rounded-xl px-2.5 py-1.5 backdrop-blur-sm border border-white/8',
                            inCart ? 'bg-orange-950/80' : 'bg-black/72'
                        )}>
                            <p className={cn(
                                'text-[12px] font-semibold leading-tight line-clamp-2 mb-1',
                                inCart ? 'text-orange-100' : 'text-white'
                            )}>
                                {product.name}
                            </p>
                            <div className="flex items-center justify-between gap-2">
                                <span className={cn(
                                    'text-[14px] font-bold font-mono leading-none',
                                    inCart ? 'text-orange-300' : 'text-white/90'
                                )}>
                                    {formatCurrency(product.price)}
                                </span>
                                <StockBadge product={product} onImage />
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                /* ── NO-IMAGE CARD ── */
                <>
                    {/* Colored header zone with big letter */}
                    <div className={cn(
                        'relative shrink-0 h-[76px] flex items-center justify-center overflow-hidden',
                        'bg-gradient-to-br from-white/[0.04] to-transparent'
                    )}>
                        {/* Accent color wash */}
                        <div className={cn('absolute inset-0 bg-gradient-to-br to-transparent opacity-30', accent.grad)} />
                        {/* Giant faded letter as texture */}
                        <span className={cn('absolute -bottom-2 -right-1 text-[64px] font-black leading-none opacity-[0.06] select-none pointer-events-none', accent.text)}>
                            {initial}
                        </span>
                        {/* Prominent letter badge */}
                        {!inCart && !isOutOfStock && (
                            <div className={cn(
                                'relative w-12 h-12 rounded-2xl flex items-center justify-center text-[22px] font-black border border-white/8',
                                accent.bg, accent.text
                            )}>
                                {initial}
                            </div>
                        )}
                        {isOutOfStock && (
                            <span className="relative text-[10px] font-bold uppercase tracking-widest bg-red-500/20 text-red-400 px-2.5 py-1 rounded-lg border border-red-500/20">
                                Agotado
                            </span>
                        )}
                        {/* Divider line */}
                        <div className="absolute inset-x-0 bottom-0 h-px bg-white/[0.06]" />
                    </div>

                    {/* Content */}
                    <div className="flex flex-col flex-1 px-3 pt-2.5 pb-2.5 min-h-0 bg-[#080E18]/60">
                        <p className={cn(
                            'text-[13px] font-semibold leading-snug flex-1 line-clamp-2',
                            inCart ? 'text-orange-100' : 'text-[#C8D8E8]',
                            'group-hover:text-[#E4ECF7] transition-colors'
                        )}>
                            {product.name}
                        </p>

                        <div className="flex items-center justify-between gap-2 mt-2">
                            <span className={cn(
                                'text-[15px] font-bold font-mono leading-none',
                                inCart ? 'text-orange-400' : 'text-[#8BA3C0]'
                            )}>
                                {formatCurrency(product.price)}
                            </span>
                            <StockBadge product={product} />
                        </div>
                    </div>
                </>
            )}
        </motion.button>
    )
}
