import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

/**
 * Actualizaciones desde GitHub Releases.
 *
 * El main es el único que habla con electron-updater: busca, descarga, verifica el
 * sha512 del release y reemplaza el ejecutable. El renderer solo mira un estado plano
 * y pide tres cosas: buscar, descargar, instalar.
 *
 * Dos decisiones que no son las de por defecto:
 *
 * - `autoDownload = false`. Nada se baja sin que alguien lo acepte. Esto es un POS:
 *   una descarga sorpresa a media hora pico le roba ancho de banda al sync de ventas.
 *   Y sin esto el botón "Más tarde" no significaría nada — ya se habría bajado.
 * - `autoInstallOnAppQuit = true`. Una vez descargada, se instala al cerrar la app,
 *   nunca en medio de un turno. Reiniciar en el acto es una opción, no la única salida.
 */

/** Ciclo de vida de una actualización, de punta a punta. */
export type UpdateStatus =
    | 'unsupported'
    | 'idle'
    | 'checking'
    | 'up-to-date'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'error'

/** Por qué falló. El texto que ve el usuario se decide en el renderer. */
export type UpdateErrorKind = 'network' | 'no_releases' | 'unauthorized' | 'unknown'

/**
 * Estado plano a propósito: viaja por IPC en cada evento de progreso (varias veces
 * por segundo). Un objeto anidado no aportaría nada y costaría más serializarlo.
 */
export interface UpdateState {
    status: UpdateStatus
    /** Versión instalada ahora mismo. */
    currentVersion: string
    /** Versión del release pendiente. Null si no hay ninguno. */
    version: string | null
    /** Notas del release, ya aplanadas a texto (ver `plainNotes`). */
    releaseNotes: string | null
    /** ISO date del release, tal como lo publica GitHub. */
    releaseDate: string | null
    sizeBytes: number | null
    /** 0–100. Solo tiene sentido en `downloading`. */
    percent: number
    transferredBytes: number
    totalBytes: number
    bytesPerSecond: number
    errorKind: UpdateErrorKind | null
    /** Epoch ms de la última búsqueda que terminó, bien o mal. */
    lastCheckedAt: number | null
}

/** Espera antes de la primera búsqueda: que la app termine de arrancar primero. */
const FIRST_CHECK_DELAY_MS = 20_000

/** Cada cuánto se busca sola. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000

/** Tope de las notas del release. Lo que no entra, no se muestra. */
const NOTES_MAX_CHARS = 1200

const isDev = !app.isPackaged

/**
 * En desarrollo no hay nada que actualizar: la app corre desde `dist-electron/`, no
 * desde un instalador, y electron-updater tira "dev-app-update.yml not found". La UI
 * lo dice con todas las letras en vez de mostrar un error falso.
 *
 * Para probar el flujo real sin empaquetar: UPDATER_DEV=1 y un `dev-app-update.yml`
 * en la raíz del proyecto.
 */
const updaterEnabled = !isDev || process.env.UPDATER_DEV === '1'

let state: UpdateState = {
    status: updaterEnabled ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
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

/** Evita dos descargas en paralelo si llegan dos clics. */
let downloading = false

function patch(next: Partial<UpdateState>): void {
    state = { ...state, ...next }
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('updates:state', state)
    }
}

/**
 * Aplana las notas a texto plano.
 *
 * De dónde vienen: normalmente de `release-notes.md`, que electron-builder mete dentro
 * de `latest.yml` (ver `releaseInfo.releaseNotesFile` en package.json). Si ese archivo
 * no viajó, electron-updater cae al cuerpo del release en GitHub, que llega en HTML.
 * Por eso se limpian los dos formatos.
 *
 * Y se limpia acá, en el main, no en el renderer: es contenido que viene de la red, y
 * pintarlo con `innerHTML` sería XSS de manual. Del otro lado llega texto y nada más.
 */
