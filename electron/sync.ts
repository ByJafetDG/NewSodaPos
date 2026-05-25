import { BrowserWindow } from 'electron';
import { supabase } from '../src/lib/supabase'; // We'll need to make sure this is compatible with Node.js
import db, { query, execute, get, transaction } from './db';
import type {
    DbEmployeeRow, DbCategoryRow, DbCompanyRow, DbClientRow, DbProductRow,
    DbProductSubcategoryRow, DbSinpeMessageRow, DbCashRegisterRow, DbSaleRow,
    DbSaleItemRow, DbExpenseRow, DbInventoryMovementRow, DbPaymentRow,
    DbEmailQueueRow, DbSubcategoryRow, DbBusinessConfigRow, DbTombolaEntryRow, DbSorteoRow,
} from '../src/types/db';

let windowRef: BrowserWindow | null = null;
let isPushing = false;
let pushDebounceTimer: ReturnType<typeof setTimeout> | undefined;

export function triggerPush() {
    if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
    pushDebounceTimer = setTimeout(async () => {
        if (isPushing) return;
        isPushing = true;
        try { await pushSync(); } finally { isPushing = false; }
    }, 500);
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
    const syncedTables = ['CashRegister','Employee','Client','Category','Subcategory','Product','Sale','Expense','InventoryMovement','Payment','SinpeMessage']
    for (const t of syncedTables) {
        try {
            execute(`DELETE FROM SyncError WHERE tableName = ? AND recordId IN (SELECT id FROM ${t} WHERE syncStatus = 'SYNCED')`, [t])
        } catch {}
    }
}

/**
 * Sync Engine - Handles background synchronization between SQLite and Supabase
 */
