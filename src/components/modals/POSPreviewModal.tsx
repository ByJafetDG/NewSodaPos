import { useState } from 'react'
import { X, Eye } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { SegmentedCatalog } from '@/components/organisms/pos/SegmentedCatalog'
import { cn, formatCurrency } from '@/lib/utils'
import type { Category, Product, Subcategory } from '@/types'

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const DAY_NAMES  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface POSPreviewModalProps {
    isOpen: boolean
    onClose: () => void
    category: Category | null
    products: Product[]
    subcategories: Subcategory[]
}

export function POSPreviewModal({ isOpen, onClose, category, products, subcategories }: POSPreviewModalProps) {
    const [day, setDay] = useState<number>(new Date().getDay())

    if (!category) return null

    const visibleSubcats = subcategories
        .filter(s =>
            s.categoryId === category.id &&
            s.isActive &&
            (!s.showDays || s.showDays.includes(day))
        )
        .sort((a, b) => a.sortOrder - b.sortOrder)

    const visibleSubcatIdSet = new Set(visibleSubcats.map(s => s.id))

    const catProducts = products.filter(p => {
        if (p.categoryId !== category.id || !p.isActive || p.isDeleted) return false
        const ids = p.subcategoryIds ?? []
        if (ids.length === 0) return true
        return ids.some(id => visibleSubcatIdSet.has(id))
    })

    const hasSegments = visibleSubcats.length > 0

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, scale: 0.97, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 12 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="fixed z-50 inset-4 md:inset-8 lg:inset-12 rounded-2xl bg-[#0B0E19] border border-[#1E2A40] shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#192030] shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                                    <Eye size={14} className="text-violet-400" />
                                </div>
                                <div>
                                    <p className="text-[14px] font-semibold text-[#E4ECF7]">Vista previa POS</p>
                                    <p className="text-[11px] text-[#3D506A]">{category.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Day selector */}
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-[#192030] shrink-0">
                            <span className="text-[11px] text-[#3D506A] font-semibold uppercase tracking-wider mr-1">Día:</span>
                            {DAY_LABELS.map((label, i) => (
                                <button
                                    key={i}
                                    onClick={() => setDay(i)}
                                    className={cn(
                                        'w-8 h-8 rounded-lg text-[12px] font-semibold transition-all cursor-pointer',
                                        day === i
                                            ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                                            : 'bg-[#101520] text-[#3D506A] hover:text-[#7A8FAA] border border-[#1E2A40]'
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                            <span className="ml-1 text-[12px] text-[#7A8FAA]">{DAY_NAMES[day]}</span>
                            {hasSegments
                                ? <span className="ml-auto text-[11px] text-violet-400">{visibleSubcats.length} subcategoría{visibleSubcats.length !== 1 ? 's' : ''} visible{visibleSubcats.length !== 1 ? 's' : ''}</span>
                                : <span className="ml-auto text-[11px] text-[#3D506A]">Sin subcategorías este día</span>
                            }
                        </div>

                        {/* Catalog preview */}
                        <div className="flex-1 min-h-0 flex flex-col">
                            {hasSegments ? (
                                <SegmentedCatalog
                                    products={catProducts}
                                    subcategories={visibleSubcats}
                                    cartItems={[]}
                                    onAddProduct={() => {}}
                                />
                            ) : (
                                <div className="flex-1 overflow-y-auto p-4">
                                    <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
                                        {catProducts.map((product, i) => (
                                            <PreviewCard key={product.id} product={product} index={i} />
                                        ))}
                                    </div>
                                    {catProducts.length === 0 && (
                                        <div className="flex items-center justify-center h-40 text-[#3D506A] text-[13px]">
                                            Sin productos activos en esta categoría
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

function PreviewCard({ product, index }: { product: Product; index: number }) {
    const isOutOfStock = !product.isInfinite && product.stockQty <= 0
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02, duration: 0.2 }}
            className={cn(
                'flex flex-col p-4 rounded-2xl border min-h-[108px]',
                isOutOfStock
                    ? 'opacity-40 bg-[#101520] border-[#192030]'
                    : 'bg-[#101520] border-[#192030]'
            )}
        >
            <p className="text-[13px] font-semibold leading-snug line-clamp-3 flex-1 text-[#CBD5E1]">{product.name}</p>
            <div className="flex items-end justify-between mt-3 gap-1">
                <span className="text-[15px] font-bold font-mono text-[#94A3B8]">{formatCurrency(product.price)}</span>
                {product.isInfinite
                    ? <span className="text-[9px] font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">∞</span>
                    : product.stockQty > 0
                        ? <span className="text-[10px] text-[#3D506A] font-mono">{product.stockQty}</span>
                        : <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Agotado</span>
                }
            </div>
        </motion.div>
    )
}
