import { cn } from '@/lib/utils'

interface BadgeProps {
    children: React.ReactNode
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'
    className?: string
}

const variants = {
    default: 'bg-[#1C2438] text-[#7A8FAA] border-[#283A56]',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger:  'bg-red-500/10 text-red-400 border-red-500/20',
    info:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    accent:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
    return (
        <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border',
            variants[variant],
            className
        )}>
            {children}
        </span>
    )
}
