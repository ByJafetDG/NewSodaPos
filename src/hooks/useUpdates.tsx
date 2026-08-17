import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { sileo } from 'sileo'
import {
    INITIAL_UPDATE_STATE,
    POSTPONED_UPDATE_KEY,
    REMINDER_INTERVAL_MS,
    formatBytes,
    type UpdateState,
} from '@/types/updates'

/**
 * Estado de las actualizaciones para toda la app. Fuente única: el proceso principal,
 * que es el que realmente busca, descarga e instala.
 *
 * No usa React Query a propósito. Esto no es una consulta que se cachea y revalida: es
 * un estado que el main **empuja** (progreso de descarga varias veces por segundo).
 * Meterlo en la caché sería pelear contra la herramienta.
 */

interface UpdatesContextValue {
    state: UpdateState
    /** Hay una actualización esperando: descargarla o instalarla. */
    hasPending: boolean
    /** El modal está abierto. Solo se abre solo cuando aparece una versión nueva. */
    promptOpen: boolean
    /** El usuario mandó esta versión a "Más tarde". */
    postponed: boolean
    check: () => void
    download: () => void
    install: () => void
    /** Abre el modal a pedido (desde Ajustes o desde el toast recordatorio). */
    openPrompt: () => void
    /** "Más tarde": cierra, recuerda la versión y arranca los recordatorios. */
    postpone: () => void
    /** Cierra el modal sin marcar nada. La descarga sigue en segundo plano. */
    hidePrompt: () => void
}

const UpdatesContext = createContext<UpdatesContextValue | null>(null)

function readPostponedVersion(): string | null {
    try {
        const raw = localStorage.getItem(POSTPONED_UPDATE_KEY)
        if (!raw) return null
        return (JSON.parse(raw) as { version?: string }).version ?? null
    } catch {
        // Sin storage el aviso vuelve a aparecer. No es grave.
        return null
    }
}

function writePostponedVersion(version: string | null) {
    try {
        if (version) localStorage.setItem(POSTPONED_UPDATE_KEY, JSON.stringify({ version, at: Date.now() }))
        else localStorage.removeItem(POSTPONED_UPDATE_KEY)
    } catch { }
}

/**
 * Recordatorio de actualización pendiente.
 *
 * Toast y no modal: el usuario ya dijo "más tarde" una vez. Volver a taparle la
 * pantalla a media venta sería castigarlo por haber elegido. Esto avisa, se puede
 * ignorar, y deja el botón a mano si cambió de opinión.
 */
function reminderToast(state: UpdateState, onUpdate: () => void) {
    const ready = state.status === 'ready'
    const accent = ready ? '#10B981' : '#3B82F6'
    const accentSoft = ready ? 'rgba(16,185,129,' : 'rgba(59,130,246,'

    sileo.action({
        title: ready ? 'Actualización lista para instalar' : 'Actualización pendiente',
        description: (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{
                    background: `linear-gradient(135deg, ${accentSoft}0.14) 0%, ${accentSoft}0.04) 100%)`,
                    border: `1px solid ${accentSoft}0.25)`,
                    borderRadius: 12,
                    padding: '12px 14px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{
                            width: 7, height: 7, borderRadius: '50%', background: accent,
                            boxShadow: `0 0 8px ${accentSoft}0.6)`, display: 'inline-block',
                        }} />
                        <span style={{
                            fontSize: 9, color: accent, fontWeight: 700,
                            letterSpacing: '0.12em', textTransform: 'uppercase',
                        }}>
                            {ready ? 'Descargada' : 'Nueva versión'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6B7280', fontFamily: 'monospace' }}>
                            v{state.currentVersion}
                        </span>
                        <span style={{ fontSize: 12, color: '#374151' }}>→</span>
                        <span style={{
                            fontSize: 18, color: accent, fontWeight: 900,
                            fontFamily: 'monospace', letterSpacing: '-0.02em',
                        }}>
                            v{state.version}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 2 }}>
                    <span style={{ fontSize: 10, color: '#374151' }}>
                        {ready ? 'Se instala al cerrar el POS' : formatBytes(state.sizeBytes)}
                    </span>
                    <span style={{ fontSize: 10, color: '#374151' }}>Te recordamos cada 30 min</span>
                </div>
            </div>
        ),
        position: 'top-right',
        duration: 15000,
        button: { title: ready ? 'Instalar' : 'Ver detalles', onClick: onUpdate },
    })
}

