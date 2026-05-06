import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
    icon: ReactNode
    title: string
    description?: string
    className?: string
}

export function EmptyState({ icon, title, description, className }: EmptyStateProps) {
    return (
        <div className={cn('flex flex-col items-center justify-center gap-3 p-8 text-center', className)}>
            <div className="text-[#3D506A] opacity-60">{icon}</div>
            <div>
                <p className="text-[14px] font-medium text-[#7A8FAA]">{title}</p>
                {description && <p className="text-[12px] text-[#3D506A] mt-1">{description}</p>}
            </div>
        </div>
    )
}
