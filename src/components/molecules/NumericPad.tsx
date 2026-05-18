import { Delete } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

function playClick(pitch = 1.0) {
    try {
        const ctx = new AudioContext()
        const now = ctx.currentTime

        const noise = (start: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number) => {
            const len = Math.floor(ctx.sampleRate * dur)
            const buf = ctx.createBuffer(1, len, ctx.sampleRate)
            const ch = buf.getChannelData(0)
            for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1
            const src = ctx.createBufferSource()
            src.buffer = buf
            const filt = ctx.createBiquadFilter()
            filt.type = type; filt.frequency.value = freq; filt.Q.value = q
            const gain = ctx.createGain()
            gain.gain.setValueAtTime(vol, start)
            gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
            src.connect(filt); filt.connect(gain); gain.connect(ctx.destination)
            src.start(start); src.stop(start + dur)
        }

        // Snap — initial high-freq contact
        noise(now,         0.007, 'highpass',  2200 * pitch, 0.4, 0.55)
        // Thunk — low body impact
        noise(now,         0.038, 'lowpass',    260 * pitch, 0.8, 0.40)
        // Clack — mid key bottoming out (8ms after contact)
        noise(now + 0.008, 0.014, 'bandpass',   750 * pitch, 1.0, 0.22)

        setTimeout(() => ctx.close(), 150)
    } catch { }
}

interface NumericPadProps {
    value: string
    onChange: (val: string) => void
    total?: number
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'DEL', 'C'] as const

export function NumericPad({ value, onChange, total }: NumericPadProps) {
    const handleKey = (key: string) => {
        if (key === 'C') { playClick(0.55); onChange(''); return }
        if (key === 'DEL') { playClick(0.72); onChange(value.slice(0, -1)); return }
        playClick()
        onChange(value + key)
    }

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
                {KEYS.map(key => (
                    <button
                        key={key}
                        onClick={() => handleKey(key)}
                        className={cn(
                            'h-12 flex items-center justify-center rounded-xl font-bold text-[16px]',
                            'transition-all active:scale-95 border cursor-pointer select-none',
                            key === 'C'
                                ? 'bg-amber-500/8 text-amber-400 border-amber-500/15 hover:bg-amber-500/15'
                                : key === 'DEL'
                                    ? 'bg-red-500/8 text-red-400 border-red-500/15 hover:bg-red-500/15'
                                    : 'bg-[#101520] text-[#E4ECF7] border-[#192030] hover:bg-[#1C2438] hover:border-[#283A56]'
                        )}
                    >
                        {key === 'DEL' ? <Delete size={18} /> : key}
                    </button>
                ))}
            </div>

            {total !== undefined && (
                <button
                    onClick={() => { playClick(); onChange(total.toString()) }}
                    className="w-full h-10 rounded-xl bg-orange-500/8 text-orange-400 border border-orange-500/15 text-[12px] font-bold uppercase tracking-widest hover:bg-orange-500/15 transition-all active:scale-95 cursor-pointer"
                >
                    Monto exacto — {formatCurrency(total)}
                </button>
            )}
        </div>
    )
}
