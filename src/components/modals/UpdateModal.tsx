import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, CloudDownload, PackageCheck, RefreshCw, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/atoms/Button'
import { useUpdates } from '@/hooks/useUpdates'
import {
    NEUTRAL_ERROR_KINDS,
    UPDATE_ERROR_MESSAGES,
    formatBytes,
    formatReleaseDate,
    formatSpeed,
    type UpdateState,
} from '@/types/updates'

/**
 * Aviso de versión nueva. Aparece una sola vez por versión y **nunca obliga**: "Más
 * tarde" es una salida de primera clase, no letra chica. Si se pospone, la actualización
 * sigue viva y un toast lo recuerda cada media hora.
 *
 * El modal sigue el estado: aceptar no lo cierra, lo convierte en la vista de progreso y
 * después en "listo para instalar". Cerrarlo a mitad de la descarga no la cancela.
 */

const HEADS: Partial<Record<UpdateState['status'], {
    icon: LucideIcon
    title: string
    text: string
    color: string
    bg: string
}>> = {
    available: {
        icon: RefreshCw,
        title: 'Nueva actualización disponible',
        text: 'Podés instalarla ahora o dejarla para después. El POS sigue funcionando igual.',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
    },
    downloading: {
        icon: CloudDownload,
        title: 'Descargando actualización',
        text: 'Podés seguir vendiendo mientras tanto.',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
    },
    ready: {
        icon: PackageCheck,
        title: 'Actualización lista',
        text: 'Se instala sola al cerrar el POS. Si preferís, se puede reiniciar ahora — tarda unos segundos.',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
    },
    error: {
        icon: TriangleAlert,
        title: 'No se pudo actualizar',
        text: '',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
    },
}

/**
 * Qué trae la actualización: de qué versión a cuál, cuánto pesa y qué cambia.
 *
 * Las notas llegan ya en texto plano desde el proceso principal — nunca `innerHTML` con
 * contenido que viene de GitHub.
 */
function UpdateSummary({ state }: { state: UpdateState }) {
    const published = formatReleaseDate(state.releaseDate)

    return (
        <div className="w-full flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2.5">
                <span className="px-2.5 py-1 rounded-lg bg-[#101520] border border-[#1E2A40] text-[12px] font-mono text-[#7A8FAA]">
                    v{state.currentVersion}
                </span>
                <ArrowRight size={14} className="text-[#3D506A]" />
                <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/25 text-[12px] font-mono font-bold text-blue-400">
                    v{state.version}
                </span>
            </div>

            <p className="text-[11px] text-[#3D506A] text-center">
                {formatBytes(state.sizeBytes)}
                {published ? ` · publicada el ${published}` : ''}
            </p>

            {state.releaseNotes && (
                <div className="w-full rounded-xl bg-[#101520] border border-[#1E2A40] p-3.5 text-left">
                    <span className="block text-[9px] uppercase tracking-[0.12em] text-[#3D506A] font-bold mb-2">
                        Qué cambia
                    </span>
                    <p className="text-[12px] leading-relaxed text-[#7A8FAA] whitespace-pre-line max-h-[168px] overflow-y-auto">
                        {state.releaseNotes}
                    </p>
                </div>
            )}
        </div>
    )
}

function UpdateProgress({ state }: { state: UpdateState }) {
    const percent = Math.round(state.percent)
    const speed = formatSpeed(state.bytesPerSecond)

    return (
        <div className="w-full flex flex-col gap-2">
            <div className="w-full h-1.5 bg-[#1E2A40] rounded-full overflow-hidden">
                <motion.div
                    className="h-full bg-blue-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.3 }}
                />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#3D506A] font-mono">
                <span>{percent}%</span>
                <span>
                    {formatBytes(state.transferredBytes)} / {formatBytes(state.totalBytes)}
                    {speed ? ` · ${speed}` : ''}
                </span>
            </div>
        </div>
    )
}

export function UpdateModal() {
    const { state, promptOpen, postpone, hidePrompt, download, install, check } = useUpdates()

    const head = HEADS[state.status]
    const open = promptOpen && !!head

    // Escape o clic en el fondo. Con una versión disponible cuenta como "Más tarde";
    // durante la descarga solo esconde el modal, la descarga sigue.
    const dismiss = () => {
        if (state.status === 'available') postpone()
        else hidePrompt()
    }

    const isError = state.status === 'error'
    const neutralError = isError && !!state.errorKind && NEUTRAL_ERROR_KINDS.includes(state.errorKind)
    const description = isError
        ? UPDATE_ERROR_MESSAGES[state.errorKind ?? 'unknown']
        : head?.text

    return (
        <AnimatePresence>
            {open && head && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        onClick={dismiss}
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="fixed z-[101] inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-md px-4"
                    >
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="px-6 py-7 flex flex-col items-center gap-5 text-center">

                                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${neutralError ? 'bg-[#101520]' : head.bg}`}>
                                    <head.icon size={26} className={neutralError ? 'text-[#7A8FAA]' : head.color} />
                                </div>

                                <div>
                                    <h2 className="text-[16px] font-semibold text-[#E4ECF7]">{head.title}</h2>
                                    {description && (
                                        <p className="text-[12px] text-[#3D506A] mt-1.5 leading-relaxed">{description}</p>
                                    )}
                                </div>

                                {state.status === 'available' && <UpdateSummary state={state} />}
                                {state.status === 'downloading' && <UpdateProgress state={state} />}
                                {state.status === 'ready' && (
                                    <p className="text-[12px] text-[#7A8FAA]">
                                        Versión <span className="font-mono font-bold text-emerald-400">v{state.version}</span> descargada y verificada.
                                    </p>
                                )}

                                <div className="w-full flex items-center gap-2.5">
                                    {state.status === 'available' && (
                                        <>
                                            <Button variant="ghost" size="lg" className="flex-1" onClick={postpone}>
                                                Más tarde
                                            </Button>
                                            <Button variant="primary" size="lg" className="flex-1" onClick={download}>
                                                Actualizar ahora
                                            </Button>
                                        </>
                                    )}

                                    {state.status === 'downloading' && (
                                        <Button variant="ghost" size="lg" className="w-full" onClick={hidePrompt}>
                                            Seguir trabajando
                                        </Button>
                                    )}

                                    {state.status === 'ready' && (
                                        <>
                                            <Button variant="ghost" size="lg" className="flex-1" onClick={hidePrompt}>
                                                Instalar al cerrar
                                            </Button>
                                            <Button variant="primary" size="lg" className="flex-1" onClick={install}>
                                                Reiniciar e instalar
                                            </Button>
                                        </>
                                    )}

                                    {isError && (
                                        <>
                                            <Button variant="ghost" size="lg" className="flex-1" onClick={hidePrompt}>
                                                Cerrar
                                            </Button>
                                            {!neutralError && (
                                                <Button variant="primary" size="lg" className="flex-1" onClick={check}>
                                                    Reintentar
                                                </Button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
