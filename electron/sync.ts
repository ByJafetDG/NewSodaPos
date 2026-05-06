import { BrowserWindow } from 'electron';
import { supabase } from '../src/lib/supabase'; // We'll need to make sure this is compatible with Node.js
import db, { query, execute, get, transaction } from './db';

let windowRef: BrowserWindow | null = null;

function notifyUI(table: string) {
    if (windowRef && !windowRef.isDestroyed()) {
        windowRef.webContents.send('db-changed', { table });
    }
}

/**
 * Sync Engine - Handles background synchronization between SQLite and Supabase
 */
export async function startSyncEngine(mainWindow?: BrowserWindow) {
    if (mainWindow) windowRef = mainWindow;
    console.log('[SyncEngine] Starting...');

    // HOTFIX: Resolve saleNumber conflicts by shifting pending sales forward once
    // This clears the conflict with existing sales in Supabase (like #60, #61)
    try {
        const result = execute("UPDATE Sale SET saleNumber = saleNumber + 1000, updatedAt = ? WHERE syncStatus = 'PENDING' AND saleNumber < 1000", [new Date().toISOString()]);
        if (result.changes > 0) {
            console.log(`[SyncEngine] Hotfix: Shifted ${result.changes} pending sales to avoid conflicts.`);
        }
    } catch (err) {
        console.error('[SyncEngine] Hotfix failed:', err);
    }

    // Run pull sync (Supabase -> SQLite) in the background so it doesn't block startup
    pullSync().then(() => {
        // Start Realtime subscriptions after initial pull
        setupRealtimeSubscriptions();
    }).catch(err => {
        console.error('[SyncEngine] Initial pull failed:', err);
    });

    // Setup intervals for periodic sync
    setInterval(pushSync, 15000);  // Push every 15s (Faster for sales tracking)
    setInterval(pullSync, 300000); // Pull every 5m (Safety fallback only)
    setInterval(processEmailQueue, 60000); // Retry emails every 1m
}

/**
 * EMAIL QUEUE: Retries sending failed email receipts
 */
