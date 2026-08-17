/**
 * Contrato del updater entre el proceso principal y la UI.
 *
 * Espejo de `electron/updater.ts`. Vive acá y no allá porque el renderer no puede
 * importar del main: los dos bundles se compilan por separado.
 */

export type UpdateStatus =
    | 'unsupported'
    | 'idle'
    | 'checking'
    | 'up-to-date'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'error'

export type UpdateErrorKind = 'network' | 'no_releases' | 'unauthorized' | 'unknown'

export interface UpdateState {
    status: UpdateStatus
    currentVersion: string
    version: string | null
    releaseNotes: string | null
    releaseDate: string | null
    sizeBytes: number | null
    percent: number
    transferredBytes: number
    totalBytes: number
    bytesPerSecond: number
    errorKind: UpdateErrorKind | null
    lastCheckedAt: number | null
}

export const INITIAL_UPDATE_STATE: UpdateState = {
    status: 'idle',
    currentVersion: '',
    version: null,
    releaseNotes: null,
    releaseDate: null,
    sizeBytes: null,
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    errorKind: null,
    lastCheckedAt: null,
}

/**
 * Qué se le dice al usuario según por qué falló. El detalle técnico se queda en el log
 * del main: acá solo importa qué puede hacer él.
 */
export const UPDATE_ERROR_MESSAGES: Record<UpdateErrorKind, string> = {
    network: 'Sin conexión. Revisá el internet del local y probá de nuevo.',
    // No es una falla: es que todavía no se publicó ninguna versión.
    no_releases: 'Todavía no hay ninguna versión publicada para actualizar.',
    unauthorized: 'Esta instalación ya no puede consultar las actualizaciones. Avisale a quien instaló la app.',
    unknown: 'No se pudo completar la actualización. Probá de nuevo más tarde.',
}

/** Motivos que no son un problema y no se pintan de rojo. */
export const NEUTRAL_ERROR_KINDS: readonly UpdateErrorKind[] = ['no_releases']

/**
 * Versión que el usuario mandó a "Más tarde", en localStorage.
 *
 * Persistente y no en memoria: recargar la ventana no debería volver a saltarle el
 * modal encima. No es dato sensible, es un número de versión.
 */
export const POSTPONED_UPDATE_KEY = 'pos.updates.postponed'

/** Cada cuánto se le recuerda al usuario que dejó una actualización pendiente. */
export const REMINDER_INTERVAL_MS = 30 * 60 * 1000

export function formatBytes(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return '—'
    const mb = bytes / (1024 * 1024)
    if (mb < 1) return `${Math.round(bytes / 1024)} KB`
    return `${mb.toFixed(1)} MB`
}

export function formatSpeed(bytesPerSecond: number): string {
    if (!bytesPerSecond || bytesPerSecond <= 0) return ''
    const mb = bytesPerSecond / (1024 * 1024)
    if (mb < 1) return `${Math.round(bytesPerSecond / 1024)} KB/s`
    return `${mb.toFixed(1)} MB/s`
}

export function formatReleaseDate(iso: string | null): string | null {
    if (!iso) return null
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long' }).format(date)
}
