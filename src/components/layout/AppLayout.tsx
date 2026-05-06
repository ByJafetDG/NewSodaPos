import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { VirtualKeyboard } from '@/components/ui/VirtualKeyboard'
import { useKeyboardStore } from '@/store/keyboardStore'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'

interface AppLayoutProps {
    children: ReactNode
}

// Keyboard height + bottom safe-edge — matches VirtualKeyboard's bottom offset
const KB_HEIGHT = 220

export function AppLayout({ children }: AppLayoutProps) {
    const kbOpen = useKeyboardStore(s => s.isOpen)
    useRealtimeSync()

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[#07090F]">
            {/* Sidebar — full height, flush with safe-edge inset */}
            <div className="h-full" style={{ padding: '18px 0 18px 18px' }}>
                <div className="h-full rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 1px #192030' }}>
                    <Sidebar />
                </div>
            </div>

            {/* Main content area */}
            <div
                className="flex-1 min-w-0 overflow-hidden transition-[padding] duration-300"
                style={{
                    padding: `18px 18px ${kbOpen ? KB_HEIGHT + 18 : 18}px 12px`,
                }}
            >
                <div className="h-full w-full rounded-2xl overflow-hidden bg-[#0D1117] border border-[#192030]">
                    {children}
                </div>
            </div>

            {/* Global virtual keyboard — floats above everything */}
            <VirtualKeyboard />
        </div>
    )
}
