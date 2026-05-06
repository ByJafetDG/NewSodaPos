import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
    size?: number
    className?: string
    label?: string
}

export function Spinner({ size = 32, className, label }: SpinnerProps) {
    return (
        <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
            <Loader2 size={size} className="animate-spin text-orange-400" />
            {label && <p className="text-[13px] text-[#7A8FAA]">{label}</p>}
        </div>
    )
}