function plainNotes(notes: UpdateInfo['releaseNotes']): string | null {
    const raw =
        typeof notes === 'string'
            ? notes
            : Array.isArray(notes)
                ? notes.map(entry => entry.note ?? '').join('\n')
                : ''

    const withoutHtml = raw
        .replace(/<li[^>]*>/gi, '\n• ')      // las listas sin viñeta quedan ilegibles
        .replace(/<\/(p|div|h\d|ul|ol)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")

    // Markdown → texto. El orden importa: las viñetas se convierten antes que las
    // cursivas, si no un `* item` se comería como marca de énfasis.
    const text = withoutHtml
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')          // ## Título
        .replace(/^\s{0,3}[-*+]\s+/gm, '• ')         // - item
        .replace(/^\s{0,3}>\s?/gm, '')               // > cita
        // Sin flag `s` a propósito: si alguien deja un `*` suelto, un comodín que cruce
        // saltos de línea se comería medio changelog.
        .replace(/\*\*([^*]+)\*\*/g, '$1')           // **negrita**
        .replace(/__([^_]+)__/g, '$1')               // __negrita__
        .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/gm, '$1$2')  // *cursiva*
        .replace(/`{1,3}([^`\n]+)`{1,3}/g, '$1')     // `código`
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')   // [texto](url)
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    if (!text) return null
    return text.length > NOTES_MAX_CHARS ? `${text.slice(0, NOTES_MAX_CHARS).trimEnd()}…` : text
}

/**
 * Traduce el fallo a un motivo accionable. Existe porque "no se pudo" no es una
 * respuesta: sin red se revisa el internet, sin releases publicados no hay nada que
 * hacer, y con permisos vencidos hay que avisarle a quien instaló la app.
 *
 * El detalle técnico no sale de acá: va al log, y a la pantalla cruza solo el motivo.
 */
function classifyError(error: unknown): UpdateErrorKind {
    const status = (error as { statusCode?: unknown })?.statusCode
    const message = error instanceof Error ? error.message : String(error)

    // 404 sobre el endpoint de releases = el repo existe pero no publicó ninguna
    // versión todavía. Es el estado normal de un proyecto recién configurado.
    if (status === 404 || /HttpError:\s*404|"status":\s*404|404 Not Found/.test(message)) {
        return 'no_releases'
    }
    if (status === 401 || status === 403 || /HttpError:\s*40[13]/.test(message)) {
        return 'unauthorized'
    }
    if (/net::|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|ECONNREFUSED|getaddrinfo/i.test(message)) {
        return 'network'
    }
    return 'unknown'
}

function bindEvents(): void {
    autoUpdater.on('checking-for-update', () => {
        patch({ status: 'checking', errorKind: null })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
        patch({
            status: 'available',
            version: info.version,
            releaseNotes: plainNotes(info.releaseNotes),
            releaseDate: info.releaseDate ?? null,
            sizeBytes: info.files?.[0]?.size ?? null,
            percent: 0,
            transferredBytes: 0,
            totalBytes: 0,
            bytesPerSecond: 0,
            errorKind: null,
            lastCheckedAt: Date.now(),
        })
    })

    autoUpdater.on('update-not-available', () => {
        patch({
            status: 'up-to-date',
            version: null,
            releaseNotes: null,
            releaseDate: null,
            sizeBytes: null,
            errorKind: null,
            lastCheckedAt: Date.now(),
        })
    })

    autoUpdater.on('download-progress', progress => {
        patch({
            status: 'downloading',
            percent: Math.min(100, Math.max(0, progress.percent)),
            transferredBytes: progress.transferred,
            totalBytes: progress.total,
            bytesPerSecond: progress.bytesPerSecond,
        })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
        downloading = false
        patch({ status: 'ready', version: info.version, percent: 100 })
    })

    autoUpdater.on('error', error => {
        downloading = false
        console.error('[updater]', error)
        patch({ status: 'error', errorKind: classifyError(error), lastCheckedAt: Date.now() })
    })
}

/**
 * Busca actualizaciones. No lanza: el resultado se ve en el estado, que es lo único
 * que mira el renderer.
 */
async function check(force = false): Promise<void> {
    if (!updaterEnabled || downloading) return
    // Descarga en curso o lista para instalar: buscar de nuevo no aporta nada.
    if (state.status === 'downloading' || state.status === 'ready') return
    // Ya hay una actualización pendiente y esta es la búsqueda automática: no se repite.
    // Cada búsqueda pasa por 'checking' y eso le reiniciaría el reloj al recordatorio de
    // la UI, que corre en el mismo intervalo — el aviso no llegaría nunca. El botón
    // "Buscar actualización" de Ajustes pasa `force` y sí vuelve a consultar.
    if (state.status === 'available' && !force) return

    try {
        await autoUpdater.checkForUpdates()
    } catch (error) {
        // El evento 'error' ya publicó el estado; esto solo evita el unhandled rejection.
        console.error('[updater] fallo al buscar:', error)
    }
}

async function download(): Promise<void> {
    if (!updaterEnabled || downloading || state.status !== 'available') return

    downloading = true
    patch({ status: 'downloading', percent: 0, transferredBytes: 0, bytesPerSecond: 0 })

    try {
        await autoUpdater.downloadUpdate()
    } catch (error) {
        downloading = false
        console.error('[updater] fallo al descargar:', error)
    }
}

/**
 * Cierra la app e instala. `isSilent: false` deja ver el instalador NSIS: sin firma de
 * código, una ventana que aparece sola y sin explicación asusta más de lo que ayuda.
 * `isForceRunAfter: true` para que el POS vuelva solo y nadie tenga que buscar el ícono.
 */
function install(): void {
    if (state.status !== 'ready') return
    autoUpdater.quitAndInstall(false, true)
}

/** Cablea el IPC y arranca la búsqueda periódica. Se llama una vez, en `whenReady`. */
export function initUpdater(): void {
    ipcMain.handle('updates:get-state', () => state)
    ipcMain.handle('updates:check', () => check(true))
    ipcMain.handle('updates:download', () => download())
    ipcMain.handle('updates:install', () => install())

    if (!updaterEnabled) {
        console.log('[updater] modo desarrollo: actualizaciones deshabilitadas (UPDATER_DEV=1 para probarlas).')
        return
    }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.forceDevUpdateConfig = isDev

    bindEvents()

    setTimeout(() => void check(), FIRST_CHECK_DELAY_MS)
    setInterval(() => void check(), CHECK_INTERVAL_MS)
}
