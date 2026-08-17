import { BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from '../src/lib/supabase'; // We'll need to make sure this is compatible with Node.js
import db, { query, execute, get, transaction } from './db';
import { downloadBuffer, HttpDownloadError } from './http';
import type {
    DbEmployeeRow, DbCategoryRow, DbCompanyRow, DbClientRow, DbProductRow,
    DbProductSubcategoryRow, DbSinpeMessageRow, DbCashRegisterRow, DbSaleRow,
    DbSaleItemRow, DbExpenseRow, DbInventoryMovementRow, DbPaymentRow,
    DbEmailQueueRow, DbSubcategoryRow, DbBusinessConfigRow, DbTombolaEntryRow, DbSorteoRow,
} from '../src/types/db';

let windowRef: BrowserWindow | null = null;
let isPushing = false;
let isPulling = false;
let pushQueued = false;
let pullQueued = false;
let pushDebounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Reintentar una URL de imagen fallida solo después de este lapso (7 días). */
const IMAGE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

function productImagesDir(): string {
    const dir = path.join(app.getPath('userData'), 'product-images');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Marca una URL como muerta para no volver a pedirla en cada pull.
 * El marcador guarda la URL: si el usuario cambia la imagen del producto, se reintenta enseguida.
 */
function markImageFailed(productId: string, url: string) {
    try {
        fs.writeFileSync(
            path.join(productImagesDir(), `${productId}.fail`),
            JSON.stringify({ url, at: Date.now() })
        );
    } catch { }
}

function shouldSkipImage(productId: string, url: string): boolean {
    try {
        const marker = path.join(productImagesDir(), `${productId}.fail`);
        if (!fs.existsSync(marker)) return false;
        const info = JSON.parse(fs.readFileSync(marker, 'utf8')) as { url?: string; at?: number };
        if (info.url !== url) return false;               // cambió la imagen → reintentar
        return Date.now() - (info.at ?? 0) < IMAGE_RETRY_MS;
    } catch {
        return false;
    }
}

/**
 * Limpieza única del caché de imágenes.
 *
 * La versión anterior guardaba el cuerpo de las respuestas 404 como `${id}.jpg`; como el
 * archivo existía, nunca se reintentaba y la miniatura quedaba rota para siempre. Esto
 * borra los archivos que no son imágenes reales para que se vuelvan a descargar.
 */
function cleanupCorruptImageCache() {
    try {
        const done = get(`SELECT value FROM LocalConfig WHERE key = 'imageCacheCleanedAt'`) as { value?: string } | undefined;
        if (done?.value) return;

        const dir = productImagesDir();
        let removed = 0;
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.jpg')) continue;
            const full = path.join(dir, file);
            try {
                const head = Buffer.alloc(12);
                const fd = fs.openSync(full, 'r');
                const bytesRead = fs.readSync(fd, head as unknown as Uint8Array, 0, 12, 0);
                fs.closeSync(fd);

                const isJpeg = head[0] === 0xFF && head[1] === 0xD8;
                const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47;
                const isGif = head.subarray(0, 3).toString('ascii') === 'GIF';
                const isWebp = head.subarray(0, 4).toString('ascii') === 'RIFF';

                if (bytesRead < 12 || (!isJpeg && !isPng && !isGif && !isWebp)) {
                    fs.unlinkSync(full);
                    removed++;
                }
            } catch { }
        }
        execute(
            `INSERT INTO LocalConfig (key, value) VALUES ('imageCacheCleanedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [new Date().toISOString()]
        );
        if (removed > 0) console.log(`[SyncEngine] Caché de imágenes: ${removed} archivo(s) inválido(s) eliminados.`);
    } catch (err: any) {
        console.error('[SyncEngine] cleanupCorruptImageCache:', err?.message ?? err);
    }
}

export async function cacheProductImage(productId: string, url: string): Promise<void> {
    const dir = productImagesDir();
    try {
        // requireImage + minBytes evitan guardar el cuerpo de un 404 como si fuera la foto
        const buf = await downloadBuffer(url, { requireImage: true, minBytes: 256 });
        fs.writeFileSync(path.join(dir, `${productId}.jpg`), buf as unknown as Uint8Array);
        try { fs.unlinkSync(path.join(dir, `${productId}.fail`)); } catch { }
    } catch (err: any) {
        if (err instanceof HttpDownloadError && err.permanent) markImageFailed(productId, url);
        throw err;
    }
}

/**
 * Agenda un push tras una ráfaga de escrituras.
 *
 * OJO: antes esta función ponía `isPushing = true` y después llamaba a `pushSync()`,
 * que arranca con `if (isPushing) return []` — o sea, el push por evento nunca corría
 * y todo cambio esperaba al intervalo de 15 min. Ahora `pushSync()` maneja su propia
 * bandera y encola si está ocupado.
 */
export function triggerPush() {
    if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
    pushDebounceTimer = setTimeout(() => {
        pushSync().catch(err => logError(`triggerPush: ${err?.message ?? err}`));
    }, 800);
}

// Supabase devuelve timestamps con espacio ('2026-05-19 15:40:xx'), SQLite los compara como strings.
// Los filtros de fecha usan formato ISO con T ('2026-05-19T...'), lo que causa falsos negativos
// cuando se compara mismo día (espacio < T en ASCII). Normalizar al guardar.
const d = (v: string | null | undefined): string | null => v ? v.replace(' ', 'T') : null
// paidAt comes from Supabase without Z — add Z so toCR() applies the CR offset correctly
const dZ = (v: string | null | undefined): string | null => {
    if (!v) return null
    let s = v.replace(' ', 'T')
    if (!s.endsWith('Z') && !s.includes('+') && !/-\d{2}:\d{2}$/.test(s)) s += 'Z'
    return s
}

function notifyUI(table: string) {
    if (windowRef && !windowRef.isDestroyed()) {
        windowRef.webContents.send('db-changed', { table });
    }
}

function logError(msg: string) {
    console.error(`[SyncEngine] ${msg}`);
    if (windowRef && !windowRef.isDestroyed()) {
        windowRef.webContents.send('sync-log', { level: 'error', msg });
    }
}

function persistSyncError(tableName: string, recordId: string, errorMsg: string) {
    try {
        const id = `${tableName}:${recordId}`
        execute(`
            INSERT INTO SyncError (id, tableName, recordId, errorMsg, attempts, createdAt, lastAttemptAt)
            VALUES (?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
            ON CONFLICT(id) DO UPDATE SET
                errorMsg = excluded.errorMsg,
                attempts = SyncError.attempts + 1,
                lastAttemptAt = datetime('now', 'localtime')
        `, [id, tableName, recordId, errorMsg])
    } catch {}
}

function clearResolvedSyncErrors() {
    const syncedTables = ['CashRegister','Employee','Client','Category','Subcategory','Product','Sale','Expense','InventoryMovement','Payment','SinpeMessage','Company','Return']
    for (const t of syncedTables) {
        try {
            execute(`DELETE FROM SyncError WHERE tableName = ? AND recordId IN (SELECT id FROM ${t} WHERE syncStatus = 'SYNCED')`, [t])
        } catch {}
    }
}

/**
 * Marca una fila como SYNCED **solo si sigue idéntica** al snapshot que se subió.
 *
 * El push lee las filas PENDING al inicio y luego hace decenas de round-trips de red.
 * Si el usuario edita una fila durante esa ventana, marcarla SYNCED a ciegas descarta
 * su edición: el push ya subió el valor viejo y el siguiente pull sobrescribe el nuevo.
 * Con el guard, la fila se queda PENDING y se reintenta en el próximo ciclo.
 *
 * @param guard columnas del snapshot que deben coincidir (usa IS para tolerar NULL)
 * @returns true si se marcó SYNCED, false si la fila cambió y sigue PENDING
 */
function markSynced(table: string, id: string, guard: Record<string, unknown> = {}): boolean {
    const keys = Object.keys(guard);
    const conditions = keys.map(k => `"${k}" IS ?`).join(' AND ');
    const sql = `UPDATE "${table}" SET syncStatus = 'SYNCED' WHERE id = ?${conditions ? ` AND ${conditions}` : ''}`;
    try {
        const res = execute(sql, [id, ...keys.map(k => guard[k] ?? null)]) as { changes?: number };
        const ok = (res?.changes ?? 0) > 0;
        if (!ok) {
            console.log(`[SyncEngine] ${table} ${id} cambió durante el push — se mantiene PENDING para reintento.`);
        }
        return ok;
    } catch (err: any) {
        logError(`markSynced ${table} ${id}: ${err?.message ?? err}`);
        return false;
    }
}

/** Tamaño de página del pull. PostgREST corta en 1000 filas por defecto. */
const PAGE_SIZE = 1000;

/**
 * Trae una tabla completa de Supabase paginando.
 *
 * `select('*')` sin rango devuelve como máximo 1000 filas y no avisa: al pasar ese
 * número los registros extra dejaban de sincronizar en silencio.
 */
async function fetchAllRows<T = any>(table: string, orderBy = 'id', columns = '*'): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
            .from(table)
            .select(columns)
            .order(orderBy, { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...(data as T[]));
        if (data.length < PAGE_SIZE) break;
    }
    return rows;
}

/**
 * Corre una transacción con las FK desactivadas.
 *
 * El pull inserta filas remotas en un orden que no respeta las FK locales, pero antes
 * el PRAGMA se apagaba al inicio del pull y se restauraba al final: durante todos esos
 * `await` de red, las escrituras del cajero también corrían sin FK. Ahora la ventana
 * es solo la transacción, sin `await` en medio.
 */
function transactionNoFk(fn: () => void) {
    execute('PRAGMA foreign_keys = OFF');
    try {
        transaction(fn);
    } finally {
        execute('PRAGMA foreign_keys = ON');
    }
}

/** ¿La fila local tiene cambios sin subir? Si sí, lo remoto no la puede pisar. */
function isPendingLocally(table: string, id: string | null | undefined): boolean {
    if (!id) return false;
    try {
        const row = get(`SELECT syncStatus FROM "${table}" WHERE id = ?`, [id]) as { syncStatus?: string } | undefined;
        return row?.syncStatus === 'PENDING';
    } catch {
        return false;
    }
}

/**
 * Aplica un cambio recibido por Realtime: transacción con FK apagadas, error contenido
 * y aviso a la UI solo si la escritura funcionó. Antes un fallo de FK reventaba el
 * callback del canal sin dejar rastro.
 */
function applyRemote(table: string, fn: () => void) {
    try {
        transactionNoFk(fn);
        notifyUI(table);
    } catch (err: any) {
        logError(`Realtime ${table}: ${err?.message ?? err}`);
    }
}

/**
 * Sync Engine - Handles background synchronization between SQLite and Supabase
 */
export async function startSyncEngine(mainWindow?: BrowserWindow, readOnly = false) {
    if (mainWindow) windowRef = mainWindow;
    console.log(`[SyncEngine] Starting... ${readOnly ? '(READ-ONLY — push disabled in dev mode)' : ''}`);

    cleanupCorruptImageCache();

    // En modo dev/read-only NO se tocan los syncStatus.
    // Antes se reseteaba todo PENDING → SYNCED para que el pull sobrescribiera; eso
    // borraba cambios locales reales sin aviso (la BD de dev es una copia de producción).
    // Ahora solo se avisa cuántos quedan pendientes y sin subir.
    if (readOnly) {
        const masterTables = ['Product', 'Category', 'Client', 'Employee', 'Subcategory', 'CashRegister', 'Sale', 'Expense', 'InventoryMovement', 'Payment'];
        let pending = 0;
        for (const t of masterTables) {
            try {
                const row = get(`SELECT COUNT(*) as count FROM ${t} WHERE syncStatus = 'PENDING'`, []) as { count?: number } | undefined;
                pending += row?.count ?? 0;
            } catch { }
        }
        console.log(`[SyncEngine] Dev mode: push deshabilitado. ${pending} registro(s) local(es) quedan PENDING y se conservan.`);
    }

    // Resolve saleNumber conflicts: reassign pending local sales that collide with Supabase.
    // Only reassign truly NEW sales (UUID not in Supabase yet) — skip in-place updates
    // (updateSaleInPlace) which intentionally keep the same saleNumber.
    try {
        const { data: remoteTop } = await supabase
            .from('Sale')
            .select('saleNumber')
            .order('saleNumber', { ascending: false })
            .limit(1)
            .maybeSingle()

        const maxRemote: number = remoteTop?.saleNumber ?? 0;
        const pendingSales = query(
            "SELECT id, saleNumber FROM Sale WHERE syncStatus = 'PENDING' ORDER BY saleNumber ASC"
        ) as { id: string; saleNumber: number }[];

        // Batch-check which pending sales already exist in Supabase (= in-place updates, not new sales)
        let existingRemoteIds = new Set<string>()
        if (pendingSales.length > 0) {
            try {
                const { data: remoteExisting } = await supabase
                    .from('Sale')
                    .select('id')
                    .in('id', pendingSales.map(s => s.id))
                if (remoteExisting) {
                    existingRemoteIds = new Set(remoteExisting.map((s: { id: string }) => s.id))
                }
            } catch {}
        }

        let nextNum = maxRemote;
        let reassigned = 0;
        for (const sale of pendingSales) {
            if (sale.saleNumber <= maxRemote && !existingRemoteIds.has(sale.id)) {
                nextNum += 1;
                execute(
                    "UPDATE Sale SET saleNumber = ?, updatedAt = ? WHERE id = ?",
                    [nextNum, new Date().toISOString(), sale.id]
                );
                reassigned++;
            }
        }
        if (reassigned > 0) {
            console.log(`[SyncEngine] Reassigned ${reassigned} new pending sales (saleNumber ≤ ${maxRemote}) starting from ${maxRemote + 1}.`);
        }
    } catch (err) {
        console.error('[SyncEngine] saleNumber conflict resolution failed:', err);
    }

    // Run pull sync (Supabase -> SQLite) in the background so it doesn't block startup
    pullSync().then(() => {
        // Start Realtime subscriptions after initial pull
        setupRealtimeSubscriptions();
    }).catch(err => {
        console.error('[SyncEngine] Initial pull failed:', err);
    });

    // Setup intervals for periodic sync
    if (!readOnly) {
        setInterval(pushSync, 15 * 60 * 1000);  // Push every 15min safety net (event-driven via triggerPush)
    }
    setInterval(pullSync, readOnly ? 3000 : 15 * 60 * 1000); // Dev: 3s | Prod: 15min fallback
    setInterval(processEmailQueue, 60000); // Retry emails every 1m

    // Auto-end sorteos when endAt is reached
    setInterval(() => {
        try {
            const now = new Date().toISOString()
            const expired = query(
                `SELECT id FROM Sorteo WHERE status = 'ACTIVE' AND endAt IS NOT NULL AND endAt < ?`,
                [now]
            ) as { id: string }[]
            if (expired.length > 0) {
                for (const s of expired) {
                    execute(`UPDATE Sorteo SET status = 'ENDED', updatedAt = ? WHERE id = ?`, [now, s.id])
                }
                notifyUI('Sorteo')
                console.log(`[SyncEngine] Auto-ended ${expired.length} sorteo(s) past endAt.`)
            }
        } catch {}
    }, 30000)

    // Poll Supabase every 30s as fallback for missed SinpeMessage realtime events
    let lastSinpeCheck = new Date().toISOString()
    setInterval(async () => {
        try {
            const { data } = await supabase
                .from('SinpeMessage')
                .select('*')
                .gt('receivedAt', lastSinpeCheck)
                .order('receivedAt', { ascending: true })
                .limit(20)
            if (!data || data.length === 0) return
            lastSinpeCheck = data[data.length - 1].receivedAt
            transaction(() => {
                for (const msg of data) {
                    execute(
                        `INSERT INTO SinpeMessage (id, sender, body, receivedAt, isRead, deletedAt, syncStatus) VALUES (?, ?, ?, ?, 0, ?, 'SYNCED') ON CONFLICT(id) DO NOTHING`,
                        [msg.id, msg.sender, msg.body, msg.receivedAt, msg.deletedAt ?? null]
                    )
                }
            })
            if (windowRef && !windowRef.isDestroyed()) {
                for (const msg of data) {
                    windowRef.webContents.send('sinpe:new-message', {
                        id: msg.id, sender: msg.sender, body: msg.body, receivedAt: msg.receivedAt, isRead: 0
                    })
                }
                windowRef.webContents.send('db-changed', { table: 'SinpeMessage' })
            }
        } catch {}
    }, 30000)
}

/**
 * EMAIL QUEUE: Retries sending failed email receipts
 */
async function processEmailQueue() {
    try {
        const pendingEmails = query(`SELECT * FROM EmailQueue WHERE status = 'PENDING' AND attempts < 5`) as DbEmailQueueRow[];
        if (pendingEmails.length === 0) return;

        console.log(`[SyncEngine] Retrying ${pendingEmails.length} queued emails...`);
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) return;

        for (const email of pendingEmails) {
            try {
                const res = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: 'Soda Tio Pelon <recibos@jafetduarte.dev>',
                        to: email.recipient.split(', '),
                        subject: email.subject,
                        html: email.body
                    }),
                });

                if (res.ok) {
                    execute(`UPDATE EmailQueue SET status = 'SENT' WHERE id = ?`, [email.id]);
                    console.log(`[SyncEngine] Email ${email.id} sent successfully on retry.`);
                } else {
                    const err = await res.json();
                    execute(`UPDATE EmailQueue SET attempts = attempts + 1, lastError = ? WHERE id = ?`,
                        [JSON.stringify(err), email.id]);
                }
            } catch (err: any) {
                execute(`UPDATE EmailQueue SET attempts = attempts + 1, lastError = ? WHERE id = ?`,
                    [err.message, email.id]);
            }
        }
    } catch (err) {
        console.error('[SyncEngine] Email queue processing failed:', err);
    }
}

/**
 * PULL SYNC: Supabase -> SQLite
 * Downloads master data (Products, Categories, Clients)
 */
async function pullSync(): Promise<void> {
    if (isPulling) return;
    if (isPushing) {
        pullQueued = true;
        return;
    }
    isPulling = true;
    try {
        await _pullSync();
    } finally {
        isPulling = false;
        if (pullQueued) {
            pullQueued = false;
            setTimeout(() => { pullSync().catch(err => logError(`pull encolado: ${err?.message ?? err}`)); }, 1000);
        }
    }
}

async function _pullSync() {
    console.log('[SyncEngine] Pulling updates from Supabase...');
    let lastPullAt: string | null = null;
    try {
        const row = get('SELECT value FROM LocalConfig WHERE key = ?', ['lastPullAt']) as { value: string } | undefined;
        lastPullAt = row?.value ?? null;
    } catch {}
    const pullStartedAt = new Date().toISOString();
    console.log(`[SyncEngine] Pull mode: ${lastPullAt ? `incremental (since ${lastPullAt})` : 'initial full pull'}`);

    // InventoryMovement y Payment no tienen updatedAt en Supabase: su cursor es `date`, que es
    // la fecha del hecho, no la de subida. Una terminal que estuvo sin internet sube filas con
    // fecha vieja y quedaban por debajo del cursor de las demás — nunca las veían. Con una
    // ventana de gracia de 7 días esas filas sí entran (son pocas filas por ciclo).
    const dateCursorLookback = lastPullAt
        ? new Date(Date.parse(lastPullAt) - 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;
    try {
        // 1. Sync Categories
        const categories = await fetchAllRows('Category');

        if (categories) {
            transactionNoFk(() => {
                for (const cat of categories) {
                    // Guard PENDING: sin él, una categoría editada localmente y todavía sin
                    // subir se perdía en el siguiente pull.
                    execute(`
            INSERT INTO Category (id, name, type, icon, sortOrder, isActive, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name =       CASE WHEN Category.syncStatus = 'PENDING' THEN Category.name      ELSE excluded.name      END,
              type =       CASE WHEN Category.syncStatus = 'PENDING' THEN Category.type      ELSE excluded.type      END,
              icon =       CASE WHEN Category.syncStatus = 'PENDING' THEN Category.icon      ELSE excluded.icon      END,
              sortOrder =  CASE WHEN Category.syncStatus = 'PENDING' THEN Category.sortOrder ELSE excluded.sortOrder END,
              isActive =   CASE WHEN Category.syncStatus = 'PENDING' THEN Category.isActive  ELSE excluded.isActive  END,
              syncStatus = CASE WHEN Category.syncStatus = 'PENDING' THEN 'PENDING'          ELSE 'SYNCED'           END,
              updatedAt =  CASE WHEN Category.syncStatus = 'PENDING' THEN Category.updatedAt ELSE excluded.updatedAt END
          `, [cat.id, cat.name, cat.type, cat.icon, cat.sortOrder, cat.isActive ? 1 : 0, dZ(cat.updatedAt)]);
                }
            });
        }

        // 2. Sync Products
        const products = await fetchAllRows('Product');

        if (products) {
            transactionNoFk(() => {
                for (const prod of products) {
                    execute(`
            INSERT INTO Product (id, name, barcode, categoryId, subcategoryId, price, cost, unit, stockQty, minStock, isActive, isInfinite, isDeleted, imageUrl, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name =          CASE WHEN Product.syncStatus = 'PENDING' THEN Product.name          ELSE excluded.name          END,
              barcode =       CASE WHEN Product.syncStatus = 'PENDING' THEN Product.barcode       ELSE excluded.barcode       END,
              categoryId =    CASE WHEN Product.syncStatus = 'PENDING' THEN Product.categoryId    ELSE excluded.categoryId    END,
              subcategoryId = CASE WHEN Product.syncStatus = 'PENDING' THEN Product.subcategoryId ELSE excluded.subcategoryId END,
              price =         CASE WHEN Product.syncStatus = 'PENDING' THEN Product.price         ELSE excluded.price         END,
              cost =          CASE WHEN Product.syncStatus = 'PENDING' THEN Product.cost          ELSE excluded.cost          END,
              unit =          CASE WHEN Product.syncStatus = 'PENDING' THEN Product.unit          ELSE excluded.unit          END,
              stockQty =      CASE WHEN Product.syncStatus = 'PENDING' THEN Product.stockQty      ELSE excluded.stockQty      END,
              minStock =      CASE WHEN Product.syncStatus = 'PENDING' THEN Product.minStock      ELSE excluded.minStock      END,
              isActive =      CASE WHEN Product.syncStatus = 'PENDING' THEN Product.isActive      ELSE excluded.isActive      END,
              isInfinite =    CASE WHEN Product.syncStatus = 'PENDING' THEN Product.isInfinite    ELSE excluded.isInfinite    END,
              isDeleted =     CASE WHEN Product.syncStatus = 'PENDING' THEN Product.isDeleted     ELSE excluded.isDeleted     END,
              imageUrl =      CASE WHEN Product.syncStatus = 'PENDING' THEN Product.imageUrl      ELSE excluded.imageUrl      END,
              syncStatus =    CASE WHEN Product.syncStatus = 'PENDING' THEN 'PENDING'             ELSE 'SYNCED'               END,
              updatedAt =     CASE WHEN Product.syncStatus = 'PENDING' THEN Product.updatedAt     ELSE excluded.updatedAt     END
          `, [prod.id, prod.name, prod.barcode, prod.categoryId, prod.subcategoryId ?? null, prod.price, prod.cost, prod.unit, prod.stockQty, prod.minStock, prod.isActive ? 1 : 0, prod.isInfinite ? 1 : 0, prod.isDeleted ? 1 : 0, prod.imageUrl, dZ(prod.updatedAt)]);
                }
            });

            // Descarga de imágenes faltantes, en serie y sin reintentar URLs muertas.
            // Antes se disparaban decenas de descargas en paralelo en cada pull y, como no
            // se revisaba el status, el cuerpo de un 404 quedaba guardado como .jpg.
            void (async () => {
                const imgDir = productImagesDir();
                for (const prod of products) {
                    if (!prod.imageUrl) continue;
                    if (fs.existsSync(path.join(imgDir, `${prod.id}.jpg`))) continue;
                    if (shouldSkipImage(prod.id, prod.imageUrl)) continue;
                    try {
                        await cacheProductImage(prod.id, prod.imageUrl);
                    } catch { /* ya quedó marcada si es permanente */ }
                }
            })();
        }

        // 3. Sync Companies
        const companies = await fetchAllRows('Company');
        if (companies) {
            transactionNoFk(() => {
                for (const co of companies) {
                    execute(`
            INSERT INTO Company (id, name, taxId, billingEmail, phone, notes, isActive, isDeleted, deletedAt, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name =         CASE WHEN Company.syncStatus = 'PENDING' THEN Company.name         ELSE excluded.name         END,
              taxId =        CASE WHEN Company.syncStatus = 'PENDING' THEN Company.taxId        ELSE excluded.taxId        END,
              billingEmail = CASE WHEN Company.syncStatus = 'PENDING' THEN Company.billingEmail ELSE excluded.billingEmail END,
              phone =        CASE WHEN Company.syncStatus = 'PENDING' THEN Company.phone        ELSE excluded.phone        END,
              notes =        CASE WHEN Company.syncStatus = 'PENDING' THEN Company.notes        ELSE excluded.notes        END,
              isActive =     CASE WHEN Company.syncStatus = 'PENDING' THEN Company.isActive     ELSE excluded.isActive     END,
              isDeleted =    CASE WHEN Company.syncStatus = 'PENDING' THEN Company.isDeleted    ELSE excluded.isDeleted    END,
              deletedAt =    CASE WHEN Company.syncStatus = 'PENDING' THEN Company.deletedAt    ELSE excluded.deletedAt    END,
              syncStatus =   CASE WHEN Company.syncStatus = 'PENDING' THEN 'PENDING'            ELSE 'SYNCED'              END,
              updatedAt =    CASE WHEN Company.syncStatus = 'PENDING' THEN Company.updatedAt    ELSE excluded.updatedAt    END
          `, [co.id, co.name, co.taxId ?? null, co.billingEmail ?? null, co.phone ?? null, co.notes ?? null, co.isActive ? 1 : 0, co.isDeleted ? 1 : 0, dZ(co.deletedAt) ?? null, dZ(co.updatedAt)]);
                }
            });
        }

        // 3b. Sync Clients
        const clients = await fetchAllRows('Client');

        if (clients) {
            transactionNoFk(() => {
                for (const client of clients) {
                    execute(`
            INSERT INTO Client (id, name, phone, email, type, company, cedula, code, companyId, notes, isActive, isDeleted, deletedAt, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name =      CASE WHEN Client.syncStatus = 'PENDING' THEN Client.name      ELSE excluded.name      END,
              phone =     CASE WHEN Client.syncStatus = 'PENDING' THEN Client.phone     ELSE excluded.phone     END,
              email =     CASE WHEN Client.syncStatus = 'PENDING' THEN Client.email     ELSE excluded.email     END,
              type =      CASE WHEN Client.syncStatus = 'PENDING' THEN Client.type      ELSE excluded.type      END,
              company =   CASE WHEN Client.syncStatus = 'PENDING' THEN Client.company   ELSE excluded.company   END,
              cedula =    CASE WHEN Client.syncStatus = 'PENDING' THEN Client.cedula    ELSE excluded.cedula    END,
              code =      CASE WHEN Client.syncStatus = 'PENDING' THEN Client.code      ELSE excluded.code      END,
              companyId = CASE WHEN Client.syncStatus = 'PENDING' THEN Client.companyId ELSE excluded.companyId END,
              notes =     CASE WHEN Client.syncStatus = 'PENDING' THEN Client.notes     ELSE excluded.notes     END,
              isActive =  CASE WHEN Client.syncStatus = 'PENDING' THEN Client.isActive  ELSE excluded.isActive  END,
              isDeleted = CASE WHEN Client.syncStatus = 'PENDING' THEN Client.isDeleted ELSE excluded.isDeleted END,
              deletedAt = CASE WHEN Client.syncStatus = 'PENDING' THEN Client.deletedAt ELSE excluded.deletedAt END,
              syncStatus = CASE WHEN Client.syncStatus = 'PENDING' THEN 'PENDING' ELSE 'SYNCED' END,
              updatedAt =  CASE WHEN Client.syncStatus = 'PENDING' THEN Client.updatedAt ELSE excluded.updatedAt END
          `, [client.id, client.name, client.phone, client.email, client.type, client.company ?? null, client.cedula ?? null, client.code ?? null, client.companyId ?? null, client.notes, client.isActive ? 1 : 0, client.isDeleted ? 1 : 0, dZ(client.deletedAt) ?? null, dZ(client.updatedAt)]);
                }
            });
        }

        // 4. Sync Expense Categories
        const expCats = await fetchAllRows('ExpenseCategory');
        if (expCats) {
            transactionNoFk(() => {
                for (const cat of expCats) {
                    execute(`
            INSERT INTO ExpenseCategory (id, name, createdAt)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name
          `, [cat.id, cat.name, cat.createdAt]);
                }
            });
        }

        // 5. Sync Business Config
        const configs = await fetchAllRows('BusinessConfig');
        if (configs) {
            transactionNoFk(() => {
                for (const conf of configs) {
                    execute(`
            INSERT INTO BusinessConfig (id, name, address, phone, ticketHeader, ticketFooter, printerPort, printerModel, drawerEnabled, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name =          CASE WHEN syncStatus = 'PENDING' THEN name          ELSE excluded.name          END,
              address =       CASE WHEN syncStatus = 'PENDING' THEN address       ELSE excluded.address       END,
              phone =         CASE WHEN syncStatus = 'PENDING' THEN phone         ELSE excluded.phone         END,
              ticketHeader =  CASE WHEN syncStatus = 'PENDING' THEN ticketHeader  ELSE excluded.ticketHeader  END,
              ticketFooter =  CASE WHEN syncStatus = 'PENDING' THEN ticketFooter  ELSE excluded.ticketFooter  END,
              printerPort =   CASE WHEN syncStatus = 'PENDING' THEN printerPort   ELSE excluded.printerPort   END,
              printerModel =  CASE WHEN syncStatus = 'PENDING' THEN printerModel  ELSE excluded.printerModel  END,
              drawerEnabled = CASE WHEN syncStatus = 'PENDING' THEN drawerEnabled ELSE excluded.drawerEnabled END,
              syncStatus =    CASE WHEN syncStatus = 'PENDING' THEN 'PENDING'     ELSE 'SYNCED'               END,
              updatedAt =     CASE WHEN syncStatus = 'PENDING' THEN updatedAt     ELSE excluded.updatedAt     END
          `, [conf.id, conf.name, conf.address, conf.phone, conf.ticketHeader, conf.ticketFooter, conf.printerPort, conf.printerModel, conf.drawerEnabled ? 1 : 0, conf.updatedAt]);
                }
            });
        }

        // 6. Sync Employees
        const employees = await fetchAllRows('Employee');
        if (employees) {
            transactionNoFk(() => {
                for (const emp of employees) {
                    // Guard PENDING completo: antes name/role/pin se sobrescribían siempre y
                    // un empleado editado localmente volvía a su versión remota.
                    execute(`
            INSERT INTO Employee (id, name, role, pin, isActive, monthlySales, lastResetMonth, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name =           CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.name           ELSE excluded.name           END,
              role =           CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.role           ELSE excluded.role           END,
              pin =            CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.pin            ELSE excluded.pin            END,
              isActive =       CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.isActive       ELSE excluded.isActive       END,
              monthlySales =   CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.monthlySales   ELSE excluded.monthlySales   END,
              lastResetMonth = CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.lastResetMonth ELSE excluded.lastResetMonth END,
              syncStatus =     CASE WHEN Employee.syncStatus = 'PENDING' THEN 'PENDING'               ELSE 'SYNCED'                END,
              updatedAt =      CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.updatedAt      ELSE excluded.updatedAt      END
          `, [emp.id, emp.name, emp.role, emp.pin, emp.isActive ? 1 : 0, emp.monthlySales || 0, emp.lastResetMonth, dZ(emp.updatedAt)]);
                }
            });
        }

        // 7. Sync Subcategories (referenciadas por Product y ProductSubcategory)
        const subcategories = await fetchAllRows('Subcategory');
        if (subcategories) {
            transactionNoFk(() => {
                for (const sub of subcategories) {
                    execute(`
                        INSERT INTO Subcategory (id, categoryId, name, showDays, sortOrder, isActive, syncStatus, updatedAt)
                        VALUES (?, ?, ?, ?, ?, ?, 'SYNCED', ?)
                        ON CONFLICT(id) DO UPDATE SET
                          categoryId = CASE WHEN Subcategory.syncStatus = 'PENDING' THEN Subcategory.categoryId ELSE excluded.categoryId END,
                          name =       CASE WHEN Subcategory.syncStatus = 'PENDING' THEN Subcategory.name       ELSE excluded.name       END,
                          showDays =   CASE WHEN Subcategory.syncStatus = 'PENDING' THEN Subcategory.showDays   ELSE excluded.showDays   END,
                          sortOrder =  CASE WHEN Subcategory.syncStatus = 'PENDING' THEN Subcategory.sortOrder  ELSE excluded.sortOrder  END,
                          isActive =   CASE WHEN Subcategory.syncStatus = 'PENDING' THEN Subcategory.isActive   ELSE excluded.isActive   END,
                          syncStatus = CASE WHEN Subcategory.syncStatus = 'PENDING' THEN 'PENDING'              ELSE 'SYNCED'            END,
                          updatedAt =  CASE WHEN Subcategory.syncStatus = 'PENDING' THEN Subcategory.updatedAt  ELSE excluded.updatedAt  END
                    `, [sub.id, sub.categoryId, sub.name, sub.showDays ?? null, sub.sortOrder, sub.isActive ? 1 : 0, dZ(sub.updatedAt)]);
                }
            });
        }

        // 8. Sync ProductSubcategory junction table
        //
        // Antes: DELETE FROM ProductSubcategory + reinsertar todo lo remoto. Eso borraba
        // las asignaciones de productos que todavía no se habían subido, y el push posterior
        // leía la tabla local ya vacía y borraba también las filas remotas (pérdida en ambos
        // lados). Ahora los productos PENDING quedan intactos: son la versión autoritativa
        // hasta que suban.
        const productSubcats = await fetchAllRows('ProductSubcategory', 'productId');
        if (productSubcats) {
            transactionNoFk(() => {
                const pendingRows = query(`SELECT id FROM Product WHERE syncStatus = 'PENDING'`) as { id: string }[];
                const pendingIds = new Set(pendingRows.map(r => r.id));

                execute(`DELETE FROM ProductSubcategory WHERE productId NOT IN (SELECT id FROM Product WHERE syncStatus = 'PENDING')`, []);
                for (const ps of productSubcats) {
                    if (pendingIds.has(ps.productId)) continue; // no pisar asignaciones locales sin subir
                    execute(
                        'INSERT OR IGNORE INTO ProductSubcategory (productId, subcategoryId) VALUES (?, ?)',
                        [ps.productId, ps.subcategoryId]
                    );
                }
            });
        }

        // 8. Sync CashRegisters (parent of Sale and Expense)
        let cashRegQuery = supabase.from('CashRegister').select('*').order('updatedAt', { ascending: false });
        if (lastPullAt) cashRegQuery = cashRegQuery.gt('updatedAt', lastPullAt);
        cashRegQuery = cashRegQuery.limit(lastPullAt ? 100 : 1000);
        const { data: registers, error: regError } = await cashRegQuery;
        if (regError) throw regError;
        if (registers) {
            transactionNoFk(() => {
                for (const reg of registers) {
                    const localReg = get('SELECT syncStatus FROM CashRegister WHERE id = ?', [reg.id]) as { syncStatus: string } | undefined;
                    if (localReg?.syncStatus === 'PENDING') continue;
                    execute(`
                        INSERT INTO CashRegister (id, openedAt, closedAt, initialAmount, finalAmount, salesCash, salesCard, salesSinpe, salesTransfer, salesCredit, expensesTotal, notes, status, syncStatus, updatedAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
                        ON CONFLICT(id) DO UPDATE SET
                            openedAt = excluded.openedAt,
                            closedAt = excluded.closedAt,
                            initialAmount = excluded.initialAmount,
                            finalAmount = excluded.finalAmount,
                            salesCash = excluded.salesCash,
                            salesCard = excluded.salesCard,
                            salesSinpe = excluded.salesSinpe,
                            salesTransfer = excluded.salesTransfer,
                            salesCredit = excluded.salesCredit,
                            expensesTotal = excluded.expensesTotal,
                            notes = excluded.notes,
                            status = excluded.status,
                            syncStatus = 'SYNCED',
                            updatedAt = excluded.updatedAt
                    `, [reg.id, dZ(reg.openedAt), dZ(reg.closedAt) ?? null, reg.initialAmount, reg.finalAmount ?? null, reg.salesCash ?? null, reg.salesCard ?? null, reg.salesSinpe ?? null, reg.salesTransfer ?? null, reg.salesCredit ?? null, reg.expensesTotal ?? null, reg.notes ?? null, reg.status, reg.updatedAt]);
                }
            });
        }

        // 9. Sync Sales (depends on CashRegister, Client)
        let saleQuery = supabase.from('Sale').select('*').order('date', { ascending: false });
        if (lastPullAt) saleQuery = saleQuery.gt('updatedAt', lastPullAt);
        else saleQuery = saleQuery.limit(2000);
        const { data: sales, error: saleError } = await saleQuery;
        if (saleError) throw saleError;
        if (sales) {
            for (const sale of sales) {
                try {
                    // Skip if local sale is PENDING (not yet pushed) — avoid overwriting unsynced local changes
                    const localSale = get('SELECT syncStatus FROM Sale WHERE id = ?', [sale.id]) as { syncStatus: string } | undefined
                    if (localSale?.syncStatus === 'PENDING') continue
                    transactionNoFk(() => {
                    // Supabase es autoritativo en pull — eliminar venta local con mismo saleNumber pero distinto id
                    execute(`DELETE FROM SaleItem WHERE saleId IN (SELECT id FROM Sale WHERE saleNumber = ? AND id != ?)`, [sale.saleNumber, sale.id]);
                    execute(`DELETE FROM Sale WHERE saleNumber = ? AND id != ?`, [sale.saleNumber, sale.id]);
                    execute(`
                        INSERT INTO Sale (id, saleNumber, date, subtotal, discount, total, paymentMethod, amountReceived, change, cashRegisterId, isCredit, clientId, status, notes, syncStatus, updatedAt, companyId, consumerName, physicalInvoiceNumber, originalSaleSnapshot, modifiedFromSaleId, paidAt, paymentMethod2, amount2, settledSaleIds)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            saleNumber = excluded.saleNumber,
                            date = excluded.date,
                            subtotal = excluded.subtotal,
                            discount = excluded.discount,
                            total = excluded.total,
                            paymentMethod = excluded.paymentMethod,
                            amountReceived = excluded.amountReceived,
                            change = excluded.change,
                            cashRegisterId = excluded.cashRegisterId,
                            isCredit = excluded.isCredit,
                            clientId = excluded.clientId,
                            status = excluded.status,
                            notes = excluded.notes,
                            syncStatus = 'SYNCED',
                            updatedAt = excluded.updatedAt,
                            companyId = excluded.companyId,
                            consumerName = excluded.consumerName,
                            physicalInvoiceNumber = excluded.physicalInvoiceNumber,
                            originalSaleSnapshot = excluded.originalSaleSnapshot,
                            modifiedFromSaleId = excluded.modifiedFromSaleId,
                            paidAt = excluded.paidAt,
                            paymentMethod2 = excluded.paymentMethod2,
                            amount2 = excluded.amount2,
                            settledSaleIds = excluded.settledSaleIds
                    `, [sale.id, sale.saleNumber, d(sale.date), sale.subtotal, sale.discount, sale.total, sale.paymentMethod, sale.amountReceived ?? null, sale.change ?? null, sale.cashRegisterId ?? null, sale.isCredit ? 1 : 0, sale.clientId ?? null, sale.status, sale.notes ?? null, dZ(sale.updatedAt), sale.companyId ?? null, sale.consumerName ?? null, sale.physicalInvoiceNumber ?? null, sale.originalSaleSnapshot ?? null, sale.modifiedFromSaleId ?? null, dZ(sale.paidAt), sale.paymentMethod2 ?? null, sale.amount2 ?? null, sale.settledSaleIds ?? null]);
                    });
                } catch (e) {
                    console.error(`[SyncEngine] Sale pull ${sale.id} (#${sale.saleNumber}):`, e);
                }
            }
        }

        // 10. Sync SaleItems — only for Sales pulled in this cycle (avoids re-downloading all items every pull)
        const changedSaleIds = (sales ?? []).map((s: any) => s.id);
        const allSaleItems: any[] = [];
        for (let i = 0; i < changedSaleIds.length; i += 300) {
            const chunk = changedSaleIds.slice(i, i + 300);
            const { data: chunkItems } = await supabase.from('SaleItem').select('*').in('saleId', chunk);
            if (chunkItems) allSaleItems.push(...chunkItems);
        }
        if (allSaleItems.length > 0) {
            transactionNoFk(() => {
                for (const item of allSaleItems) {
                    execute(`
                        INSERT INTO SaleItem (id, saleId, productId, quantity, unitPrice, subtotal, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            saleId = excluded.saleId,
                            productId = excluded.productId,
                            quantity = excluded.quantity,
                            unitPrice = excluded.unitPrice,
                            subtotal = excluded.subtotal,
                            notes = excluded.notes
                    `, [item.id, item.saleId, item.productId, item.quantity, item.unitPrice, item.subtotal, item.notes ?? null]);
                }
            });
        }

        // 11. Sync Expenses (depends on CashRegister, ExpenseCategory)
        let expQuery = supabase.from('Expense').select('*').order('date', { ascending: false });
        if (lastPullAt) expQuery = expQuery.gt('updatedAt', lastPullAt);
        else expQuery = expQuery.limit(1000);
        const { data: expenses, error: expError } = await expQuery;
        if (expError && expError.code !== 'PGRST205') throw expError;
        if (expenses) {
            transactionNoFk(() => {
                for (const exp of expenses) {
                    const localExp = get('SELECT syncStatus FROM Expense WHERE id = ?', [exp.id]) as { syncStatus: string } | undefined;
                    if (localExp?.syncStatus === 'PENDING') continue;
                    execute(`
                        INSERT INTO Expense (id, description, amount, categoryId, supplier, date, notes, cashRegisterId, syncStatus, updatedAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
                        ON CONFLICT(id) DO UPDATE SET
                            description = excluded.description,
                            amount = excluded.amount,
                            categoryId = excluded.categoryId,
                            supplier = excluded.supplier,
                            date = excluded.date,
                            notes = excluded.notes,
                            cashRegisterId = excluded.cashRegisterId,
                            syncStatus = 'SYNCED',
                            updatedAt = excluded.updatedAt
                    `, [exp.id, exp.description, exp.amount, exp.categoryId, exp.supplier ?? null, d(exp.date), exp.notes ?? null, exp.cashRegisterId ?? null, d(exp.updatedAt)]);
                }
            });
        }

        // 12. Sync InventoryMovements (depends on Product)
        let movQuery = supabase.from('InventoryMovement').select('*').order('date', { ascending: false });
        if (dateCursorLookback) movQuery = movQuery.gt('date', dateCursorLookback).limit(2000);
        else movQuery = movQuery.limit(2000);
        const { data: movements, error: movError } = await movQuery;
        if (movError) throw movError;
        if (movements) {
            transactionNoFk(() => {
                for (const mov of movements) {
                    const localMov = get('SELECT syncStatus FROM InventoryMovement WHERE id = ?', [mov.id]) as { syncStatus: string } | undefined;
                    if (localMov?.syncStatus === 'PENDING') continue;
                    execute(`
                        INSERT INTO InventoryMovement (id, productId, type, quantity, cost, reference, notes, date, syncStatus)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
                        ON CONFLICT(id) DO UPDATE SET
                            productId = excluded.productId,
                            type = excluded.type,
                            quantity = excluded.quantity,
                            cost = excluded.cost,
                            reference = excluded.reference,
                            notes = excluded.notes,
                            date = excluded.date,
                            syncStatus = 'SYNCED'
                    `, [mov.id, mov.productId, mov.type, mov.quantity, mov.cost ?? null, mov.reference ?? null, mov.notes ?? null, d(mov.date)]);
                }
            });
        }

        // 13. Sync Payments (depends on Client)
        let payQuery = supabase.from('Payment').select('*').order('date', { ascending: false });
        if (dateCursorLookback) payQuery = payQuery.gt('date', dateCursorLookback).limit(1000);
        else payQuery = payQuery.limit(1000);
        const { data: payments, error: payError } = await payQuery;
        if (payError) throw payError;
        if (payments) {
            transactionNoFk(() => {
                for (const pay of payments) {
                    const localPay = get('SELECT syncStatus FROM Payment WHERE id = ?', [pay.id]) as { syncStatus: string } | undefined;
                    if (localPay?.syncStatus === 'PENDING') continue;
                    execute(`
                        INSERT INTO Payment (id, clientId, amount, method, reference, notes, date, syncStatus)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED')
                        ON CONFLICT(id) DO UPDATE SET
                            clientId = excluded.clientId,
                            amount = excluded.amount,
                            method = excluded.method,
                            reference = excluded.reference,
                            notes = excluded.notes,
                            date = excluded.date,
                            syncStatus = 'SYNCED'
                    `, [pay.id, pay.clientId, pay.amount, pay.method, pay.reference ?? null, pay.notes ?? null, d(pay.date)]);
                }
            });
        }

        // 14. Sync SinpeMessages — baja mensajes capturados por Edge Function mientras PC estuvo apagada
        await pullSinpeMessages();

        // 15. Sync Sorteo
        const { data: sorteos, error: sorteoError } = await supabase.from('Sorteo').select('*');
        if (sorteoError && sorteoError.code !== 'PGRST205') throw sorteoError;
        if (sorteos) {
            transactionNoFk(() => {
                for (const s of sorteos) {
                    execute(`
                        INSERT INTO Sorteo (id, name, type, status, startAt, endAt, minSpinsBetweenPrizes,
                            totalCards, prizeCount, slotsPerCard, cardSkin,
                            totalNumbers, pricePerNumber, sellStartDate, sellEndDate, drawDate, tombPrizes,
                            syncStatus, createdAt, updatedAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            name = CASE WHEN Sorteo.syncStatus = 'PENDING' THEN Sorteo.name ELSE excluded.name END,
                            type = excluded.type,
                            status = CASE WHEN Sorteo.syncStatus = 'PENDING' THEN Sorteo.status ELSE excluded.status END,
                            startAt = excluded.startAt,
                            endAt = excluded.endAt,
                            minSpinsBetweenPrizes = excluded.minSpinsBetweenPrizes,
                            totalCards = excluded.totalCards,
                            prizeCount = excluded.prizeCount,
                            slotsPerCard = excluded.slotsPerCard,
                            cardSkin = excluded.cardSkin,
                            totalNumbers = excluded.totalNumbers,
                            pricePerNumber = excluded.pricePerNumber,
                            sellStartDate = excluded.sellStartDate,
                            sellEndDate = excluded.sellEndDate,
                            drawDate = excluded.drawDate,
                            tombPrizes = excluded.tombPrizes,
                            syncStatus = CASE WHEN Sorteo.syncStatus = 'PENDING' THEN 'PENDING' ELSE 'SYNCED' END,
                            updatedAt = CASE WHEN Sorteo.syncStatus = 'PENDING' THEN Sorteo.updatedAt ELSE excluded.updatedAt END
                    `, [s.id, s.name, s.type, s.status, s.startAt ?? null, s.endAt ?? null,
                        s.minSpinsBetweenPrizes ?? 8, s.totalCards ?? null, s.prizeCount ?? null,
                        s.slotsPerCard ?? null, s.cardSkin ?? null,
                        s.totalNumbers ?? null, s.pricePerNumber ?? null,
                        s.sellStartDate ?? null, s.sellEndDate ?? null, s.drawDate ?? null,
                        s.tombPrizes ?? null, s.createdAt, s.updatedAt]);
                }
            });
        }

        // 16. Sync TombolaEntry (depends on Sorteo)
        const { data: tombolaEntries, error: tombolaError } = await supabase.from('TombolaEntry').select('*').order('createdAt', { ascending: false }).limit(5000);
        if (tombolaError && tombolaError.code !== 'PGRST205') throw tombolaError;
        if (tombolaEntries) {
            transactionNoFk(() => {
                for (const entry of tombolaEntries) {
                    const localEntry = get('SELECT syncStatus FROM TombolaEntry WHERE id = ?', [entry.id]) as { syncStatus: string } | undefined;
                    if (localEntry?.syncStatus === 'PENDING') continue;
                    execute(`
                        INSERT INTO TombolaEntry (id, sorteoId, number, participantName, participantCedula,
                            participantEmail, paymentMethod, price, saleRegisteredAt, isWinner, prizePosition,
                            syncStatus, createdAt, updatedAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            participantName = excluded.participantName,
                            participantCedula = excluded.participantCedula,
                            participantEmail = excluded.participantEmail,
                            paymentMethod = excluded.paymentMethod,
                            price = excluded.price,
                            saleRegisteredAt = excluded.saleRegisteredAt,
                            isWinner = excluded.isWinner,
                            prizePosition = excluded.prizePosition,
                            syncStatus = 'SYNCED',
                            updatedAt = excluded.updatedAt
                    `, [entry.id, entry.sorteoId, entry.number, entry.participantName, entry.participantCedula,
                        entry.participantEmail ?? null, entry.paymentMethod, entry.price,
                        entry.saleRegisteredAt ?? null, entry.isWinner ? 1 : 0, entry.prizePosition ?? null,
                        entry.createdAt, entry.updatedAt]);
                }
            });
        }

        // 17. Sync Returns (depends on Sale)
        const { data: returns, error: returnsError } = await supabase.from('Return').select('*, items:ReturnItem(*)').order('date', { ascending: false }).limit(500);
        if (returnsError && returnsError.code !== 'PGRST205') throw returnsError;
        if (returns) {
            transactionNoFk(() => {
                for (const ret of returns) {
                    const localRet = get('SELECT syncStatus FROM "Return" WHERE id = ?', [ret.id]) as { syncStatus: string } | undefined;
                    if (localRet?.syncStatus === 'PENDING') continue;
                    execute(`
                        INSERT INTO "Return" (id, returnNumber, originalSaleId, type, cashRegisterId, netCash, employeeName, notes, date, syncStatus, createdAt, updatedAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            returnNumber = excluded.returnNumber,
                            originalSaleId = excluded.originalSaleId,
                            type = excluded.type,
                            cashRegisterId = excluded.cashRegisterId,
                            netCash = excluded.netCash,
                            employeeName = excluded.employeeName,
                            notes = excluded.notes,
                            date = excluded.date,
                            syncStatus = 'SYNCED',
                            updatedAt = excluded.updatedAt
                    `, [ret.id, ret.returnNumber, ret.originalSaleId ?? null, ret.type, ret.cashRegisterId ?? null, ret.netCash, ret.employeeName ?? null, ret.notes ?? null, ret.date, ret.createdAt, ret.updatedAt]);
                    execute(`DELETE FROM ReturnItem WHERE returnId = ?`, [ret.id]);
                    for (const item of (ret.items ?? [])) {
                        execute(`
                            INSERT OR IGNORE INTO ReturnItem (id, returnId, direction, productId, quantity, unitPrice, subtotal)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `, [item.id, item.returnId, item.direction, item.productId, item.quantity, item.unitPrice, item.subtotal]);
                    }
                }
            });
        }

        // Guardar timestamp del pull exitoso para próximo pull incremental
        try {
            execute(`INSERT INTO LocalConfig (key, value) VALUES ('lastPullAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [pullStartedAt]);
        } catch {}

        console.log('[SyncEngine] Pull items success.');

        // Solo notificar tablas que realmente recibieron datos en este pull
        const tablesWithData: string[] = [];
        if (categories?.length) tablesWithData.push('Category');
        if (products?.length) tablesWithData.push('Product');
        if (companies?.length) tablesWithData.push('Company');
        if (clients?.length) tablesWithData.push('Client');
        if (employees?.length) tablesWithData.push('Employee');
        if (configs?.length) tablesWithData.push('BusinessConfig');
        if (subcategories?.length) tablesWithData.push('Subcategory');
        if (registers?.length) tablesWithData.push('CashRegister');
        if (sales?.length) tablesWithData.push('Sale');
        if (allSaleItems.length) tablesWithData.push('Sale');
        if (expenses?.length) tablesWithData.push('Expense');
        if (movements?.length) tablesWithData.push('InventoryMovement');
        if (payments?.length) tablesWithData.push('Payment');
        if (sorteos?.length) tablesWithData.push('Sorteo');
        if (tombolaEntries?.length) tablesWithData.push('TombolaEntry');
        if (returns?.length) tablesWithData.push('Return');
        const uniqueTables = [...new Set(tablesWithData)];
        for (const table of uniqueTables) {
            notifyUI(table);
        }
    } catch (err) {
        console.error('[SyncEngine] Pull failed:', err);
        logError(`Pull falló: ${(err as any)?.message ?? err}`);
    }
    // Las FK ya no se apagan globalmente: cada transacción del pull usa transactionNoFk().
}

export async function pullSinpeMessages(): Promise<void> {
    try {
        const { data } = await supabase
            .from('SinpeMessage')
            .select('*')
            .order('receivedAt', { ascending: false })
            .limit(500);
        if (data) {
            transaction(() => {
                for (const msg of data) {
                    execute(`
                        INSERT INTO SinpeMessage (id, sender, body, receivedAt, isRead, deletedAt, syncStatus)
                        VALUES (?, ?, ?, ?, ?, ?, 'SYNCED')
                        ON CONFLICT(id) DO NOTHING
                    `, [msg.id, msg.sender, msg.body, msg.receivedAt, msg.isRead ? 1 : 0, msg.deletedAt ?? null]);
                }
            });
        }
    } catch (err) {
        console.error('[SyncEngine] pullSinpeMessages failed:', err);
    }
}

/**
 * PUSH SYNC: SQLite -> Supabase
 * Uploads transactional data (Sales, Expenses, Movements)
 */
export async function pushSync(): Promise<string[]> {
    // Push y pull nunca corren a la vez: el pull traía datos remotos viejos y los
    // aplicaba encima de filas que el push acababa de marcar SYNCED.
    if (isPushing || isPulling) {
        pushQueued = true;
        return [];
    }
    isPushing = true;
    try {
        return await _pushSync();
    } finally {
        isPushing = false;
        if (pushQueued) {
            pushQueued = false;
            setTimeout(() => { pushSync().catch(err => logError(`push encolado: ${err?.message ?? err}`)); }, 1000);
        }
    }
}

async function _pushSync(): Promise<string[]> {
    const pendingSales = query(`SELECT * FROM Sale WHERE syncStatus = 'PENDING'`) as DbSaleRow[];
    const pendingExpenses = query(`SELECT * FROM Expense WHERE syncStatus = 'PENDING'`) as DbExpenseRow[];
    const pendingMovements = query(`SELECT * FROM InventoryMovement WHERE syncStatus = 'PENDING'`) as DbInventoryMovementRow[];
    const pendingRegisters = query(`SELECT * FROM CashRegister WHERE syncStatus = 'PENDING'`) as DbCashRegisterRow[];
    const pendingPayments = query(`SELECT * FROM Payment WHERE syncStatus = 'PENDING'`) as DbPaymentRow[];
    const pendingEmployees = query(`SELECT * FROM Employee WHERE syncStatus = 'PENDING'`) as DbEmployeeRow[];
    const pendingCompanies = query(`SELECT * FROM Company WHERE syncStatus = 'PENDING'`) as DbCompanyRow[];
    const pendingClients = query(`SELECT * FROM Client WHERE syncStatus = 'PENDING'`) as DbClientRow[];
    const pendingProducts = query(`SELECT * FROM Product WHERE syncStatus = 'PENDING'`) as DbProductRow[];
    const pendingCategories = query(`SELECT * FROM Category WHERE syncStatus = 'PENDING'`) as DbCategoryRow[];
    const pendingSubcategories = query(`SELECT * FROM Subcategory WHERE syncStatus = 'PENDING'`) as DbSubcategoryRow[];
    const pendingConfig = query(`SELECT * FROM BusinessConfig WHERE syncStatus = 'PENDING'`) as DbBusinessConfigRow[];
    const pendingSinpe = query(`SELECT * FROM SinpeMessage WHERE syncStatus = 'PENDING'`) as DbSinpeMessageRow[];
    const pendingTombolaEntries = query(`SELECT * FROM TombolaEntry WHERE syncStatus = 'PENDING'`) as DbTombolaEntryRow[];
    const pendingSorteos = query(`SELECT * FROM Sorteo WHERE syncStatus = 'PENDING'`) as DbSorteoRow[];
    const pendingReturns = query(`SELECT * FROM "Return" WHERE syncStatus = 'PENDING'`) as any[];

    const totalPending = pendingSales.length + pendingExpenses.length + pendingMovements.length +
        pendingRegisters.length + pendingPayments.length + pendingEmployees.length +
        pendingCompanies.length + pendingClients.length + pendingProducts.length + pendingCategories.length + pendingSubcategories.length +
        pendingConfig.length + pendingSinpe.length + pendingTombolaEntries.length + pendingSorteos.length + pendingReturns.length;

    if (totalPending === 0) return [];

    console.log(`[SyncEngine] Pushing ${totalPending} changes to Supabase...`);

    const errors: string[] = [];

    // 1. CashRegisters — referenced by Sale and Expense (must go first)
    for (const reg of pendingRegisters) {
        try {
            const { error } = await supabase.from('CashRegister').upsert({
                id: reg.id,
                openedAt: reg.openedAt,
                closedAt: reg.closedAt,
                initialAmount: reg.initialAmount,
                finalAmount: reg.finalAmount,
                salesCash: reg.salesCash,
                salesCard: reg.salesCard,
                salesSinpe: reg.salesSinpe,
                salesTransfer: reg.salesTransfer,
                salesCredit: reg.salesCredit,
                expensesTotal: reg.expensesTotal,
                notes: reg.notes,
                status: reg.status,
                syncStatus: 'SYNCED',
                // CashRegister/Sale/Expense se bajan de forma incremental con
                // .gt('updatedAt', lastPullAt): acá updatedAt es el CURSOR de sincronización,
                // así que debe ser la hora de subida. Si mandáramos el updatedAt real, una
                // caja subida tarde (terminal que estuvo sin internet) quedaría por debajo
                // del cursor de las otras terminales y nunca la verían.
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            markSynced('CashRegister', reg.id, { updatedAt: reg.updatedAt });
        } catch (err: any) {
            const msg = `CashRegister ${reg.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('CashRegister', reg.id, msg);
        }
    }

    // 2. Employees — independent
    for (const emp of pendingEmployees) {
        try {
            const { error } = await supabase.from('Employee').upsert({
                id: emp.id,
                name: emp.name,
                role: emp.role,
                pin: emp.pin,
                isActive: !!emp.isActive,
                monthlySales: emp.monthlySales,
                lastResetMonth: emp.lastResetMonth,
                updatedAt: emp.updatedAt ?? new Date().toISOString()
            });
            if (error) throw error;
            markSynced('Employee', emp.id, { updatedAt: emp.updatedAt });
        } catch (err: any) {
            const msg = `Employee ${emp.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Employee', emp.id, msg);
        }
    }

    // 3. Companies — referenced by Client and Sale
    for (const co of pendingCompanies) {
        try {
            const { error } = await supabase.from('Company').upsert({
                id: co.id,
                name: co.name,
                taxId: co.taxId ?? null,
                billingEmail: co.billingEmail ?? null,
                phone: co.phone ?? null,
                notes: co.notes ?? null,
                isActive: !!co.isActive,
                isDeleted: !!co.isDeleted,
                deletedAt: co.deletedAt ?? null,
                syncStatus: 'SYNCED',
                updatedAt: co.updatedAt ?? new Date().toISOString(),
            });
            if (error) throw error;
            markSynced('Company', co.id, { updatedAt: co.updatedAt });
        } catch (err: any) {
            const msg = `Company ${co.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Company', co.id, msg);
        }
    }

    // 3b. Clients — referenced by Sale and Payment
    for (const client of pendingClients) {
        try {
            const { error } = await supabase.from('Client').upsert({
                id: client.id,
                name: client.name,
                phone: client.phone,
                email: client.email,
                type: client.type,
                company: client.company,
                cedula: client.cedula,
                code: client.code,
                companyId: client.companyId,
                notes: client.notes,
                isActive: !!client.isActive,
                isDeleted: !!client.isDeleted,
                deletedAt: client.deletedAt ?? null,
                syncStatus: 'SYNCED',
                updatedAt: client.updatedAt ?? new Date().toISOString()
            });
            if (error) throw error;
            markSynced('Client', client.id, { updatedAt: client.updatedAt });
        } catch (err: any) {
            const msg = `Client ${client.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Client', client.id, msg);
        }
    }

    // 4. Categories — referenced by Product
    for (const cat of pendingCategories) {
        try {
            const { error } = await supabase.from('Category').upsert({
                id: cat.id,
                name: cat.name,
                type: cat.type,
                icon: cat.icon,
                sortOrder: cat.sortOrder,
                isActive: !!cat.isActive,
                updatedAt: cat.updatedAt ?? new Date().toISOString()
            });
            if (error) throw error;
            markSynced('Category', cat.id, { updatedAt: cat.updatedAt });
        } catch (err: any) {
            const msg = `Category ${cat.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Category', cat.id, msg);
        }
    }

    // 5. BusinessConfig
    for (const conf of pendingConfig) {
        try {
            const { error } = await supabase.from('BusinessConfig').upsert({
                id: conf.id,
                name: conf.name,
                address: conf.address,
                phone: conf.phone,
                ticketHeader: conf.ticketHeader,
                ticketFooter: conf.ticketFooter,
                printerPort: conf.printerPort,
                printerModel: conf.printerModel,
                drawerEnabled: !!conf.drawerEnabled,
                updatedAt: conf.updatedAt ?? new Date().toISOString()
            });
            if (error) throw error;
            markSynced('BusinessConfig', conf.id, { updatedAt: conf.updatedAt });
        } catch (err: any) {
            const msg = `BusinessConfig ${conf.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('BusinessConfig', conf.id, msg);
        }
    }

    // 6. Subcategories — referenced by Product (after Category)
    for (const sub of pendingSubcategories) {
        try {
            const { error } = await supabase.from('Subcategory').upsert({
                id: sub.id,
                categoryId: sub.categoryId,
                name: sub.name,
                showDays: sub.showDays ?? null,
                sortOrder: sub.sortOrder,
                isActive: !!sub.isActive,
                syncStatus: 'SYNCED',
                updatedAt: sub.updatedAt ?? new Date().toISOString()
            });
            if (error) throw error;
            markSynced('Subcategory', sub.id, { updatedAt: sub.updatedAt });
        } catch (err: any) {
            const msg = `Subcategory ${sub.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Subcategory', sub.id, msg);
        }
    }

    // 6. Products — after Category and Subcategory
    for (const prod of pendingProducts) {
        if (prod.id === 'credit-charge') {
            execute(`UPDATE Product SET syncStatus = 'SYNCED' WHERE id = 'credit-charge'`, [])
            continue
        }
        try {
            const { error } = await supabase.from('Product').upsert({
                id: prod.id,
                name: prod.name,
                barcode: prod.barcode,
                categoryId: prod.categoryId,
                subcategoryId: prod.subcategoryId ?? null,
                price: prod.price,
                cost: prod.cost,
                unit: prod.unit,
                stockQty: prod.stockQty,
                minStock: prod.minStock,
                isActive: !!prod.isActive,
                isInfinite: !!prod.isInfinite,
                isDeleted: !!prod.isDeleted,
                imageUrl: prod.imageUrl,
                syncStatus: 'SYNCED',
                updatedAt: prod.updatedAt ?? new Date().toISOString()
            });
            if (error) throw error;
            markSynced('Product', prod.id, { updatedAt: prod.updatedAt });
        } catch (err: any) {
            const errMsg: string = err?.message ?? String(err);
            if (errMsg.includes('Product_barcode_key')) {
                // Conflicto de barcode: NO se borra el código del producto.
                // Antes se hacía `UPDATE Product SET barcode = NULL` y se subía así — el
                // cajero escaneaba y "el producto no existía". Ahora queda PENDING, se
                // reporta en Ajustes → Sincronización y el usuario decide qué código va.
                let owner = '';
                try {
                    if (prod.barcode) {
                        const { data: conflict } = await supabase
                            .from('Product')
                            .select('id, name')
                            .eq('barcode', prod.barcode)
                            .maybeSingle();
                        if (conflict && conflict.id !== prod.id) owner = ` (ya lo usa "${conflict.name}")`;
                    }
                } catch { }
                const barcodeMsg = `"${prod.name}": el código de barras ${prod.barcode ?? ''} está duplicado${owner}. Cambialo para que el producto pueda sincronizar.`;
                logError(barcodeMsg);
                errors.push(barcodeMsg);
                persistSyncError('Product', prod.id, barcodeMsg);
                if (windowRef && !windowRef.isDestroyed()) {
                    windowRef.webContents.send('sync-barcode-conflict', { productId: prod.id, productName: prod.name });
                }
            } else {
                const msg = `Product ${prod.id} (${prod.name}): ${errMsg}`;
                logError(msg);
                errors.push(msg);
                persistSyncError('Product', prod.id, msg);
            }
            continue;
        }
        // Sync ProductSubcategory for this product.
        // Se relee la tabla local justo antes de subir; si el usuario cambió las
        // subcategorías durante el push, markSynced ya dejó el producto PENDING y el
        // próximo ciclo vuelve a subir el set correcto.
        try {
            const subcatRows = query('SELECT subcategoryId FROM ProductSubcategory WHERE productId = ?', [prod.id]) as { subcategoryId: string }[];
            await supabase.from('ProductSubcategory').delete().eq('productId', prod.id);
            if (subcatRows.length > 0) {
                const { error: insErr } = await supabase.from('ProductSubcategory').insert(
                    subcatRows.map(r => ({ productId: prod.id, subcategoryId: r.subcategoryId }))
                );
                if (insErr) throw insErr;
            }
        } catch (subErr: any) {
            const msg = `ProductSubcategory ${prod.id}: ${subErr?.message ?? subErr}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Product', prod.id, msg);
        }
    }

    // 7. Sales + SaleItems — after CashRegister, Client, Product
    for (const sale of pendingSales) {
        try {
            const items = query(`SELECT * FROM SaleItem WHERE saleId = ?`, [sale.id]) as DbSaleItemRow[];
            const { error: saleError } = await supabase.from('Sale').upsert({
                id: sale.id,
                saleNumber: sale.saleNumber,
                date: sale.date,
                subtotal: sale.subtotal,
                discount: sale.discount,
                total: sale.total,
                paymentMethod: sale.paymentMethod,
                amountReceived: sale.amountReceived,
                change: sale.change,
                cashRegisterId: sale.cashRegisterId,
                isCredit: !!sale.isCredit,
                clientId: sale.clientId,
                status: sale.status,
                notes: sale.notes,
                syncStatus: 'SYNCED',
                // Cursor de sincronización (ver nota en CashRegister), no marca de edición.
                updatedAt: new Date().toISOString(),
                companyId: sale.companyId ?? null,
                consumerName: sale.consumerName ?? null,
                physicalInvoiceNumber: sale.physicalInvoiceNumber ?? null,
                originalSaleSnapshot: sale.originalSaleSnapshot ?? null,
                modifiedFromSaleId: sale.modifiedFromSaleId ?? null,
                paidAt: sale.paidAt ?? null,
                paymentMethod2: sale.paymentMethod2 ?? null,
                amount2: sale.amount2 ?? null,
                settledSaleIds: sale.settledSaleIds ?? null,
            });
            if (saleError) throw saleError;
            // Delete all Supabase SaleItems for this sale before reinserting current ones.
            // updateSaleInPlace deletes+recreates items locally (new UUIDs), so without
            // this step old Supabase items with different IDs would persist and re-sync on pull.
            await supabase.from('SaleItem').delete().eq('saleId', sale.id)
            for (const item of items) {
                const { error: itemError } = await supabase.from('SaleItem').upsert({
                    id: item.id,
                    saleId: item.saleId,
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    subtotal: item.subtotal,
                    notes: item.notes
                });
                if (itemError) throw itemError;
            }
            // Toda mutación de venta (anular, editar en sitio, saldar) toca updatedAt,
            // así que el guard también cubre cambios en los SaleItem.
            markSynced('Sale', sale.id, { updatedAt: sale.updatedAt });
        } catch (err: any) {
            const msg = `Sale ${sale.id} (#${sale.saleNumber}): ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Sale', sale.id, msg);
        }
    }

    // 8. Expenses — after CashRegister
    for (const exp of pendingExpenses) {
        try {
            const { error } = await supabase.from('Expense').upsert({
                id: exp.id,
                description: exp.description,
                amount: exp.amount,
                categoryId: exp.categoryId,
                supplier: exp.supplier,
                date: exp.date,
                notes: exp.notes,
                cashRegisterId: exp.cashRegisterId,
                // Cursor de sincronización (ver nota en CashRegister), no marca de edición.
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            markSynced('Expense', exp.id, { updatedAt: exp.updatedAt });
        } catch (err: any) {
            const msg = `Expense ${exp.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Expense', exp.id, msg);
        }
    }

    // 9. InventoryMovements — after Product
    for (const mov of pendingMovements) {
        try {
            const { error } = await supabase.from('InventoryMovement').upsert({
                id: mov.id,
                productId: mov.productId,
                type: mov.type,
                quantity: mov.quantity,
                cost: mov.cost,
                reference: mov.reference,
                notes: mov.notes,
                date: mov.date,
                syncStatus: 'SYNCED'
            });
            if (error) throw error;
            // InventoryMovement no tiene updatedAt: se compara lo mutable (quantity/cost/notes).
            markSynced('InventoryMovement', mov.id, { quantity: mov.quantity, cost: mov.cost, notes: mov.notes });
        } catch (err: any) {
            const msg = `InventoryMovement ${mov.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('InventoryMovement', mov.id, msg);
        }
    }

    // 10. Payments — after Client
    for (const pay of pendingPayments) {
        try {
            const { error } = await supabase.from('Payment').upsert({
                id: pay.id,
                clientId: pay.clientId,
                amount: pay.amount,
                method: pay.method,
                reference: pay.reference,
                notes: pay.notes,
                date: pay.date,
                syncStatus: 'SYNCED'
            });
            if (error) throw error;
            markSynced('Payment', pay.id, { amount: pay.amount, method: pay.method, notes: pay.notes });
        } catch (err: any) {
            const msg = `Payment ${pay.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Payment', pay.id, msg);
        }
    }

    // 11. SinpeMessages — independent, append-only backup
    for (const msg of pendingSinpe) {
        try {
            const { error } = await supabase.from('SinpeMessage').upsert({
                id: msg.id,
                sender: msg.sender,
                body: msg.body,
                receivedAt: msg.receivedAt,
                isRead: !!msg.isRead,
                deletedAt: msg.deletedAt ?? null,
            });
            if (error) throw error;
            markSynced('SinpeMessage', msg.id, { isRead: msg.isRead, deletedAt: msg.deletedAt });
        } catch (err: any) {
            const m = `SinpeMessage ${msg.id}: ${err?.message ?? err}`;
            logError(m);
            errors.push(m);
            persistSyncError('SinpeMessage', msg.id, m);
        }
    }

    // 12. Sorteo — before TombolaEntry
    for (const s of pendingSorteos) {
        try {
            const { error } = await supabase.from('Sorteo').upsert({
                id: s.id,
                name: s.name,
                type: s.type,
                status: s.status,
                startAt: s.startAt ?? null,
                endAt: s.endAt ?? null,
                minSpinsBetweenPrizes: s.minSpinsBetweenPrizes ?? 8,
                totalCards: s.totalCards ?? null,
                prizeCount: s.prizeCount ?? null,
                slotsPerCard: s.slotsPerCard ?? null,
                cardSkin: s.cardSkin ?? null,
                totalNumbers: s.totalNumbers ?? null,
                pricePerNumber: s.pricePerNumber ?? null,
                sellStartDate: s.sellStartDate ?? null,
                sellEndDate: s.sellEndDate ?? null,
                drawDate: s.drawDate ?? null,
                tombPrizes: s.tombPrizes ?? null,
                syncStatus: 'SYNCED',
                updatedAt: s.updatedAt ?? new Date().toISOString(),
            });
            if (error) throw error;
            markSynced('Sorteo', s.id, { updatedAt: s.updatedAt });
        } catch (err: any) {
            const msg = `Sorteo ${s.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Sorteo', s.id, msg);
        }
    }

    // 13. TombolaEntry — after Sorteo
    for (const entry of pendingTombolaEntries) {
        try {
            const { error } = await supabase.from('TombolaEntry').upsert({
                id: entry.id,
                sorteoId: entry.sorteoId,
                number: entry.number,
                participantName: entry.participantName,
                participantCedula: entry.participantCedula,
                participantEmail: entry.participantEmail ?? null,
                paymentMethod: entry.paymentMethod,
                price: entry.price,
                saleRegisteredAt: entry.saleRegisteredAt ?? null,
                isWinner: !!entry.isWinner,
                prizePosition: entry.prizePosition ?? null,
                syncStatus: 'SYNCED',
                updatedAt: entry.updatedAt ?? new Date().toISOString(),
            });
            if (error) throw error;
            markSynced('TombolaEntry', entry.id, { updatedAt: entry.updatedAt });
        } catch (err: any) {
            const msg = `TombolaEntry ${entry.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('TombolaEntry', entry.id, msg);
        }
    }

    // 14. Returns — after Sale (originalSaleId FK)
    for (const ret of pendingReturns) {
        try {
            const items = query(`SELECT * FROM ReturnItem WHERE returnId = ?`, [ret.id]) as any[];
            const { error: retError } = await supabase.from('Return').upsert({
                id: ret.id,
                returnNumber: ret.returnNumber,
                originalSaleId: ret.originalSaleId ?? null,
                type: ret.type,
                cashRegisterId: ret.cashRegisterId ?? null,
                netCash: ret.netCash,
                employeeName: ret.employeeName ?? null,
                notes: ret.notes ?? null,
                date: ret.date,
                syncStatus: 'SYNCED',
                createdAt: ret.createdAt,
                updatedAt: ret.updatedAt ?? new Date().toISOString(),
            });
            if (retError) throw retError;
            await supabase.from('ReturnItem').delete().eq('returnId', ret.id);
            for (const item of items) {
                const { error: itemError } = await supabase.from('ReturnItem').upsert({
                    id: item.id,
                    returnId: item.returnId,
                    direction: item.direction,
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    subtotal: item.subtotal,
                });
                if (itemError) throw itemError;
            }
            markSynced('Return', ret.id, { updatedAt: ret.updatedAt });
        } catch (err: any) {
            const msg = `Return ${ret.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('Return', ret.id, msg);
        }
    }

    clearResolvedSyncErrors();
    console.log('[SyncEngine] Push cycle complete.');
    return errors;
}

/**
 * REALTIME SYNC: Listens for changes in Supabase and updates SQLite instantly
 */
function setupRealtimeSubscriptions() {
    console.log('[SyncEngine] Setting up Realtime subscriptions...');

    supabase
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Employee' }, (payload) => {
            console.log('[SyncRealtime] Employee change detected:', payload.eventType);
            const emp = payload.new as DbEmployeeRow;
            if (!emp || !emp.id) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                applyRemote('Employee', () => {
                    execute(`
            INSERT INTO Employee (id, name, role, pin, isActive, monthlySales, lastResetMonth, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name =           CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.name           ELSE excluded.name           END,
              role =           CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.role           ELSE excluded.role           END,
              pin =            CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.pin            ELSE excluded.pin            END,
              isActive =       CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.isActive       ELSE excluded.isActive       END,
              monthlySales =   CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.monthlySales   ELSE excluded.monthlySales   END,
              lastResetMonth = CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.lastResetMonth ELSE excluded.lastResetMonth END,
              syncStatus =     CASE WHEN Employee.syncStatus = 'PENDING' THEN 'PENDING'               ELSE 'SYNCED'                END,
              updatedAt =      CASE WHEN Employee.syncStatus = 'PENDING' THEN Employee.updatedAt      ELSE excluded.updatedAt      END
          `, [emp.id, emp.name, emp.role, emp.pin, emp.isActive ? 1 : 0, emp.monthlySales || 0, emp.lastResetMonth, dZ(emp.updatedAt)]);
                });
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Category' }, (payload) => {
            console.log('[SyncRealtime] Category change detected:', payload.eventType);
            const cat = payload.new as DbCategoryRow;
            if (!cat || !cat.id) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                applyRemote('Category', () => {
                    execute(`
          INSERT INTO Category (id, name, type, icon, sortOrder, isActive, syncStatus, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, 'SYNCED', ?)
          ON CONFLICT(id) DO UPDATE SET
            name =       CASE WHEN Category.syncStatus = 'PENDING' THEN Category.name      ELSE excluded.name      END,
            type =       CASE WHEN Category.syncStatus = 'PENDING' THEN Category.type      ELSE excluded.type      END,
            icon =       CASE WHEN Category.syncStatus = 'PENDING' THEN Category.icon      ELSE excluded.icon      END,
            sortOrder =  CASE WHEN Category.syncStatus = 'PENDING' THEN Category.sortOrder ELSE excluded.sortOrder END,
            isActive =   CASE WHEN Category.syncStatus = 'PENDING' THEN Category.isActive  ELSE excluded.isActive  END,
            syncStatus = CASE WHEN Category.syncStatus = 'PENDING' THEN 'PENDING'          ELSE 'SYNCED'           END,
            updatedAt =  CASE WHEN Category.syncStatus = 'PENDING' THEN Category.updatedAt ELSE excluded.updatedAt END
        `, [cat.id, cat.name, cat.type, cat.icon, cat.sortOrder, cat.isActive ? 1 : 0, dZ(cat.updatedAt)]);
                });
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Company' }, (payload) => {
            const co = payload.new as DbCompanyRow;
            if (!co?.id) return;
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                applyRemote('Company', () => {
                    execute(`
          INSERT INTO Company (id, name, billingEmail, phone, notes, isActive, syncStatus, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, 'SYNCED', ?)
          ON CONFLICT(id) DO UPDATE SET
            name =         CASE WHEN Company.syncStatus = 'PENDING' THEN Company.name         ELSE excluded.name         END,
            billingEmail = CASE WHEN Company.syncStatus = 'PENDING' THEN Company.billingEmail ELSE excluded.billingEmail END,
            phone =        CASE WHEN Company.syncStatus = 'PENDING' THEN Company.phone        ELSE excluded.phone        END,
            notes =        CASE WHEN Company.syncStatus = 'PENDING' THEN Company.notes        ELSE excluded.notes        END,
            isActive =     CASE WHEN Company.syncStatus = 'PENDING' THEN Company.isActive     ELSE excluded.isActive     END,
            syncStatus =   CASE WHEN Company.syncStatus = 'PENDING' THEN 'PENDING'            ELSE 'SYNCED'              END,
            updatedAt =    CASE WHEN Company.syncStatus = 'PENDING' THEN Company.updatedAt    ELSE excluded.updatedAt    END
        `, [co.id, co.name, co.billingEmail ?? null, co.phone ?? null, co.notes ?? null, co.isActive ? 1 : 0, dZ(co.updatedAt)]);
                });
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Client' }, (payload) => {
            console.log('[SyncRealtime] Client change detected:', payload.eventType);
            const client = payload.new as DbClientRow;
            if (!client || !client.id) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                applyRemote('Client', () => {
                    execute(`
          INSERT INTO Client (id, name, phone, email, type, company, cedula, code, companyId, notes, isActive, syncStatus, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
          ON CONFLICT(id) DO UPDATE SET
            name =       CASE WHEN Client.syncStatus = 'PENDING' THEN Client.name      ELSE excluded.name      END,
            phone =      CASE WHEN Client.syncStatus = 'PENDING' THEN Client.phone     ELSE excluded.phone     END,
            email =      CASE WHEN Client.syncStatus = 'PENDING' THEN Client.email     ELSE excluded.email     END,
            type =       CASE WHEN Client.syncStatus = 'PENDING' THEN Client.type      ELSE excluded.type      END,
            company =    CASE WHEN Client.syncStatus = 'PENDING' THEN Client.company   ELSE excluded.company   END,
            cedula =     CASE WHEN Client.syncStatus = 'PENDING' THEN Client.cedula    ELSE excluded.cedula    END,
            code =       CASE WHEN Client.syncStatus = 'PENDING' THEN Client.code      ELSE excluded.code      END,
            companyId =  CASE WHEN Client.syncStatus = 'PENDING' THEN Client.companyId ELSE excluded.companyId END,
            notes =      CASE WHEN Client.syncStatus = 'PENDING' THEN Client.notes     ELSE excluded.notes     END,
            isActive =   CASE WHEN Client.syncStatus = 'PENDING' THEN Client.isActive  ELSE excluded.isActive  END,
            syncStatus = CASE WHEN Client.syncStatus = 'PENDING' THEN 'PENDING'        ELSE 'SYNCED'           END,
            updatedAt =  CASE WHEN Client.syncStatus = 'PENDING' THEN Client.updatedAt ELSE excluded.updatedAt END
        `, [client.id, client.name, client.phone, client.email, client.type, client.company ?? null, client.cedula ?? null, client.code ?? null, client.companyId ?? null, client.notes, client.isActive ? 1 : 0, dZ(client.updatedAt)]);
                });
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Product' }, (payload) => {
            console.log('[SyncRealtime] Product change detected:', payload.eventType);
            const prod = payload.new as DbProductRow;
            if (!prod || !prod.id) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                applyRemote('Product', () => {
                    execute(`
          INSERT INTO Product (id, name, barcode, categoryId, subcategoryId, price, cost, unit, stockQty, minStock, isActive, isInfinite, isDeleted, imageUrl, syncStatus, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
          ON CONFLICT(id) DO UPDATE SET
            name =          CASE WHEN Product.syncStatus = 'PENDING' THEN Product.name          ELSE excluded.name          END,
            barcode =       CASE WHEN Product.syncStatus = 'PENDING' THEN Product.barcode       ELSE excluded.barcode       END,
            categoryId =    CASE WHEN Product.syncStatus = 'PENDING' THEN Product.categoryId    ELSE excluded.categoryId    END,
            subcategoryId = CASE WHEN Product.syncStatus = 'PENDING' THEN Product.subcategoryId ELSE excluded.subcategoryId END,
            price =         CASE WHEN Product.syncStatus = 'PENDING' THEN Product.price         ELSE excluded.price         END,
            cost =          CASE WHEN Product.syncStatus = 'PENDING' THEN Product.cost          ELSE excluded.cost          END,
            unit =          CASE WHEN Product.syncStatus = 'PENDING' THEN Product.unit          ELSE excluded.unit          END,
            stockQty =      CASE WHEN Product.syncStatus = 'PENDING' THEN Product.stockQty      ELSE excluded.stockQty      END,
            minStock =      CASE WHEN Product.syncStatus = 'PENDING' THEN Product.minStock      ELSE excluded.minStock      END,
            isActive =      CASE WHEN Product.syncStatus = 'PENDING' THEN Product.isActive      ELSE excluded.isActive      END,
            isInfinite =    CASE WHEN Product.syncStatus = 'PENDING' THEN Product.isInfinite    ELSE excluded.isInfinite    END,
            isDeleted =     CASE WHEN Product.syncStatus = 'PENDING' THEN Product.isDeleted     ELSE excluded.isDeleted     END,
            imageUrl =      CASE WHEN Product.syncStatus = 'PENDING' THEN Product.imageUrl      ELSE excluded.imageUrl      END,
            syncStatus =    CASE WHEN Product.syncStatus = 'PENDING' THEN 'PENDING'             ELSE 'SYNCED'               END,
            updatedAt =     CASE WHEN Product.syncStatus = 'PENDING' THEN Product.updatedAt     ELSE excluded.updatedAt     END
        `, [prod.id, prod.name, prod.barcode, prod.categoryId, prod.subcategoryId ?? null, prod.price, prod.cost, prod.unit, prod.stockQty, prod.minStock, prod.isActive ? 1 : 0, prod.isInfinite ? 1 : 0, prod.isDeleted ? 1 : 0, prod.imageUrl, dZ(prod.updatedAt)]);
                });
                if (prod.imageUrl && (payload.eventType === 'INSERT' || (payload.old as any)?.imageUrl !== prod.imageUrl)) {
                    if (!shouldSkipImage(prod.id, prod.imageUrl)) {
                        cacheProductImage(prod.id, prod.imageUrl).catch(() => { })
                    }
                }
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ProductSubcategory' }, (payload) => {
            // Un producto PENDING es la versión autoritativa hasta que suba: no se le
            // tocan las subcategorías desde remoto.
            const isPendingProduct = (productId: string) => {
                const row = get(`SELECT syncStatus FROM Product WHERE id = ?`, [productId]) as { syncStatus?: string } | undefined;
                return row?.syncStatus === 'PENDING';
            };
            if (payload.eventType === 'INSERT') {
                const ps = payload.new as DbProductSubcategoryRow;
                if (!ps?.productId || !ps?.subcategoryId) return;
                if (isPendingProduct(ps.productId)) return;
                applyRemote('Product', () => {
                    execute('INSERT OR IGNORE INTO ProductSubcategory (productId, subcategoryId) VALUES (?, ?)', [ps.productId, ps.subcategoryId]);
                });
            } else if (payload.eventType === 'DELETE') {
                const ps = payload.old as DbProductSubcategoryRow;
                if (!ps?.productId || !ps?.subcategoryId) return;
                if (isPendingProduct(ps.productId)) return;
                applyRemote('Product', () => {
                    execute('DELETE FROM ProductSubcategory WHERE productId = ? AND subcategoryId = ?', [ps.productId, ps.subcategoryId]);
                });
            }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'SinpeMessage' }, (payload) => {
            const msg = payload.new as DbSinpeMessageRow;
            if (!msg?.id) return;
            try {
                execute(`
                    INSERT INTO SinpeMessage (id, sender, body, receivedAt, isRead, deletedAt, syncStatus)
                    VALUES (?, ?, ?, ?, 0, ?, 'SYNCED')
                    ON CONFLICT(id) DO NOTHING
                `, [msg.id, msg.sender, msg.body, msg.receivedAt, msg.deletedAt ?? null]);
            } catch {}
            if (windowRef && !windowRef.isDestroyed()) {
                windowRef.webContents.send('sinpe:new-message', {
                    id: msg.id, sender: msg.sender, body: msg.body, receivedAt: msg.receivedAt, isRead: 0
                });
                windowRef.webContents.send('db-changed', { table: 'SinpeMessage' });
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'CashRegister' }, (payload) => {
            const reg = payload.new as DbCashRegisterRow;
            if (!reg?.id) return;
            if (isPendingLocally('CashRegister', reg.id)) return;
            applyRemote('CashRegister', () => {
                execute(`
                    INSERT INTO CashRegister (id, openedAt, closedAt, initialAmount, finalAmount, salesCash, salesCard, salesSinpe, salesTransfer, salesCredit, expensesTotal, notes, status, syncStatus, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
                    ON CONFLICT(id) DO UPDATE SET
                        openedAt = excluded.openedAt,
                        closedAt = excluded.closedAt,
                        initialAmount = excluded.initialAmount,
                        finalAmount = excluded.finalAmount,
                        salesCash = excluded.salesCash,
                        salesCard = excluded.salesCard,
                        salesSinpe = excluded.salesSinpe,
                        salesTransfer = excluded.salesTransfer,
                        salesCredit = excluded.salesCredit,
                        expensesTotal = excluded.expensesTotal,
                        notes = excluded.notes,
                        status = excluded.status,
                        syncStatus = 'SYNCED',
                        updatedAt = excluded.updatedAt
                `, [reg.id, dZ(reg.openedAt), dZ(reg.closedAt) ?? null, reg.initialAmount, reg.finalAmount ?? null, reg.salesCash ?? null, reg.salesCard ?? null, reg.salesSinpe ?? null, reg.salesTransfer ?? null, reg.salesCredit ?? null, reg.expensesTotal ?? null, reg.notes ?? null, reg.status, dZ(reg.updatedAt)]);
            });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Sale' }, (payload) => {
            const sale = payload.new as DbSaleRow;
            if (!sale?.id) return;
            // Skip if local sale is PENDING — avoid overwriting unsynced local changes
            if (isPendingLocally('Sale', sale.id)) return;
            applyRemote('Sale', () => {
                execute(`
                    INSERT INTO Sale (id, saleNumber, date, subtotal, discount, total, paymentMethod, amountReceived, change, cashRegisterId, isCredit, clientId, status, notes, syncStatus, updatedAt, companyId, consumerName, physicalInvoiceNumber, originalSaleSnapshot, modifiedFromSaleId, paidAt, paymentMethod2, amount2)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        saleNumber = excluded.saleNumber,
                        date = excluded.date,
                        subtotal = excluded.subtotal,
                        discount = excluded.discount,
                        total = excluded.total,
                        paymentMethod = excluded.paymentMethod,
                        amountReceived = excluded.amountReceived,
                        change = excluded.change,
                        cashRegisterId = excluded.cashRegisterId,
                        isCredit = excluded.isCredit,
                        clientId = excluded.clientId,
                        status = excluded.status,
                        notes = excluded.notes,
                        syncStatus = 'SYNCED',
                        updatedAt = excluded.updatedAt,
                        companyId = excluded.companyId,
                        consumerName = excluded.consumerName,
                        physicalInvoiceNumber = excluded.physicalInvoiceNumber,
                        originalSaleSnapshot = excluded.originalSaleSnapshot,
                        modifiedFromSaleId = excluded.modifiedFromSaleId,
                        paidAt = excluded.paidAt,
                        paymentMethod2 = excluded.paymentMethod2,
                        amount2 = excluded.amount2
                `, [sale.id, sale.saleNumber, d(sale.date), sale.subtotal, sale.discount, sale.total, sale.paymentMethod, sale.amountReceived ?? null, sale.change ?? null, sale.cashRegisterId ?? null, sale.isCredit ? 1 : 0, sale.clientId ?? null, sale.status, sale.notes ?? null, dZ(sale.updatedAt), sale.companyId ?? null, sale.consumerName ?? null, sale.physicalInvoiceNumber ?? null, sale.originalSaleSnapshot ?? null, sale.modifiedFromSaleId ?? null, dZ(sale.paidAt), sale.paymentMethod2 ?? null, sale.amount2 ?? null]);
            });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'SaleItem' }, (payload) => {
            const item = payload.new as DbSaleItemRow;
            if (!item?.id) return;
            // No tocar los ítems de una venta que todavía no subió: el push los reemplaza completos.
            if (isPendingLocally('Sale', item.saleId)) return;
            applyRemote('Sale', () => {
                execute(`
                    INSERT INTO SaleItem (id, saleId, productId, quantity, unitPrice, subtotal, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        saleId = excluded.saleId,
                        productId = excluded.productId,
                        quantity = excluded.quantity,
                        unitPrice = excluded.unitPrice,
                        subtotal = excluded.subtotal,
                        notes = excluded.notes
                `, [item.id, item.saleId, item.productId, item.quantity, item.unitPrice, item.subtotal, item.notes ?? null]);
            });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Expense' }, (payload) => {
            const exp = payload.new as DbExpenseRow;
            if (!exp?.id) return;
            if (isPendingLocally('Expense', exp.id)) return;
            applyRemote('Expense', () => {
                execute(`
                    INSERT INTO Expense (id, description, amount, categoryId, supplier, date, notes, cashRegisterId, syncStatus, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
                    ON CONFLICT(id) DO UPDATE SET
                        description = excluded.description,
                        amount = excluded.amount,
                        categoryId = excluded.categoryId,
                        supplier = excluded.supplier,
                        date = excluded.date,
                        notes = excluded.notes,
                        cashRegisterId = excluded.cashRegisterId,
                        syncStatus = 'SYNCED',
                        updatedAt = excluded.updatedAt
                `, [exp.id, exp.description, exp.amount, exp.categoryId, exp.supplier ?? null, d(exp.date), exp.notes ?? null, exp.cashRegisterId ?? null, d(exp.updatedAt)]);
            });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'InventoryMovement' }, (payload) => {
            const mov = payload.new as DbInventoryMovementRow;
            if (!mov?.id) return;
            if (isPendingLocally('InventoryMovement', mov.id)) return;
            applyRemote('InventoryMovement', () => {
                execute(`
                    INSERT INTO InventoryMovement (id, productId, type, quantity, cost, reference, notes, date, syncStatus)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED')
                    ON CONFLICT(id) DO UPDATE SET
                        productId = excluded.productId,
                        type = excluded.type,
                        quantity = excluded.quantity,
                        cost = excluded.cost,
                        reference = excluded.reference,
                        notes = excluded.notes,
                        date = excluded.date,
                        syncStatus = 'SYNCED'
                `, [mov.id, mov.productId, mov.type, mov.quantity, mov.cost ?? null, mov.reference ?? null, mov.notes ?? null, d(mov.date)]);
            });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Payment' }, (payload) => {
            const pay = payload.new as DbPaymentRow;
            if (!pay?.id) return;
            if (isPendingLocally('Payment', pay.id)) return;
            applyRemote('Payment', () => {
                execute(`
                    INSERT INTO Payment (id, clientId, amount, method, reference, notes, date, syncStatus)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED')
                    ON CONFLICT(id) DO UPDATE SET
                        clientId = excluded.clientId,
                        amount = excluded.amount,
                        method = excluded.method,
                        reference = excluded.reference,
                        notes = excluded.notes,
                        date = excluded.date,
                        syncStatus = 'SYNCED'
                `, [pay.id, pay.clientId, pay.amount, pay.method, pay.reference ?? null, pay.notes ?? null, d(pay.date)]);
            });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Sorteo' }, (payload) => {
            const s = payload.new as Record<string, unknown>;
            if (!s?.id) return;
            applyRemote('Sorteo', () => {
                execute(`
                    INSERT INTO Sorteo (id, name, type, status, startAt, endAt, minSpinsBetweenPrizes,
                        totalCards, prizeCount, slotsPerCard, cardSkin,
                        totalNumbers, pricePerNumber, sellStartDate, sellEndDate, drawDate, tombPrizes,
                        syncStatus, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = CASE WHEN Sorteo.syncStatus = 'PENDING' THEN Sorteo.name ELSE excluded.name END,
                        status = CASE WHEN Sorteo.syncStatus = 'PENDING' THEN Sorteo.status ELSE excluded.status END,
                        startAt = excluded.startAt,
                        endAt = excluded.endAt,
                        minSpinsBetweenPrizes = excluded.minSpinsBetweenPrizes,
                        totalCards = excluded.totalCards,
                        prizeCount = excluded.prizeCount,
                        slotsPerCard = excluded.slotsPerCard,
                        cardSkin = excluded.cardSkin,
                        totalNumbers = excluded.totalNumbers,
                        pricePerNumber = excluded.pricePerNumber,
                        sellStartDate = excluded.sellStartDate,
                        sellEndDate = excluded.sellEndDate,
                        drawDate = excluded.drawDate,
                        tombPrizes = excluded.tombPrizes,
                        syncStatus = CASE WHEN Sorteo.syncStatus = 'PENDING' THEN 'PENDING' ELSE 'SYNCED' END,
                        updatedAt = CASE WHEN Sorteo.syncStatus = 'PENDING' THEN Sorteo.updatedAt ELSE excluded.updatedAt END
                `, [s.id, s.name, s.type, s.status, s.startAt ?? null, s.endAt ?? null,
                    (s.minSpinsBetweenPrizes as number) ?? 8, s.totalCards ?? null, s.prizeCount ?? null,
                    s.slotsPerCard ?? null, s.cardSkin ?? null,
                    s.totalNumbers ?? null, s.pricePerNumber ?? null,
                    s.sellStartDate ?? null, s.sellEndDate ?? null, s.drawDate ?? null,
                    s.tombPrizes ?? null, s.createdAt, s.updatedAt]);
            });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'TombolaEntry' }, (payload) => {
            const entry = payload.new as DbTombolaEntryRow;
            if (!entry?.id) return;
            if (isPendingLocally('TombolaEntry', entry.id)) return;
            applyRemote('TombolaEntry', () => {
                execute(`
                    INSERT INTO TombolaEntry (id, sorteoId, number, participantName, participantCedula,
                        participantEmail, paymentMethod, price, saleRegisteredAt, isWinner, prizePosition,
                        syncStatus, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        participantName = excluded.participantName,
                        participantCedula = excluded.participantCedula,
                        participantEmail = excluded.participantEmail,
                        paymentMethod = excluded.paymentMethod,
                        price = excluded.price,
                        saleRegisteredAt = excluded.saleRegisteredAt,
                        isWinner = excluded.isWinner,
                        prizePosition = excluded.prizePosition,
                        syncStatus = 'SYNCED',
                        updatedAt = excluded.updatedAt
                `, [entry.id, entry.sorteoId, entry.number, entry.participantName, entry.participantCedula,
                    entry.participantEmail ?? null, entry.paymentMethod, entry.price,
                    entry.saleRegisteredAt ?? null, entry.isWinner ? 1 : 0, entry.prizePosition ?? null,
                    entry.createdAt, entry.updatedAt]);
            });
        })
        .subscribe();
}
