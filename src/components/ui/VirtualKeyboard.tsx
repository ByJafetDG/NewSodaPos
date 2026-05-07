import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Delete, CornerDownLeft, X, ChevronUp } from 'lucide-react'
import { useKeyboardStore } from '@/store/keyboardStore'
import { cn } from '@/lib/utils'

const ALPHA_ROWS = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l','ñ'],
    ['z','x','c','v','b','n','m'],
] as const

const NUMERIC_ROWS = [
    ['7','8','9'],
    ['4','5','6'],
    ['1','2','3'],
    ['.','0','BACKSPACE'],
] as const

function Key({ label, onPress, className, accent }: {
    label: React.ReactNode
    onPress: () => void
    className?: string
    accent?: boolean
}) {
    return (
        <button
            onPointerDown={(e) => e.preventDefault()}
            onClick={onPress}
            className={cn(
                'flex items-center justify-center rounded-lg select-none cursor-pointer',
                'h-10 min-w-0 flex-1 text-[14px] font-medium',
                'transition-all duration-75 active:scale-95 border',
                accent
                    ? 'bg-[#1A2236] border-[#1E2A40] text-[#94A3B8] hover:bg-[#243050] hover:text-[#E4ECF7]'
                    : 'bg-[#141B2D] border-[#1A2540] text-[#CBD5E1] hover:bg-[#1A2236]',
                className
            )}
        >
            {label}
        </button>
    )
}

export function VirtualKeyboard() {
    const { isOpen, mode, value, cursorPos, pressKey, close, setCursor } = useKeyboardStore()
    const [caps, setCaps] = useState(false)

    const press = (key: string) => {
        if (mode === 'alpha' && key.length === 1) {
            pressKey(caps ? key.toUpperCase() : key)
            if (caps && /[a-zñ]/.test(key)) setCaps(false)
        } else {
            pressKey(key)
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                /*
                 * Outer wrapper: fills the content area (excluding sidebar + safe zones).
                 * Inner: max-width centered panel so keyboard isn't too wide.
                 */
                <motion.div
                    key="vkb"
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 40, opacity: 0 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 360 }}
                    className="fixed z-[100] flex justify-center items-end"
                    style={{
                        /* left edge = sidebar(228) + sidebar-padding(18) + content-gap(12) */
                        left: 258,
                        right: 18,
                        bottom: 18,
                    }}
                >
                    <div className={cn(
                        'w-full rounded-2xl overflow-hidden border border-[#1E2A40] shadow-2xl shadow-black/60',
                        'bg-[#090C14]/97 backdrop-blur-xl',
                        mode === 'numeric' ? 'max-w-[300px]' : 'max-w-[720px]'
                    )}>
                        <div className="p-3 space-y-1.5">

                            {/* ── Header ───────────────────────────────────── */}
                            <div className="flex items-center gap-2 mb-0.5">
                                <div
                                    className="flex-1 h-8 px-3 rounded-lg bg-[#101520] border border-[#1A2236] flex items-center overflow-x-auto cursor-text"
                                    style={{ scrollbarWidth: 'none' }}
                                    onPointerDown={(e) => { e.preventDefault(); setCursor(value.length) }}
                                >
                                    {value.length === 0 ? (
                                        <div className="flex items-center gap-0.5">
                                            <span className="w-0.5 h-3.5 bg-orange-400 animate-pulse inline-block shrink-0" />
                                            <span className="text-[13px] text-[#3D506A] font-mono">Escribe algo...</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center font-mono text-[13px] text-[#E4ECF7]">
                                            {Array.from(value).map((char, i) => (
                                                <span
                                                    key={i}
                                                    className="flex items-center"
                                                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setCursor(i) }}
                                                >
                                                    {i === cursorPos && (
                                                        <span className="w-0.5 h-3.5 bg-orange-400 animate-pulse inline-block mx-px shrink-0" />
                                                    )}
                                                    <span className="select-none">{char === ' ' ? ' ' : char}</span>
                                                </span>
                                            ))}
                                            {cursorPos === value.length && (
                                                <span className="w-0.5 h-3.5 bg-orange-400 animate-pulse inline-block mx-px shrink-0" />
                                            )}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onPointerDown={(e) => e.preventDefault()}
                                    onClick={close}
                                    className="w-8 h-8 rounded-lg bg-[#1A2236] border border-[#1E2A40] text-[#3D506A] hover:text-[#E4ECF7] hover:bg-[#243050] flex items-center justify-center transition-all cursor-pointer"
                                >
                                    <X size={13} />
                                </button>
                            </div>

                            {/* ── ALPHA ────────────────────────────────────── */}
                            {mode === 'alpha' && (
                                <>
                                    {ALPHA_ROWS.map((row, ri) => (
                                        <div key={ri} className="flex gap-1">
                                            {row.map(key => (
                                                <Key key={key} label={caps ? key.toUpperCase() : key} onPress={() => press(key)} />
                                            ))}
                                            {ri === 3 && (
                                                <Key
                                                    label={<Delete size={14} />}
                                                    onPress={() => press('BACKSPACE')}
                                                    accent
                                                    className="flex-[1.5]"
                                                />
                                            )}
                                        </div>
                                    ))}

                                    {/* Bottom row */}
                                    <div className="flex gap-1 pt-0.5">
                                        <button
                                            onPointerDown={(e) => e.preventDefault()}
                                            onClick={() => setCaps(c => !c)}
                                            className={cn(
                                                'flex-1 h-9 rounded-lg flex items-center justify-center gap-1',
                                                'text-[12px] font-semibold border transition-all cursor-pointer active:scale-95',
                                                caps
                                                    ? 'bg-orange-500/15 border-orange-500/25 text-orange-400'
                                                    : 'bg-[#1A2236] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#243050]'
                                            )}
                                        >
                                            <ChevronUp size={13} />
                                            May
                                        </button>
                                        <Key label="Espacio" onPress={() => press('SPACE')} className="flex-[3]" />
                                        <Key label="." onPress={() => press('.')} accent />
                                        <Key label="@" onPress={() => press('@')} accent />
                                        <Key label="Limpiar" onPress={() => press('CLEAR')} accent />
                                        <Key label={<CornerDownLeft size={14} />} onPress={() => press('ENTER')} accent />
                                    </div>
                                </>
                            )}

                            {/* ── NUMERIC ──────────────────────────────────── */}
                            {mode === 'numeric' && (
                                <>
                                    {NUMERIC_ROWS.map((row, ri) => (
                                        <div key={ri} className="flex gap-1">
                                            {row.map(key => (
                                                <Key
                                                    key={key}
                                                    label={key === 'BACKSPACE' ? <Delete size={14} /> : key}
                                                    onPress={() => press(key)}
                                                    accent={key === 'BACKSPACE'}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                    <div className="flex gap-1">
                                        <Key label="Limpiar" onPress={() => press('CLEAR')} accent />
                                        <Key label={<CornerDownLeft size={14} />} onPress={() => press('ENTER')} accent />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
