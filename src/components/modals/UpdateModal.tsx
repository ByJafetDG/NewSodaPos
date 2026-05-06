import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/atoms/Button'

type UpdateState = 'available' | 'downloading' | 'ready'

export function UpdateModal() {
    const [state, setState] = useState<UpdateState | null>(null)
    const [progress, setProgress] = useState(0)

    useEffect(() => {
        const unsub = window.electronAPI?.onUpdateMessage((msg: string, pct?: number) => {
            if (msg === 'update-available') { setState('available'); setProgress(0) }
            else if (msg === 'downloading') { setState('downloading'); setProgress(Math.round(pct ?? 0)) }
            else if (msg === 'update-downloaded') { setState('ready') }
        })
        return () => unsub?.()
    }, [])

    return (
        <AnimatePresence>
            {state && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="fixed z-[101] inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-sm px-4"
                    >
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="px-6 py-7 flex flex-col items-center gap-5 text-center">

                                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${state === 'ready' ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
                                    {state === 'ready'
                                        ? <Sparkles size={26} className="text-emerald-400" />
                                        : state === 'downloading'
                                            ? <Download size={26} className="text-blue-400" />
                                            : <RefreshCw size={26} className="text-blue-400" />
                                    }
                                </div>

                                <div>
                                    <h2 className="text-[16px] font-semibold text-[#E4ECF7]">
                                        {state === 'ready' ? 'Actualización lista' :
                                            state === 'downloading' ? 'Descargando actualización...' :
                                                'Nueva actualización disponible'}
                                    </h2>
                                    <p className="text-[12px] text-[#3D506A] mt-1">
                                        {state === 'ready' ? 'La actualización se instalará y el app se reiniciará.' :
                                            state === 'downloading' ? `${progress}% completado` :
                                                'Descargando en segundo plano...'}
                                    </p>
                                </div>

                                {state === 'downloading' && (
                                    <div className="w-full h-1.5 bg-[#1E2A40] rounded-full overflow-hidden">
                                        <motion.div
                                            className="h-full bg-blue-500 rounded-full"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                )}

                                {state === 'ready' && (
                                    <Button
                                        variant="primary"
                                        size="lg"
                                        className="w-full"
                                        onClick={() => window.electronAPI?.installUpdate()}
                                    >
                                        Instalar y reiniciar
                                    </Button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
