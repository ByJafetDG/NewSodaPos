import { Barcode, LayoutGrid, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryFilterBar } from './CategoryFilterBar'
import type { Category, Product } from '@/types'

export type ViewMode = 'scan' | 'grid'

interface ViewModeBarProps {
    mode: ViewMode
    onModeChange: (m: ViewMode) => void
    // grid-only
    categories: Category[]
    products: Product[]
    selectedCategory: string | null
    onSelectCategory: (id: string | null) => void
    // cuentas
    heldOrdersCount: number
    onOpenHeldOrders: () => void
    activeOrderName: string | null
}

export function ViewModeBar({
    mode, onModeChange,
    categories, products, selectedCategory, onSelectCategory,
    heldOrdersCount, onOpenHeldOrders, activeOrderName,
}: ViewModeBarProps) {
    return (
        <div className="flex items-center gap-0 border-b border-[#192030] shrink-0 bg-[#0B0E19]/60">
            {/* Mode toggle — always visible */}
            <div className="flex items-center gap-1 px-3 py-2 shrink-0">
                <ModeBtn
                    active={mode === 'scan'}
                    icon={<Barcode size={14} />}
                    label="Escaneo"
                    onClick={() => onModeChange('scan')}
                />
                <ModeBtn
                    active={mode === 'grid'}
                    icon={<LayoutGrid size={14} />}
                    label="Grilla"
                    onClick={() => onModeChange('grid')}
                />
            </div>

            {/* Divider — only when grid */}
            {mode === 'grid' && (
                <div className="w-px h-5 bg-[#192030] shrink-0" />
            )}

            {/* Category pills — only in grid mode */}
            {mode === 'grid' && (
                <div className="flex-1 overflow-hidden min-w-0">
                    <CategoryFilterBar
                        categories={categories}
                        products={products}
                        selected={selectedCategory}
                        onSelect={onSelectCategory}
                        compact
                    />
                </div>
            )}

            {/* Spacer — scan mode only */}
            {mode === 'scan' && <div className="flex-1" />}

            {/* Cuentas button — always visible */}
            <div className="px-2 py-2 shrink-0">
                <button
                    onClick={onOpenHeldOrders}
                    className={cn(
                        'flex flex-col items-start px-3 py-1.5 rounded-lg',
                        'transition-all duration-150 cursor-pointer border select-none',
                        activeOrderName
                            ? 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15'
                            : heldOrdersCount > 0
                                ? 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15'
                                : 'bg-transparent border-transparent hover:text-[#7A8FAA] hover:bg-[#101520]'
                    )}
                >
                    <div className={cn(
                        'flex items-center gap-1.5 text-[12px] font-semibold',
                        (activeOrderName || heldOrdersCount > 0) ? 'text-amber-400' : 'text-[#3D506A]'
                    )}>
                        <ClipboardList size={14} />
                        Cuentas
                        {heldOrdersCount > 0 && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-bold">
                                {heldOrdersCount}
                            </span>
                        )}
                    </div>
                    {activeOrderName && (
                        <span className="text-[10px] text-amber-400/70 leading-tight mt-0.5 max-w-[100px] truncate">
                            ● {activeOrderName}
                        </span>
                    )}
                </button>
            </div>
        </div>
    )
}

function ModeBtn({ active, icon, label, onClick }: {
    active: boolean; icon: React.ReactNode; label: string; onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold',
                'transition-all duration-150 cursor-pointer border select-none',
                active
                    ? 'bg-orange-500/10 border-orange-500/25 text-orange-400'
                    : 'bg-transparent border-transparent text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#101520]'
            )}
        >
            {icon}
            {label}
        </button>
    )
}