export async function startSyncEngine(mainWindow?: BrowserWindow, readOnly = false) {
    if (mainWindow) windowRef = mainWindow;
    console.log(`[SyncEngine] Starting... ${readOnly ? '(READ-ONLY — push disabled in dev mode)' : ''}`);

    // In dev/read-only mode, reset all local PENDING records to SYNCED so the
    // initial pullSync overwrites them with Supabase data instead of preserving stale local data.
    if (readOnly) {
        const masterTables = ['Product', 'Category', 'Client', 'Employee', 'Subcategory', 'CashRegister', 'Sale', 'Expense', 'InventoryMovement', 'Payment'];
        for (const t of masterTables) {
            try { execute(`UPDATE ${t} SET syncStatus = 'SYNCED' WHERE syncStatus = 'PENDING' OR syncStatus IS NULL`, []); } catch {}
        }
        console.log('[SyncEngine] Dev mode: reset local syncStatus to SYNCED — Supabase will overwrite on pull.');
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
async function pullSync() {
    console.log('[SyncEngine] Pulling updates from Supabase...');
    try {
        execute('PRAGMA foreign_keys = OFF');
        // 1. Sync Categories
        const { data: categories, error: catError } = await supabase.from('Category').select('*');
        if (catError) throw catError;

        if (categories) {
            transaction(() => {
                for (const cat of categories) {
                    execute(`
            INSERT INTO Category (id, name, type, icon, sortOrder, isActive, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              type = excluded.type,
              icon = excluded.icon,
              sortOrder = excluded.sortOrder,
              isActive = excluded.isActive,
              updatedAt = excluded.updatedAt
          `, [cat.id, cat.name, cat.type, cat.icon, cat.sortOrder, cat.isActive ? 1 : 0, cat.updatedAt]);
                }
            });
        }

        // 2. Sync Products
        const { data: products, error: prodError } = await supabase.from('Product').select('*');
        if (prodError) throw prodError;

        if (products) {
            transaction(() => {
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
        }

        // 3. Sync Companies
        const { data: companies, error: companyError } = await supabase.from('Company').select('*');
        if (companyError) throw companyError;
        if (companies) {
            transaction(() => {
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
        const { data: clients, error: clientError } = await supabase.from('Client').select('*');
        if (clientError) throw clientError;

        if (clients) {
            transaction(() => {
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
        const { data: expCats, error: expCatError } = await supabase.from('ExpenseCategory').select('*');
        if (expCatError) throw expCatError;
        if (expCats) {
            transaction(() => {
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
        const { data: configs, error: configError } = await supabase.from('BusinessConfig').select('*');
        if (configError) throw configError;
        if (configs) {
            transaction(() => {
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
        const { data: employees, error: empError } = await supabase.from('Employee').select('*');
        if (empError) throw empError;
        if (employees) {
            transaction(() => {
                for (const emp of employees) {
                    // We only overwrite monthlySales from remote if local is already SYNCED
                    // to avoid local increments being lost before they push
                    execute(`
            INSERT INTO Employee (id, name, role, pin, isActive, monthlySales, lastResetMonth, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              role = excluded.role,
              pin = excluded.pin,
              isActive = excluded.isActive,
              monthlySales = CASE WHEN syncStatus = 'SYNCED' THEN excluded.monthlySales ELSE monthlySales END,
              lastResetMonth = CASE WHEN syncStatus = 'SYNCED' THEN excluded.lastResetMonth ELSE lastResetMonth END,
              syncStatus = 'SYNCED',
              updatedAt = excluded.updatedAt
          `, [emp.id, emp.name, emp.role, emp.pin, emp.isActive ? 1 : 0, emp.monthlySales || 0, emp.lastResetMonth, emp.updatedAt]);
                }
            });
        }
        // 7. Sync ProductSubcategory junction table
        const { data: productSubcats, error: psError } = await supabase.from('ProductSubcategory').select('*');
        if (psError) throw psError;
        if (productSubcats) {
            transaction(() => {
                execute('DELETE FROM ProductSubcategory', []);
                for (const ps of productSubcats) {
                    execute(
                        'INSERT OR IGNORE INTO ProductSubcategory (productId, subcategoryId) VALUES (?, ?)',
                        [ps.productId, ps.subcategoryId]
                    );
                }
            });
        }

        // 8. Sync Subcategories (referenced by Product)
        const { data: subcategories, error: subError } = await supabase.from('Subcategory').select('*');
        if (subError) throw subError;
        if (subcategories) {
            transaction(() => {
                for (const sub of subcategories) {
                    execute(`
                        INSERT INTO Subcategory (id, categoryId, name, showDays, sortOrder, isActive, syncStatus, updatedAt)
                        VALUES (?, ?, ?, ?, ?, ?, 'SYNCED', ?)
                        ON CONFLICT(id) DO UPDATE SET
                          categoryId = excluded.categoryId,
                          name = excluded.name,
                          showDays = excluded.showDays,
                          sortOrder = excluded.sortOrder,
                          isActive = excluded.isActive,
                          syncStatus = 'SYNCED',
                          updatedAt = excluded.updatedAt
                    `, [sub.id, sub.categoryId, sub.name, sub.showDays ?? null, sub.sortOrder, sub.isActive ? 1 : 0, sub.updatedAt]);
                }
            });
        }

        // 8. Sync CashRegisters (parent of Sale and Expense)
        const { data: registers, error: regError } = await supabase.from('CashRegister').select('*').limit(1000);
        if (regError) throw regError;
        if (registers) {
            transaction(() => {
                for (const reg of registers) {
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
        const { data: sales, error: saleError } = await supabase.from('Sale').select('*').order('date', { ascending: false }).limit(2000);
        if (saleError) throw saleError;
        if (sales) {
            for (const sale of sales) {
                try {
                    // Skip if local sale is PENDING (not yet pushed) — avoid overwriting unsynced local changes
                    const localSale = get('SELECT syncStatus FROM Sale WHERE id = ?', [sale.id]) as { syncStatus: string } | undefined
                    if (localSale?.syncStatus === 'PENDING') continue
                    // Supabase es autoritativo en pull — eliminar venta local con mismo saleNumber pero distinto id
                    execute(`DELETE FROM SaleItem WHERE saleId IN (SELECT id FROM Sale WHERE saleNumber = ? AND id != ?)`, [sale.saleNumber, sale.id]);
                    execute(`DELETE FROM Sale WHERE saleNumber = ? AND id != ?`, [sale.saleNumber, sale.id]);
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
                } catch (e) {
                    console.error(`[SyncEngine] Sale pull ${sale.id} (#${sale.saleNumber}):`, e);
                }
            }
        }

        // 10. Sync SaleItems (depends on Sale, Product)
        const { data: saleItems, error: saleItemError } = await supabase.from('SaleItem').select('*').order('createdAt', { ascending: false }).limit(5000);
        if (saleItemError) throw saleItemError;
        if (saleItems) {
            transaction(() => {
                for (const item of saleItems) {
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
        const { data: expenses, error: expError } = await supabase.from('Expense').select('*');
        if (expError && expError.code !== 'PGRST205') throw expError;
        if (expenses) {
            transaction(() => {
                for (const exp of expenses) {
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
        const { data: movements, error: movError } = await supabase.from('InventoryMovement').select('*');
        if (movError) throw movError;
        if (movements) {
            transaction(() => {
                for (const mov of movements) {
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
        const { data: payments, error: payError } = await supabase.from('Payment').select('*');
        if (payError) throw payError;
        if (payments) {
            transaction(() => {
                for (const pay of payments) {
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
            transaction(() => {
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
        const { data: tombolaEntries, error: tombolaError } = await supabase.from('TombolaEntry').select('*');
        if (tombolaError && tombolaError.code !== 'PGRST205') throw tombolaError;
        if (tombolaEntries) {
            transaction(() => {
                for (const entry of tombolaEntries) {
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

        console.log('[SyncEngine] Pull items success.');

        // Notificar UI para que React Query invalide todas las queries afectadas
        for (const table of ['Product', 'Category', 'Subcategory', 'Client', 'Company', 'Employee', 'BusinessConfig', 'CashRegister', 'Sale', 'Expense', 'InventoryMovement', 'Payment', 'Sorteo', 'TombolaEntry']) {
            notifyUI(table);
        }
    } catch (err) {
        console.error('[SyncEngine] Pull failed:', err);
    } finally {
        execute('PRAGMA foreign_keys = ON');
    }
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
    if (isPushing) return [];
    isPushing = true;
    try { return await _pushSync(); } finally { isPushing = false; }
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

    const totalPending = pendingSales.length + pendingExpenses.length + pendingMovements.length +
        pendingRegisters.length + pendingPayments.length + pendingEmployees.length +
        pendingCompanies.length + pendingClients.length + pendingProducts.length + pendingCategories.length + pendingSubcategories.length +
        pendingConfig.length + pendingSinpe.length + pendingTombolaEntries.length + pendingSorteos.length;

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
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE CashRegister SET syncStatus = 'SYNCED' WHERE id = ?`, [reg.id]);
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
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE Employee SET syncStatus = 'SYNCED' WHERE id = ?`, [emp.id]);
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
                updatedAt: new Date().toISOString(),
            });
            if (error) throw error;
            execute(`UPDATE Company SET syncStatus = 'SYNCED' WHERE id = ?`, [co.id]);
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
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE Client SET syncStatus = 'SYNCED' WHERE id = ?`, [client.id]);
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
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE Category SET syncStatus = 'SYNCED' WHERE id = ?`, [cat.id]);
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
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE BusinessConfig SET syncStatus = 'SYNCED' WHERE id = ?`, [conf.id]);
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
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE Subcategory SET syncStatus = 'SYNCED' WHERE id = ?`, [sub.id]);
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
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE Product SET syncStatus = 'SYNCED' WHERE id = ?`, [prod.id]);
        } catch (err: any) {
            const errMsg: string = err?.message ?? String(err);
            if (errMsg.includes('Product_barcode_key')) {
                // Barcode conflict — null it out locally and retry without it
                execute(`UPDATE Product SET barcode = NULL WHERE id = ?`, [prod.id]);
                try {
                    const { error: retryErr } = await supabase.from('Product').upsert({
                        id: prod.id, name: prod.name, barcode: null,
                        categoryId: prod.categoryId, subcategoryId: prod.subcategoryId ?? null,
                        price: prod.price, cost: prod.cost, unit: prod.unit,
                        stockQty: prod.stockQty, minStock: prod.minStock,
                        isActive: !!prod.isActive, isInfinite: !!prod.isInfinite,
                        isDeleted: !!prod.isDeleted, imageUrl: prod.imageUrl,
                        updatedAt: new Date().toISOString()
                    });
                    if (retryErr) throw retryErr;
                    execute(`UPDATE Product SET syncStatus = 'SYNCED' WHERE id = ?`, [prod.id]);
                    const barcodeMsg = `"${prod.name}": barcode duplicado — eliminado automáticamente`;
                    console.log(`[SyncEngine] Product ${prod.id} (${prod.name}): barcode conflict resolved, barcode cleared.`);
                    persistSyncError('Product', prod.id, barcodeMsg);
                    if (windowRef && !windowRef.isDestroyed()) {
                        windowRef.webContents.send('sync-barcode-conflict', { productId: prod.id, productName: prod.name });
                    }
                } catch (retryErr: any) {
                    const msg = `Product ${prod.id} (${prod.name}) retry: ${retryErr?.message ?? retryErr}`;
                    logError(msg);
                    errors.push(msg);
                    persistSyncError('Product', prod.id, msg);
                }
            } else {
                const msg = `Product ${prod.id} (${prod.name}): ${errMsg}`;
                logError(msg);
                errors.push(msg);
                persistSyncError('Product', prod.id, msg);
            }
            continue;
        }
        // Sync ProductSubcategory for this product
        try {
            const subcatRows = query('SELECT subcategoryId FROM ProductSubcategory WHERE productId = ?', [prod.id]) as { subcategoryId: string }[];
            await supabase.from('ProductSubcategory').delete().eq('productId', prod.id);
            if (subcatRows.length > 0) {
                await supabase.from('ProductSubcategory').insert(
                    subcatRows.map(r => ({ productId: prod.id, subcategoryId: r.subcategoryId }))
                );
            }
        } catch (subErr: any) {
            logError(`ProductSubcategory for ${prod.id}: ${subErr?.message ?? subErr}`);
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
            execute(`UPDATE Sale SET syncStatus = 'SYNCED' WHERE id = ?`, [sale.id]);
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
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE Expense SET syncStatus = 'SYNCED' WHERE id = ?`, [exp.id]);
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
            execute(`UPDATE InventoryMovement SET syncStatus = 'SYNCED' WHERE id = ?`, [mov.id]);
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
            execute(`UPDATE Payment SET syncStatus = 'SYNCED' WHERE id = ?`, [pay.id]);
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
            execute(`UPDATE SinpeMessage SET syncStatus = 'SYNCED' WHERE id = ?`, [msg.id]);
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
                updatedAt: new Date().toISOString(),
            });
            if (error) throw error;
            execute(`UPDATE Sorteo SET syncStatus = 'SYNCED' WHERE id = ?`, [s.id]);
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
                updatedAt: new Date().toISOString(),
            });
            if (error) throw error;
            execute(`UPDATE TombolaEntry SET syncStatus = 'SYNCED' WHERE id = ?`, [entry.id]);
        } catch (err: any) {
            const msg = `TombolaEntry ${entry.id}: ${err?.message ?? err}`;
            logError(msg);
            errors.push(msg);
            persistSyncError('TombolaEntry', entry.id, msg);
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
                transaction(() => {
                    execute(`
            INSERT INTO Employee (id, name, role, pin, isActive, monthlySales, lastResetMonth, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              role = excluded.role,
              pin = excluded.pin,
              isActive = excluded.isActive,
              monthlySales = CASE WHEN syncStatus = 'SYNCED' THEN excluded.monthlySales ELSE monthlySales END,
              lastResetMonth = CASE WHEN syncStatus = 'SYNCED' THEN excluded.lastResetMonth ELSE lastResetMonth END,
              syncStatus = 'SYNCED',
              updatedAt = excluded.updatedAt
          `, [emp.id, emp.name, emp.role, emp.pin, emp.isActive ? 1 : 0, emp.monthlySales || 0, emp.lastResetMonth, emp.updatedAt]);
                });
                notifyUI('Employee');
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Category' }, (payload) => {
            console.log('[SyncRealtime] Category change detected:', payload.eventType);
            const cat = payload.new as DbCategoryRow;
            if (!cat || !cat.id) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                execute(`
          INSERT INTO Category (id, name, type, icon, sortOrder, isActive, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            icon = excluded.icon,
            sortOrder = excluded.sortOrder,
            isActive = excluded.isActive,
            updatedAt = excluded.updatedAt
        `, [cat.id, cat.name, cat.type, cat.icon, cat.sortOrder, cat.isActive ? 1 : 0, cat.updatedAt]);
                notifyUI('Category');
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Company' }, (payload) => {
            const co = payload.new as DbCompanyRow;
            if (!co?.id) return;
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                execute(`
          INSERT INTO Company (id, name, billingEmail, phone, notes, isActive, syncStatus, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, 'SYNCED', ?)
          ON CONFLICT(id) DO UPDATE SET
            name =         excluded.name,
            billingEmail = excluded.billingEmail,
            phone =        excluded.phone,
            notes =        excluded.notes,
            isActive =     excluded.isActive,
            syncStatus =   'SYNCED',
            updatedAt =    excluded.updatedAt
        `, [co.id, co.name, co.billingEmail ?? null, co.phone ?? null, co.notes ?? null, co.isActive ? 1 : 0, dZ(co.updatedAt)]);
                notifyUI('Company');
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Client' }, (payload) => {
            console.log('[SyncRealtime] Client change detected:', payload.eventType);
            const client = payload.new as DbClientRow;
            if (!client || !client.id) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                execute(`
          INSERT INTO Client (id, name, phone, email, type, company, cedula, code, companyId, notes, isActive, syncStatus, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            phone = excluded.phone,
            email = excluded.email,
            type = excluded.type,
            company = excluded.company,
            cedula = excluded.cedula,
            code = excluded.code,
            companyId = excluded.companyId,
            notes = excluded.notes,
            isActive = excluded.isActive,
            syncStatus = 'SYNCED',
            updatedAt = excluded.updatedAt
        `, [client.id, client.name, client.phone, client.email, client.type, client.company ?? null, client.cedula ?? null, client.code ?? null, client.companyId ?? null, client.notes, client.isActive ? 1 : 0, dZ(client.updatedAt)]);
                notifyUI('Client');
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Product' }, (payload) => {
            console.log('[SyncRealtime] Product change detected:', payload.eventType);
            const prod = payload.new as DbProductRow;
            if (!prod || !prod.id) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
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
                notifyUI('Product');
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ProductSubcategory' }, (payload) => {
            if (payload.eventType === 'INSERT') {
                const ps = payload.new as DbProductSubcategoryRow;
                if (!ps?.productId || !ps?.subcategoryId) return;
                try {
                    execute('INSERT OR IGNORE INTO ProductSubcategory (productId, subcategoryId) VALUES (?, ?)', [ps.productId, ps.subcategoryId]);
                } catch {}
                notifyUI('Product');
            } else if (payload.eventType === 'DELETE') {
                const ps = payload.old as DbProductSubcategoryRow;
                if (!ps?.productId || !ps?.subcategoryId) return;
                try {
                    execute('DELETE FROM ProductSubcategory WHERE productId = ? AND subcategoryId = ?', [ps.productId, ps.subcategoryId]);
                } catch {}
                notifyUI('Product');
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
            try {
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
            } catch (e) { console.error('[SyncRealtime] CashRegister:', e); }
            notifyUI('CashRegister');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Sale' }, (payload) => {
            const sale = payload.new as DbSaleRow;
            if (!sale?.id) return;
            try {
                // Skip if local sale is PENDING — avoid overwriting unsynced local changes
                const localSale = get('SELECT syncStatus FROM Sale WHERE id = ?', [sale.id]) as { syncStatus: string } | undefined
                if (localSale?.syncStatus === 'PENDING') return
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
            } catch (e) { console.error('[SyncRealtime] Sale:', e); }
            notifyUI('Sale');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'SaleItem' }, (payload) => {
            const item = payload.new as DbSaleItemRow;
            if (!item?.id) return;
            try {
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
            } catch (e) { console.error('[SyncRealtime] SaleItem:', e); }
            notifyUI('Sale');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Expense' }, (payload) => {
            const exp = payload.new as DbExpenseRow;
            if (!exp?.id) return;
            try {
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
            } catch (e) { console.error('[SyncRealtime] Expense:', e); }
            notifyUI('Expense');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'InventoryMovement' }, (payload) => {
            const mov = payload.new as DbInventoryMovementRow;
            if (!mov?.id) return;
            try {
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
            } catch (e) { console.error('[SyncRealtime] InventoryMovement:', e); }
            notifyUI('InventoryMovement');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Payment' }, (payload) => {
            const pay = payload.new as DbPaymentRow;
            if (!pay?.id) return;
            try {
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
            } catch (e) { console.error('[SyncRealtime] Payment:', e); }
            notifyUI('Payment');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Sorteo' }, (payload) => {
            const s = payload.new as Record<string, unknown>;
            if (!s?.id) return;
            try {
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
            } catch (e) { console.error('[SyncRealtime] Sorteo:', e); }
            notifyUI('Sorteo');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'TombolaEntry' }, (payload) => {
            const entry = payload.new as DbTombolaEntryRow;
            if (!entry?.id) return;
            try {
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
            } catch (e) { console.error('[SyncRealtime] TombolaEntry:', e); }
            notifyUI('TombolaEntry');
        })
        .subscribe();
}
