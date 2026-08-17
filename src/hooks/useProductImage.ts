import { useEffect, useState } from 'react'

/**
 * Resuelve la imagen de un producto priorizando la caché local.
 *
 * En Electron el <img> NUNCA apunta a la URL remota: muchas imágenes son enlaces a CDNs
 * externos (Walmart/VTEX) que hoy responden 404, y cada montaje de tarjeta disparaba una
 * petición fallida — miles de errores en consola y red desperdiciada. El proceso main es
 * el único que descarga: valida el status, guarda el .jpg y recuerda las URLs muertas.
 *
 * En modo web (sin Electron) se usa la URL directa, que ahí es la única opción.
 */

type CacheEntry = string | null

// Caché en memoria por sesión: evita un round-trip IPC por cada re-render de la grilla.
const memoryCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<CacheEntry>>()

function cacheKey(productId: string, imageUrl: string) {
    return `${productId}|${imageUrl}`
}

async function resolveLocalImage(productId: string, imageUrl: string): Promise<CacheEntry> {
    const key = cacheKey(productId, imageUrl)
    if (memoryCache.has(key)) return memoryCache.get(key) ?? null

    const existing = inFlight.get(key)
    if (existing) return existing

    const task = (async (): Promise<CacheEntry> => {
        const api = window.electronAPI!
        try {
            let local = await api.getProductLocalImage(productId)
            if (!local) {
                // Sin caché todavía: pedirle al main que la baje (él decide si la URL está muerta).
                const res = await api.downloadProductImage(productId, imageUrl)
                if (res?.success) local = await api.getProductLocalImage(productId)
            }
            memoryCache.set(key, local ?? null)
            return local ?? null
        } catch {
            memoryCache.set(key, null)
            return null
        } finally {
            inFlight.delete(key)
        }
    })()

    inFlight.set(key, task)
    return task
}

/** Invalida la caché en memoria de un producto (usar tras editar su imagen). */
export function invalidateProductImage(productId: string) {
    for (const key of [...memoryCache.keys()]) {
        if (key.startsWith(`${productId}|`)) memoryCache.delete(key)
    }
}

export function useProductImage(productId: string, imageUrl: string | null | undefined) {
    const [src, setSrc] = useState<string | null>(() => {
        if (!imageUrl) return null
        if (!window.electronAPI) return imageUrl
        return memoryCache.get(cacheKey(productId, imageUrl)) ?? null
    })

    useEffect(() => {
        if (!imageUrl) { setSrc(null); return }
        if (!window.electronAPI) { setSrc(imageUrl); return }

        const cached = memoryCache.get(cacheKey(productId, imageUrl))
        if (cached !== undefined) { setSrc(cached); return }

        let cancelled = false
        setSrc(null)
        resolveLocalImage(productId, imageUrl).then(local => {
            if (!cancelled) setSrc(local)
        })
        return () => { cancelled = true }
    }, [productId, imageUrl])

    return src
}
