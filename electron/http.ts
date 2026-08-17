import * as https from 'https';
import * as http from 'http';

export class HttpDownloadError extends Error {
    /** true cuando el recurso no existe / no volverá a existir (4xx, redirect roto, tipo inválido) */
    readonly permanent: boolean;
    readonly statusCode?: number;

    constructor(message: string, permanent: boolean, statusCode?: number) {
        super(message);
        this.name = 'HttpDownloadError';
        this.permanent = permanent;
        this.statusCode = statusCode;
    }
}

interface DownloadOptions {
    /** Milisegundos antes de abortar la petición. Default 15s. */
    timeoutMs?: number;
    /** Redirecciones a seguir antes de rendirse. Default 5. */
    maxRedirects?: number;
    /** Exigir que el Content-Type sea image/*. Default false. */
    requireImage?: boolean;
    /** Tamaño mínimo aceptable en bytes — evita guardar cuerpos de error. Default 0. */
    minBytes?: number;
    /** Tamaño máximo aceptable en bytes. Default 8 MB. */
    maxBytes?: number;
}

/**
 * Descarga un recurso validando el resultado.
 *
 * A diferencia de un `client.get()` pelado, esto:
 *  - verifica `statusCode` (antes se guardaba el cuerpo de un 404 como si fuera la imagen)
 *  - sigue redirecciones
 *  - aborta por timeout en vez de colgarse
 *  - distingue errores permanentes (4xx) de temporales (red, 5xx) para poder cachear el fallo
 */
export function downloadBuffer(url: string, options: DownloadOptions = {}): Promise<Buffer> {
    const {
        timeoutMs = 15000,
        maxRedirects = 5,
        requireImage = false,
        minBytes = 0,
        maxBytes = 8 * 1024 * 1024,
    } = options;

    return new Promise<Buffer>((resolve, reject) => {
        const visit = (target: string, redirectsLeft: number) => {
            let client: typeof https | typeof http;
            try {
                const parsed = new URL(target);
                if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                    reject(new HttpDownloadError(`Protocolo no soportado: ${parsed.protocol}`, true));
                    return;
                }
                client = parsed.protocol === 'https:' ? https : http;
            } catch {
                reject(new HttpDownloadError(`URL inválida: ${target}`, true));
                return;
            }

            const req = client.get(target, { timeout: timeoutMs }, res => {
                const status = res.statusCode ?? 0;

                // Redirecciones
                if (status >= 300 && status < 400 && res.headers.location) {
                    res.resume(); // liberar el socket
                    if (redirectsLeft <= 0) {
                        reject(new HttpDownloadError('Demasiadas redirecciones', true, status));
                        return;
                    }
                    let next: string;
                    try {
                        next = new URL(res.headers.location, target).toString();
                    } catch {
                        reject(new HttpDownloadError('Redirección inválida', true, status));
                        return;
                    }
                    visit(next, redirectsLeft - 1);
                    return;
                }

                if (status < 200 || status >= 300) {
                    res.resume();
                    // 4xx = el recurso no está y no va a volver; 5xx/otros = puede ser temporal
                    reject(new HttpDownloadError(`HTTP ${status}`, status >= 400 && status < 500, status));
                    return;
                }

                const contentType = String(res.headers['content-type'] ?? '');
                if (requireImage && contentType && !contentType.startsWith('image/')) {
                    res.resume();
                    reject(new HttpDownloadError(`Content-Type no es imagen: ${contentType}`, true, status));
                    return;
                }

                const chunks: Buffer[] = [];
                let total = 0;
                res.on('data', (chunk: Buffer) => {
                    total += chunk.length;
                    if (total > maxBytes) {
                        req.destroy();
                        reject(new HttpDownloadError(`Respuesta demasiado grande (> ${maxBytes} bytes)`, true, status));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on('error', err => reject(err));
                res.on('end', () => {
                    const buf = Buffer.concat(chunks as unknown as Uint8Array[]);
                    if (buf.length < minBytes) {
                        reject(new HttpDownloadError(`Respuesta demasiado pequeña (${buf.length} bytes)`, true, status));
                        return;
                    }
                    resolve(buf);
                });
            });

            req.on('timeout', () => {
                req.destroy(new HttpDownloadError(`Timeout tras ${timeoutMs}ms`, false));
            });
            req.on('error', err => {
                reject(err instanceof HttpDownloadError ? err : new HttpDownloadError(err.message, false));
            });
        };

        visit(url, maxRedirects);
    });
}
