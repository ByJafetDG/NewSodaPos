import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const ITEM_H = 40
const PICKER_H = 200

export const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
export const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

function WheelColumn({ items, selectedIndex, onSelect, bg }: {
    items: string[]
    selectedIndex: number
    onSelect: (i: number) => void
    bg: string
}) {
    const ref = useRef<HTMLDivElement>(null)
    const userScrolling = useRef(false)
    const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    useEffect(() => {
        if (!ref.current || userScrolling.current) return
        ref.current.scrollTop = selectedIndex * ITEM_H
    }, [selectedIndex])

    const handleScroll = () => {
        if (!ref.current) return
        userScrolling.current = true
        clearTimeout(snapTimer.current)
        snapTimer.current = setTimeout(() => {
            if (!ref.current) return
            const idx = Math.round(ref.current.scrollTop / ITEM_H)
            const clamped = Math.max(0, Math.min(items.length - 1, idx))
            userScrolling.current = false
            if (clamped !== selectedIndex) onSelect(clamped)
        }, 120)
    }

    return (
        <div className="relative flex-1 select-none" style={{ height: PICKER_H }}>
            {/* Selection band */}
            <div
                className="absolute inset-x-0 rounded-lg bg-white/[0.05] pointer-events-none z-10"
                style={{ top: ITEM_H * 2, height: ITEM_H }}
            />
            {/* Top fade */}
            <div
                className="absolute inset-x-0 top-0 pointer-events-none z-10"
                style={{ height: ITEM_H * 2, background: `linear-gradient(to bottom, ${bg} 20%, transparent)` }}
            />
            {/* Bottom fade */}
            <div
                className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
                style={{ height: ITEM_H * 2, background: `linear-gradient(to top, ${bg} 20%, transparent)` }}
            />
            <div
                ref={ref}
                onScroll={handleScroll}
                className="h-full overflow-y-auto snap-y snap-mandatory"
                style={{ scrollbarWidth: 'none' }}
            >
                <div style={{ height: ITEM_H * 2 }} />
                {items.map((item, i) => (
                    <div
                        key={i}
                        style={{ height: ITEM_H }}
                        className={cn(
                            'flex items-center justify-center snap-center cursor-pointer transition-all duration-100',
                            i === selectedIndex
                                ? 'text-[#E4ECF7] text-[22px] font-bold'
                                : Math.abs(i - selectedIndex) === 1
                                    ? 'text-[#4A6080] text-[17px] font-medium'
                                    : 'text-[#2A3A50] text-[14px]'
                        )}
                        onClick={() => {
                            onSelect(i)
                            ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
                        }}
                    >
                        {item}
                    </div>
                ))}
                <div style={{ height: ITEM_H * 2 }} />
            </div>
        </div>
    )
}

interface TimeWheelPickerProps {
    hour: number
    minuteIndex: number
    onHourChange: (h: number) => void
    onMinuteChange: (mi: number) => void
    bg?: string
}

export function TimeWheelPicker({ hour, minuteIndex, onHourChange, onMinuteChange, bg = '#0F1623' }: TimeWheelPickerProps) {
    return (
        <div className="flex items-center gap-2" style={{ height: PICKER_H }}>
            <WheelColumn items={HOURS} selectedIndex={hour} onSelect={onHourChange} bg={bg} />
            <span className="text-[#3D506A] text-[20px] font-bold shrink-0 pb-0.5">:</span>
            <WheelColumn items={MINUTES} selectedIndex={minuteIndex} onSelect={onMinuteChange} bg={bg} />
        </div>
    )
}
