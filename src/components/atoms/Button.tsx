import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
    size?: 'sm' | 'md' | 'lg' | 'xl'
    loading?: boolean
    children: ReactNode
}

const variants = {
    primary:   'bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white shadow-lg shadow-orange-500/20 disabled:bg-orange-500/30 disabled:shadow-none',
    secondary: 'bg-[#1C2438] hover:bg-[#243050] border border-[#283A56] text-[#E4ECF7] disabled:opacity-40',
    danger:    'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 disabled:opacity-40',
    ghost:     'hover:bg-white/5 text-[#7A8FAA] hover:text-[#E4ECF7] disabled:opacity-40',
    success:   'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 disabled:bg-emerald-500/30 disabled:shadow-none',
}

const sizes = {
    sm: 'h-8  px-3   text-[12px] gap-1.5 rounded-lg',
    md: 'h-10 px-4   text-[13px] gap-2   rounded-xl',
    lg: 'h-12 px-5   text-[14px] gap-2   rounded-xl',
    xl: 'h-14 px-6   text-[15px] gap-2.5 rounded-2xl font-semibold',
}

export function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
    return (
        <button
            {...props}
            disabled={disabled || loading}
            className={cn(
                'inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer select-none',
                'disabled:cursor-not-allowed',
                variants[variant],
                sizes[size],
                className
            )}
        >
            {loading && <Loader2 size={16} className="animate-spin shrink-0" />}
            {children}
        </button>
    )
}