export function UpdatesProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<UpdateState>(INITIAL_UPDATE_STATE)
    const [promptOpen, setPromptOpen] = useState(false)
    const [postponedVersion, setPostponedVersion] = useState<string | null>(() => readPostponedVersion())

    // Qué versión ya se anunció. En una ref y no en estado porque cambiarla no tiene
    // que redibujar nada: solo decide si el modal se abre solo.
    const announcedRef = useRef<string | null>(readPostponedVersion())

    useEffect(() => {
        if (!window.electronAPI) return
        let active = true

        // Suscribirse ANTES de pedir el estado inicial: al revés, un evento que llegue
        // entre la petición y la suscripción se pierde.
        const unsubscribe = window.electronAPI.onUpdateState(next => {
            if (active) setState(next)
        })

        window.electronAPI.getUpdateState()
            .then(initial => { if (active) setState(initial) })
            .catch(() => undefined)

        return () => { active = false; unsubscribe() }
    }, [])

    // El modal aparece una sola vez por versión, cuando el main dice que hay una nueva.
    // Nunca se reabre solo: si el cajero lo cerró, la app no le vuelve a saltar encima a
    // media venta. El recordatorio de abajo se encarga.
    useEffect(() => {
        if (state.status !== 'available' || !state.version) return
        if (announcedRef.current === state.version) return

        announcedRef.current = state.version
        setPromptOpen(true)
    }, [state.status, state.version])

    // Una versión nueva invalida el "más tarde" anterior: si pospusiste la 1.4.0 y sale
    // la 1.5.0, esa sí merece que te avisen.
    useEffect(() => {
        if (!state.version || !postponedVersion) return
        if (state.version !== postponedVersion) {
            setPostponedVersion(null)
            writePostponedVersion(null)
        }
    }, [state.version, postponedVersion])

    // Ya no hay nada pendiente (se instaló o el server dice que estamos al día):
    // se limpia la marca para que la próxima actualización arranque de cero.
    useEffect(() => {
        if (state.status === 'up-to-date' && postponedVersion) {
            setPostponedVersion(null)
            writePostponedVersion(null)
        }
    }, [state.status, postponedVersion])

    const hasPending = state.status === 'available' || state.status === 'ready'
    const postponed = !!postponedVersion && postponedVersion === state.version

    const openPrompt = useCallback(() => setPromptOpen(true), [])

    // El toast necesita el estado del momento en que se dispara, pero el efecto de abajo
    // no puede depender de `state` — cada evento del main le reiniciaría el reloj.
    const stateRef = useRef(state)
    useEffect(() => { stateRef.current = state }, [state])

    const shouldRemind = !promptOpen && (
        (state.status === 'available' && postponed) || state.status === 'ready'
    )

    /**
     * Recordatorio cada 30 minutos mientras quede algo pendiente y el modal esté cerrado.
     *
     * El primer toast sale a los 30 min, no al instante: el usuario acaba de decir "más
     * tarde" y repetírselo de inmediato sería no haberlo escuchado.
     *
     * El vencimiento es una marca de tiempo absoluta y el tick es de un minuto, no un
     * `setInterval` de 30. Así el aviso llega aunque el efecto se vuelva a montar en el
     * medio (React 19 en StrictMode monta dos veces) y no se pierde media hora por un
     * remontaje. La marca solo se reinicia cuando el pendiente desaparece de verdad.
     */
    const nextReminderRef = useRef<number | null>(null)

    useEffect(() => {
        if (!shouldRemind) return
        if (nextReminderRef.current === null) {
            nextReminderRef.current = Date.now() + REMINDER_INTERVAL_MS
        }

        const tick = setInterval(() => {
            const due = nextReminderRef.current
            if (due === null || Date.now() < due) return
            nextReminderRef.current = Date.now() + REMINDER_INTERVAL_MS
            reminderToast(stateRef.current, () => setPromptOpen(true))
        }, 60_000)

        return () => clearInterval(tick)
    }, [shouldRemind])

    // Se resolvió el pendiente: el próximo "más tarde" arranca su media hora de cero.
    useEffect(() => {
        if (!hasPending) nextReminderRef.current = null
    }, [hasPending])

    const check = useCallback(() => { void window.electronAPI?.checkForUpdate() }, [])
    const download = useCallback(() => { void window.electronAPI?.downloadUpdate() }, [])
    const install = useCallback(() => { void window.electronAPI?.installUpdate() }, [])

    const postpone = useCallback(() => {
        setPromptOpen(false)
        if (state.version) {
            setPostponedVersion(state.version)
            writePostponedVersion(state.version)
        }
    }, [state.version])

    const hidePrompt = useCallback(() => setPromptOpen(false), [])

    const value = useMemo<UpdatesContextValue>(() => ({
        state,
        hasPending,
        promptOpen,
        postponed,
        check,
        download,
        install,
        openPrompt,
        postpone,
        hidePrompt,
    }), [state, hasPending, promptOpen, postponed, check, download, install, openPrompt, postpone, hidePrompt])

    return <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>
}

export function useUpdates(): UpdatesContextValue {
    const context = useContext(UpdatesContext)
    if (!context) throw new Error('useUpdates se usó fuera de <UpdatesProvider>')
    return context
}
