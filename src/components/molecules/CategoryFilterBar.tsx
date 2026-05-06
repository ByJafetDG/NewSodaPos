import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category, Product } from '@/types'

interface CategoryFilterBarProps {
    categories: Category[]
    products: Product[]
    selected: string | null
    onSelect: (id: string | null) => void
    compact?: boolean
}

export function CategoryFilterBar({ categories, products, selected, onSelect, compact }: CategoryFilterBarProps) {
    return (
        <div className={cn(
            'flex items-center gap-2 overflow-x-auto scrollbar-none',
            compact ? 'px-3 py-2' : 'px-4 py-2.5 border-b border-[#192030]'
        )}>
            <Pill
                label="Todos"
                count={products.length}
                icon={<LayoutGrid size={13} />}
                active={selected === null}
                onClick={() => onSelect(null)}
            />
            {categories.map(cat => (
                <Pill
                    key={cat.id}
                    label={cat.name}
                    count={products.filter(p => p.categoryId === cat.id).length}
                    active={selected === cat.id}
                    onClick={() => onSelect(cat.id)}
                />
            ))}
        </div>
    )
}

function Pill({ label, count, icon, active, onClick }: {
    label: string; count: number; icon?: React.ReactNode; active: boolean; onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer border select-none shrink-0',
                active
                    ? 'bg-orange-500/10 border-orange-500/25 text-orange-400'
                    : 'bg-transparent border-transparent text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#101520]'
            )}
        >
            {icon}
            {label}
            <span className={cn('text-[11px]', active ? 'text-orange-400/60' : 'text-[#3D506A]')}>
                {count}
            </span>
        </button>
    )
}
