import { Search, UserCircle2, ChevronDown } from 'lucide-react'
import { SearchDropdown } from '@/components/molecules/SearchDropdown'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { cn } from '@/lib/utils'
import type { ViewMode } from '@/components/molecules/ViewModeBar'
import type { Product, Employee, CartItem } from '@/types'
import type { Category } from '@/types'

interface Props {
    viewMode: ViewMode
    searchKb: ReturnType<typeof useKeyboardInput>
    onSubmit: (e?: React.FormEvent) => void
    products: Product[]
    categories: Category[]
    cartItems: CartItem[]
    onSelectProduct: (p: Product) => void
    selectedEmployee: Employee | null
    onOpenCashierModal: () => void
}

export function POSTopBar({ viewMode, searchKb, onSubmit, products, categories, cartItems, onSelectProduct, selectedEmployee, onOpenCashierModal }: Props) {
    return (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#192030] shrink-0">
            <form onSubmit={onSubmit} className="flex-1 relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none z-10" />
                <input
                    type="text"
                    {...searchKb}
                    placeholder={viewMode === 'scan'
                        ? 'Escanea código de barras o busca por nombre...'
                        : 'Filtrar productos en la grilla...'
                    }
                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                />
                {viewMode === 'scan' && (
                    <SearchDropdown
                        products={products}
                        categories={categories}
                        search={searchKb.value}
                        cartItems={cartItems}
                        onSelect={onSelectProduct}
                    />
                )}
            </form>

            <button
                onClick={onOpenCashierModal}
                className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer shrink-0',
                    selectedEmployee
                        ? 'bg-orange-500/8 border-orange-500/20 text-orange-400 hover:bg-orange-500/12'
                        : 'bg-[#101520] border-[#1E2A40] text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#161D2E]'
                )}
            >
                <UserCircle2 size={16} />
                <div className="text-left hidden sm:block">
                    <p className="text-[9px] uppercase tracking-widest opacity-60 leading-none">Cajero</p>
                    <p className="text-[12px] font-semibold leading-tight mt-0.5 max-w-[90px] truncate">
                        {selectedEmployee?.name ?? 'Sin cajero'}
                    </p>
                </div>
                <ChevronDown size={11} className="opacity-40" />
            </button>
        </div>
    )
}