async function processEmailQueue() {
    try {
        const pendingEmails = query(`SELECT * FROM EmailQueue WHERE status = 'PENDING' AND attempts < 5`) as any[];
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
            INSERT INTO Product (id, name, barcode, categoryId, price, cost, unit, stockQty, minStock, isActive, imageUrl, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              barcode = excluded.barcode,
              categoryId = excluded.categoryId,
              price = excluded.price,
              cost = excluded.cost,
              unit = excluded.unit,
              stockQty = excluded.stockQty,
              minStock = excluded.minStock,
              isActive = excluded.isActive,
              imageUrl = excluded.imageUrl,
              syncStatus = 'SYNCED',
              updatedAt = excluded.updatedAt
          `, [prod.id, prod.name, prod.barcode, prod.categoryId, prod.price, prod.cost, prod.unit, prod.stockQty, prod.minStock, prod.isActive ? 1 : 0, prod.imageUrl, prod.updatedAt]);
                }
            });
        }

        // 3. Sync Clients
        const { data: clients, error: clientError } = await supabase.from('Client').select('*');
        if (clientError) throw clientError;

        if (clients) {
            transaction(() => {
                for (const client of clients) {
                    execute(`
            INSERT INTO Client (id, name, phone, email, type, company, notes, isActive, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              phone = excluded.phone,
              email = excluded.email,
              type = excluded.type,
              company = excluded.company,
              notes = excluded.notes,
              isActive = excluded.isActive,
              syncStatus = 'SYNCED',
              updatedAt = excluded.updatedAt
          `, [client.id, client.name, client.phone, client.email, client.type, client.company, client.notes, client.isActive ? 1 : 0, client.updatedAt]);
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
            INSERT INTO BusinessConfig (id, name, address, phone, ticketHeader, ticketFooter, printerPort, printerModel, drawerEnabled, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              address = excluded.address,
              phone = excluded.phone,
              ticketHeader = excluded.ticketHeader,
              ticketFooter = excluded.ticketFooter,
              printerPort = excluded.printerPort,
              printerModel = excluded.printerModel,
              drawerEnabled = excluded.drawerEnabled,
              updatedAt = excluded.updatedAt
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
        console.log('[SyncEngine] Pull items success.');
    } catch (err) {
        console.error('[SyncEngine] Pull failed:', err);
    }
}

/**
 * PUSH SYNC: SQLite -> Supabase
 * Uploads transactional data (Sales, Expenses, Movements)
 */
async function pushSync() {
    // Check for pending items across all tables first to avoid noisy logs
    const pendingSales = query(`SELECT * FROM Sale WHERE syncStatus = 'PENDING'`) as any[];
    const pendingExpenses = query(`SELECT * FROM Expense WHERE syncStatus = 'PENDING'`) as any[];
    const pendingMovements = query(`SELECT * FROM InventoryMovement WHERE syncStatus = 'PENDING'`) as any[];
    const pendingRegisters = query(`SELECT * FROM CashRegister WHERE syncStatus = 'PENDING'`) as any[];
    const pendingPayments = query(`SELECT * FROM Payment WHERE syncStatus = 'PENDING'`) as any[];
    const pendingEmployees = query(`SELECT * FROM Employee WHERE syncStatus = 'PENDING'`) as any[];
    const pendingClients = query(`SELECT * FROM Client WHERE syncStatus = 'PENDING'`) as any[];
    const pendingProducts = query(`SELECT * FROM Product WHERE syncStatus = 'PENDING'`) as any[];
    const pendingCategories = query(`SELECT * FROM Category WHERE syncStatus = 'PENDING'`) as any[];

    const totalPending = pendingSales.length + pendingExpenses.length + pendingMovements.length +
        pendingRegisters.length + pendingPayments.length + pendingEmployees.length +
        pendingClients.length + pendingProducts.length + pendingCategories.length;

    if (totalPending === 0) return; // Silent if nothing to push

    console.log(`[SyncEngine] Pushing ${totalPending} changes to Supabase...`);

    // 1. Process Sales
    for (const sale of pendingSales) {
        try {
            const items = query(`SELECT * FROM SaleItem WHERE saleId = ?`, [sale.id]);

            // Upload sale
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
                updatedAt: new Date().toISOString()
            });

            if (saleError) throw saleError;

            // Upload items
            for (const item of items as any[]) {
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

            // Mark as synced
            execute(`UPDATE Sale SET syncStatus = 'SYNCED' WHERE id = ?`, [sale.id]);
        } catch (err) {
            console.error(`[SyncEngine] Failed to push sale ${sale.id}:`, err);
        }
    }

    // 2. Process Expenses
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
        } catch (err) {
            console.error(`[SyncEngine] Failed to push expense ${exp.id}:`, err);
        }
    }

    // 3. Process Inventory Movements
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
                date: mov.date
            });
            if (error) throw error;
            execute(`UPDATE InventoryMovement SET syncStatus = 'SYNCED' WHERE id = ?`, [mov.id]);
        } catch (err) {
            console.error(`[SyncEngine] Failed to push movement ${mov.id}:`, err);
        }
    }

    // 4. Process Cash Registers
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
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE CashRegister SET syncStatus = 'SYNCED' WHERE id = ?`, [reg.id]);
        } catch (err) {
            console.error(`[SyncEngine] Failed to push cash register ${reg.id}:`, err);
        }
    }

    // 5. Process Payments
    for (const pay of pendingPayments) {
        try {
            const { error } = await supabase.from('Payment').upsert({
                id: pay.id,
                clientId: pay.clientId,
                amount: pay.amount,
                method: pay.method,
                reference: pay.reference,
                notes: pay.notes,
                date: pay.date
            });
            if (error) throw error;
            execute(`UPDATE Payment SET syncStatus = 'SYNCED' WHERE id = ?`, [pay.id]);
        } catch (err) {
            console.error(`[SyncEngine] Failed to push payment ${pay.id}:`, err);
        }
    }

    // 6. Process Employees
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
        } catch (err) {
            console.error(`[SyncEngine] Failed to push employee ${emp.id}:`, err);
        }
    }

    // 7. Process Clients
    for (const client of pendingClients) {
        try {
            const { error } = await supabase.from('Client').upsert({
                id: client.id,
                name: client.name,
                phone: client.phone,
                email: client.email,
                type: client.type,
                company: client.company,
                notes: client.notes,
                isActive: !!client.isActive,
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE Client SET syncStatus = 'SYNCED' WHERE id = ?`, [client.id]);
        } catch (err) {
            console.error(`[SyncEngine] Failed to push client ${client.id}:`, err);
        }
    }

    // 8. Process Categories
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
        } catch (err) {
            console.error(`[SyncEngine] Failed to push category ${cat.id}:`, err);
        }
    }

    // 9. Process Products
    for (const prod of pendingProducts) {
        try {
            const { error } = await supabase.from('Product').upsert({
                id: prod.id,
                name: prod.name,
                barcode: prod.barcode,
                categoryId: prod.categoryId,
                price: prod.price,
                cost: prod.cost,
                unit: prod.unit,
                stockQty: prod.stockQty,
                minStock: prod.minStock,
                isActive: !!prod.isActive,
                imageUrl: prod.imageUrl,
                updatedAt: new Date().toISOString()
            });
            if (error) throw error;
            execute(`UPDATE Product SET syncStatus = 'SYNCED' WHERE id = ?`, [prod.id]);
        } catch (err) {
            console.error(`[SyncEngine] Failed to push product ${prod.id}:`, err);
        }
    }

    console.log('[SyncEngine] Push cycle complete.');
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
            const emp = payload.new as any;
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
            const cat = payload.new as any;
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Client' }, (payload) => {
            console.log('[SyncRealtime] Client change detected:', payload.eventType);
            const client = payload.new as any;
            if (!client || !client.id) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                execute(`
          INSERT INTO Client (id, name, phone, email, type, company, notes, isActive, syncStatus, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            phone = excluded.phone,
            email = excluded.email,
            type = excluded.type,
            company = excluded.company,
            notes = excluded.notes,
            isActive = excluded.isActive,
            syncStatus = 'SYNCED',
            updatedAt = excluded.updatedAt
        `, [client.id, client.name, client.phone, client.email, client.type, client.company, client.notes, client.isActive ? 1 : 0, client.updatedAt]);
                notifyUI('Client');
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Product' }, (payload) => {
            console.log('[SyncRealtime] Product change detected:', payload.eventType);
            const prod = payload.new as any;
            if (!prod || !prod.id) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                execute(`
          INSERT INTO Product (id, name, barcode, categoryId, price, cost, unit, stockQty, minStock, isActive, imageUrl, syncStatus, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            barcode = excluded.barcode,
            categoryId = excluded.categoryId,
            price = excluded.price,
            cost = excluded.cost,
            unit = excluded.unit,
            stockQty = excluded.stockQty,
            minStock = excluded.minStock,
            isActive = excluded.isActive,
            imageUrl = excluded.imageUrl,
            syncStatus = 'SYNCED',
            updatedAt = excluded.updatedAt
        `, [prod.id, prod.name, prod.barcode, prod.categoryId, prod.price, prod.cost, prod.unit, prod.stockQty, prod.minStock, prod.isActive ? 1 : 0, prod.imageUrl, prod.updatedAt]);
                notifyUI('Product');
            }
        })
        .subscribe();
}
