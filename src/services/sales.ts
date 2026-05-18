import { supabase } from '@/lib/supabase'
import { updateProductStock } from './products'
import type { CartItem, PaymentMethod } from '@/types'

function localISO(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3,'0')}`
}

interface CreateSaleInput {
    items: CartItem[]
    subtotal: number
    discount: number
    total: number
    paymentMethod: PaymentMethod
    amountReceived: number | null
    change: number | null
    isCredit: boolean
    clientId: string | null
    cashRegisterId: string | null
    notes: string | null
    paymentMethod2?: PaymentMethod | null
    amount2?: number | null
    creditPart?: { clientId: string; amount: number } | null
    modifiedFromSaleId?: string | null
    companyId?: string | null
    consumerName?: string | null
    originalSaleSnapshot?: string | null
    physicalInvoiceNumber?: string | null
}

/**
 * Get next sale number (auto-increment)
 */
export async function getNextSaleNumber(): Promise<number> {
    let localMax = 0;
    if (window.electronAPI) {
        const data = await window.electronAPI.dbGet('SELECT MAX(saleNumber) as maxNum FROM Sale');
        localMax = data?.maxNum ?? 0;
    }

    // Try to get remote max for extra safety (avoid collisions with other devices)
    try {
        const { data: remoteData, error } = await supabase
            .from('Sale')
            .select('saleNumber')
            .order('saleNumber', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (!error && remoteData) {
            const remoteMax = remoteData.saleNumber ?? 0;
            return Math.max(localMax, remoteMax) + 1;
        }
    } catch (err) {
        console.warn('[SalesService] Could not fetch remote sale number, using local max:', err);
    }

    return localMax + 1;
}

/**
 * Create a complete sale with items and update stock
 */
export async function createSale(input: CreateSaleInput): Promise<any> {
    const saleNumber = await getNextSaleNumber()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        // Validate stock before committing — second line of defense after cartStore
        const ids = input.items.map(i => i.id)
        if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',')
            const stocks: any[] = await window.electronAPI.dbQuery(
                `SELECT id, name, stockQty, isInfinite FROM Product WHERE id IN (${placeholders})`,
                ids
            )
            for (const item of input.items) {
                const prod = stocks.find((s: any) => s.id === item.id)
                if (prod && !prod.isInfinite && prod.stockQty < item.quantity) {
                    throw new Error(`Stock insuficiente para "${prod.name}": disponible ${prod.stockQty}, solicitado ${item.quantity}`)
                }
            }
        }

        const ops: Array<{ sql: string; params: any[] }> = [
            {
                sql: `INSERT INTO Sale (id, saleNumber, date, subtotal, discount, total, paymentMethod, amountReceived, change, isCredit, clientId, cashRegisterId, status, notes, syncStatus, paymentMethod2, amount2, modifiedFromSaleId, companyId, consumerName, originalSaleSnapshot, physicalInvoiceNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [id, saleNumber, now, input.subtotal, input.discount, input.total, input.paymentMethod, input.amountReceived, input.change, input.isCredit ? 1 : 0, input.clientId, input.cashRegisterId, 'COMPLETADA', input.notes, 'PENDING', input.paymentMethod2 ?? null, input.amount2 ?? null, input.modifiedFromSaleId ?? null, input.companyId ?? null, input.consumerName ?? null, input.originalSaleSnapshot ?? null, input.physicalInvoiceNumber ?? null]
            }
        ]

        for (const item of input.items) {
            ops.push({
                sql: `INSERT INTO SaleItem (id, saleId, productId, quantity, unitPrice, subtotal, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), id, item.product.id, item.quantity, item.unitPrice, item.subtotal, item.notes]
            })
            ops.push({
                sql: `UPDATE Product SET stockQty = stockQty - ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ? AND isInfinite = 0`,
                params: [item.quantity, now, item.product.id]
            })
        }

        // Atomic Credit Part for mixed payments
        if (input.creditPart && input.creditPart.amount > 0) {
            const creditId = crypto.randomUUID()
            const creditSaleNumber = saleNumber + 1
            const creditAmt = input.creditPart.amount
            const creditNotes = `Cargo a cuenta. Ref. venta #${saleNumber}`
            
            ops.push({
                sql: `INSERT INTO Sale (id, saleNumber, date, subtotal, discount, total, paymentMethod, amountReceived, change, isCredit, clientId, cashRegisterId, status, notes, syncStatus, paymentMethod2, amount2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [creditId, creditSaleNumber, now, creditAmt, 0, creditAmt, 'CREDITO', null, null, 1, input.creditPart.clientId, input.cashRegisterId, 'COMPLETADA', creditNotes, 'PENDING', null, null]
            })
            ops.push({
                sql: `INSERT INTO SaleItem (id, saleId, productId, quantity, unitPrice, subtotal, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), creditId, 'credit-charge', 1, creditAmt, creditAmt, `Ref. venta #${saleNumber}`]
            })
        }

        await window.electronAPI.dbTransaction(ops)
        // Point 3: Immediate sync trigger (non-blocking)
        window.electronAPI.triggerSyncPush?.().catch(() => {})
        return { id, saleNumber, date: now, ...input }
    }

    // 1. Insert the sale (Cloud fallback)
    const { data: sale, error: saleError } = await supabase
        .from('Sale')
        .insert({
            id,
            saleNumber,
            date: now,
            subtotal: input.subtotal,
            discount: input.discount,
            total: input.total,
            paymentMethod: input.paymentMethod,
            amountReceived: input.amountReceived,
            change: input.change,
            isCredit: input.isCredit,
            clientId: input.clientId,
            cashRegisterId: input.cashRegisterId,
            status: 'COMPLETADA',
            notes: input.notes,
            syncStatus: 'SYNCED',
            createdAt: now,
            updatedAt: now,
            paymentMethod2: input.paymentMethod2 ?? null,
            amount2: input.amount2 ?? null,
            modifiedFromSaleId: input.modifiedFromSaleId ?? null,
            companyId: input.companyId ?? null,
            consumerName: input.consumerName ?? null,
        })
        .select('*')
        .single()

    if (saleError) throw saleError

    // Cloud fallback for Credit Part (Not strictly atomic but consistent with current logic)
    if (input.creditPart && input.creditPart.amount > 0) {
        const creditAmt = input.creditPart.amount
        const creditId = crypto.randomUUID()
        const creditSaleNumber = saleNumber + 1
        const { error: creditError } = await supabase.from('Sale').insert({
            id: creditId, saleNumber: creditSaleNumber, date: now,
            subtotal: creditAmt, discount: 0, total: creditAmt,
            paymentMethod: 'CREDITO', amountReceived: null, change: null,
            isCredit: true, clientId: input.creditPart.clientId, cashRegisterId: input.cashRegisterId,
            status: 'COMPLETADA', notes: `Cargo a cuenta. Ref. venta #${saleNumber}`,
            syncStatus: 'SYNCED', createdAt: now, updatedAt: now
        })
        if (!creditError) {
            await supabase.from('SaleItem').insert({
                id: crypto.randomUUID(), saleId: creditId, productId: 'credit-charge',
                quantity: 1, unitPrice: creditAmt, subtotal: creditAmt, notes: `Ref. venta #${saleNumber}`,
                createdAt: now
            })
        }
    }

    // 2. Insert sale items (each needs explicit id + createdAt for Supabase)
    const saleItems = input.items.map((item) => ({
        id: crypto.randomUUID(),
        saleId: sale.id,
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes,
        createdAt: now,
    }))

    if (saleItems.length > 0) {
        const { error: itemsError } = await supabase
            .from('SaleItem')
            .insert(saleItems)
        if (itemsError) throw itemsError
    }

    // 3. Update stock for each product (decrease)
    for (const item of input.items) {
        await updateProductStock(item.id, -item.quantity)
    }

    return {
        ...sale,
        items: input.items
    }
}

/**
 * Get today's sales
 */
export async function getSalesToday() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
        .from('Sale')
        .select('*, items:SaleItem(*, product:Product(name))')
        .gte('date', today.toISOString())
        .order('date', { ascending: false })

    if (error) throw error
    return data
}

function methodToRegisterColumn(method: string): string | null {
    switch (method) {
        case 'EFECTIVO':      return 'salesCash'
        case 'SINPE':         return 'salesSinpe'
        case 'TARJETA':       return 'salesCard'
        case 'TRANSFERENCIA': return 'salesTransfer'
        case 'CREDITO':       return 'salesCredit'
        default:              return null
    }
}

/**
 * Void a sale atomically: mark ANULADA, revert stock, adjust CLOSED cash register columns
 */
export async function voidSale(saleId: string): Promise<void> {
    const now = new Date().toISOString()

    if (window.electronAPI) {
        const sale = await window.electronAPI.dbGet(
            'SELECT status, total, paymentMethod, paymentMethod2, amount2, cashRegisterId FROM Sale WHERE id = ?',
            [saleId]
        )
        if (!sale) throw new Error('Venta no encontrada')
        if (sale.status === 'ANULADA') return

        const items: any[] = await window.electronAPI.dbQuery(
            'SELECT productId, quantity FROM SaleItem WHERE saleId = ?',
            [saleId]
        )

        const ops: Array<{ sql: string; params: any[] }> = []
        ops.push({
            sql: `UPDATE Sale SET status = 'ANULADA', isCredit = 0, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
            params: [now, saleId]
        })
        for (const item of items) {
            ops.push({
                sql: `UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ? AND isInfinite = 0`,
                params: [item.quantity, now, item.productId]
            })
        }
        if (sale.cashRegisterId) {
            const reg = await window.electronAPI.dbGet(
                'SELECT status FROM CashRegister WHERE id = ?',
                [sale.cashRegisterId]
            )
            if (reg?.status === 'CLOSED') {
                const col = methodToRegisterColumn(sale.paymentMethod)
                if (col) {
                    ops.push({
                        sql: `UPDATE CashRegister SET ${col} = MAX(0, COALESCE(${col}, 0) - ?), syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
                        params: [sale.total, now, sale.cashRegisterId]
                    })
                }
                if (sale.paymentMethod2 && sale.amount2) {
                    const col2 = methodToRegisterColumn(sale.paymentMethod2)
                    if (col2) {
                        ops.push({
                            sql: `UPDATE CashRegister SET ${col2} = MAX(0, COALESCE(${col2}, 0) - ?), syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
                            params: [sale.amount2, now, sale.cashRegisterId]
                        })
                    }
                }
            }
        }
        await window.electronAPI.dbTransaction(ops)
        window.electronAPI.triggerSyncPush?.().catch(() => {})
        return
    }

    const { data: sale, error: fetchError } = await supabase
        .from('Sale')
        .select('status, total, paymentMethod, paymentMethod2, amount2, cashRegisterId, items:SaleItem(productId, quantity)')
        .eq('id', saleId)
        .single()
    if (fetchError) throw fetchError
    if (sale.status === 'ANULADA') return

    const { error: updateError } = await supabase
        .from('Sale')
        .update({ status: 'ANULADA', isCredit: false, updatedAt: now, syncStatus: 'SYNCED' })
        .eq('id', saleId)
    if (updateError) throw updateError

    for (const item of (sale.items ?? [])) {
        await updateProductStock(item.productId, item.quantity)
    }
}

/**
 * Fetch sale items mapped to CartItem format for cart restoration (modify flow)
 */
export async function getSaleItemsForCart(saleId: string): Promise<import('@/types').CartItem[]> {
    if (window.electronAPI) {
        const rows: any[] = await window.electronAPI.dbQuery(
            `SELECT si.productId, si.quantity, si.unitPrice, si.subtotal, si.notes,
                    p.name, p.barcode, p.categoryId, p.price, p.cost, p.unit,
                    p.stockQty, p.minStock, p.isActive, p.isInfinite, p.imageUrl, p.syncStatus
             FROM SaleItem si
             LEFT JOIN Product p ON p.id = si.productId
             WHERE si.saleId = ? AND si.productId != 'credit-charge'`,
            [saleId]
        )
        return rows
            .filter(r => r.name)
            .map(r => ({
                id: r.productId,
                product: {
                    id: r.productId,
                    name: r.name,
                    barcode: r.barcode ?? null,
                    categoryId: r.categoryId,
                    price: r.price,
                    cost: r.cost,
                    unit: r.unit,
                    stockQty: r.stockQty,
                    minStock: r.minStock,
                    isActive: r.isActive === 1,
                    isInfinite: r.isInfinite === 1,
                    imageUrl: r.imageUrl ?? null,
                    syncStatus: r.syncStatus,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                quantity: r.quantity,
                unitPrice: r.unitPrice,
                subtotal: r.subtotal,
                notes: r.notes ?? null,
            }))
    }
    const { data, error } = await supabase
        .from('SaleItem')
        .select('productId, quantity, unitPrice, subtotal, notes, product:Product(id, name, barcode, categoryId, price, cost, unit, stockQty, minStock, isActive, isInfinite, imageUrl, syncStatus, createdAt, updatedAt)')
        .eq('saleId', saleId)
        .neq('productId', 'credit-charge')
    if (error) throw error
    return ((data ?? []) as any[])
        .filter((r: any) => r.product)
        .map((r: any) => ({
            id: r.productId,
            product: r.product,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            subtotal: r.subtotal,
            notes: r.notes ?? null,
        }))
}

// ===== Update Credit Sale Items =====
export async function updateCreditSaleItems(
    saleId: string,
    updatedItems: Array<{ id: string; productId: string; quantity: number; unitPrice: number; oldQuantity: number }>
): Promise<void> {
    const now = new Date().toISOString()
    const newTotal = updatedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

    if (window.electronAPI) {
        const ops: Array<{ sql: string; params: any[] }> = []

        for (const item of updatedItems) {
            ops.push({
                sql: `UPDATE SaleItem SET quantity = ?, unitPrice = ? WHERE id = ?`,
                params: [item.quantity, item.unitPrice, item.id]
            })
            const delta = item.oldQuantity - item.quantity
            if (delta !== 0) {
                ops.push({
                    sql: `UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ? AND isInfinite = 0`,
                    params: [delta, now, item.productId]
                })
            }
        }

        ops.push({
            sql: `UPDATE Sale SET total = ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
            params: [newTotal, now, saleId]
        })

        await window.electronAPI.dbTransaction(ops)
        window.electronAPI.triggerSyncPush?.().catch(() => {})
        return
    }

    for (const item of updatedItems) {
        const { error } = await supabase.from('SaleItem').update({ quantity: item.quantity, unitPrice: item.unitPrice }).eq('id', item.id)
        if (error) throw error
        const delta = item.oldQuantity - item.quantity
        if (delta !== 0) await updateProductStock(item.productId, delta)
    }
    const { error } = await supabase.from('Sale').update({ total: newTotal, updatedAt: now }).eq('id', saleId)
    if (error) throw error
}

interface SplitClientAssignment {
    clientId: string
    clientName: string
    products: { productId: string; amount: number }[]
}

interface CreateSplitCreditSalesInput {
    clientAssignments: SplitClientAssignment[]
    cartItems: CartItem[]
    cashRegisterId: string | null
    cashierName: string | null
}

export async function createSplitCreditSales(input: CreateSplitCreditSalesInput): Promise<{ baseSaleNumber: number }> {
    const now = new Date().toISOString()
    const baseSaleNumber = await getNextSaleNumber()

    if (window.electronAPI) {
        const ops: Array<{ sql: string; params: any[] }> = []

        const allNames = input.clientAssignments.map(c => c.clientName)
        input.clientAssignments.forEach((client, idx) => {
            const saleId = crypto.randomUUID()
            const saleNumber = baseSaleNumber + idx
            const clientTotal = client.products.reduce((s, p) => s + p.amount, 0)
            const otherNames = allNames.filter(n => n !== client.clientName).join(', ')
            ops.push({
                sql: `INSERT INTO Sale (id, saleNumber, date, subtotal, discount, total, paymentMethod, amountReceived, change, isCredit, clientId, cashRegisterId, status, notes, syncStatus, paymentMethod2, amount2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [saleId, saleNumber, now, clientTotal, 0, clientTotal, 'CREDITO', null, null, 1, client.clientId, input.cashRegisterId, 'COMPLETADA', `Crédito dividido. Cajero: ${input.cashierName ?? 'Sin cajero'}`, 'PENDING', null, null]
            })
            for (const p of client.products) {
                const cartItem = input.cartItems.find(i => i.id === p.productId)
                const totalPrice = cartItem?.subtotal ?? p.amount
                const itemNote = `Dividido con ${otherNames} (precio total ₡${totalPrice})`
                ops.push({
                    sql: `INSERT INTO SaleItem (id, saleId, productId, quantity, unitPrice, subtotal, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    params: [crypto.randomUUID(), saleId, p.productId, 1, p.amount, p.amount, itemNote]
                })
            }
        })

        for (const item of input.cartItems) {
            ops.push({
                sql: `UPDATE Product SET stockQty = stockQty - ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ? AND isInfinite = 0`,
                params: [item.quantity, now, item.id]
            })
        }

        await window.electronAPI.dbTransaction(ops)
        window.electronAPI.triggerSyncPush?.().catch(() => {})
        return { baseSaleNumber }
    }

    const allNames = input.clientAssignments.map(c => c.clientName)
    for (let idx = 0; idx < input.clientAssignments.length; idx++) {
        const client = input.clientAssignments[idx]
        const saleId = crypto.randomUUID()
        const saleNumber = baseSaleNumber + idx
        const clientTotal = client.products.reduce((s, p) => s + p.amount, 0)
        const otherNames = allNames.filter(n => n !== client.clientName).join(', ')

        const { data: sale, error: saleError } = await supabase
            .from('Sale')
            .insert({
                id: saleId, saleNumber, date: now,
                subtotal: clientTotal, discount: 0, total: clientTotal,
                paymentMethod: 'CREDITO', amountReceived: null, change: null,
                isCredit: true, clientId: client.clientId, cashRegisterId: input.cashRegisterId,
                status: 'COMPLETADA',
                notes: `Crédito dividido. Cajero: ${input.cashierName ?? 'Sin cajero'}`,
                syncStatus: 'SYNCED', createdAt: now, updatedAt: now,
                paymentMethod2: null, amount2: null,
            })
            .select('id')
            .single()

        if (saleError) throw saleError

        const saleItems = client.products.map(p => {
            const cartItem = input.cartItems.find(i => i.id === p.productId)
            const totalPrice = cartItem?.subtotal ?? p.amount
            return {
                id: crypto.randomUUID(), saleId: sale.id,
                productId: p.productId, quantity: 1,
                unitPrice: p.amount, subtotal: p.amount,
                notes: `Dividido con ${otherNames} (precio total ₡${totalPrice})`,
                createdAt: now,
            }
        })
        if (saleItems.length > 0) {
            const { error: itemsError } = await supabase.from('SaleItem').insert(saleItems)
            if (itemsError) throw itemsError
        }
    }

    for (const item of input.cartItems) {
        await updateProductStock(item.id, -item.quantity)
    }

    return { baseSaleNumber }
}

interface CreateCreditNoteInput {
    items: CartItem[]
    subtotal: number
    discount: number
    total: number
    clientId: string
    notes?: string | null
}

export async function createCreditNote(input: CreateCreditNoteInput): Promise<{ id: string; saleNumber: number; date: string }> {
    const saleNumber = await getNextSaleNumber()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        const ops: Array<{ sql: string; params: any[] }> = [
            {
                sql: `INSERT INTO Sale (id, saleNumber, date, subtotal, discount, total, paymentMethod, amountReceived, change, isCredit, clientId, cashRegisterId, status, notes, syncStatus, paymentMethod2, amount2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [id, saleNumber, now, input.subtotal, input.discount, input.total, 'CREDITO', null, null, 1, input.clientId, null, 'COMPLETADA', input.notes ?? null, 'PENDING', null, null]
            }
        ]
        for (const item of input.items) {
            ops.push({
                sql: `INSERT INTO SaleItem (id, saleId, productId, quantity, unitPrice, subtotal, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), id, item.product.id, item.quantity, item.unitPrice, item.subtotal, item.notes]
            })
        }
        await window.electronAPI.dbTransaction(ops)
        window.electronAPI.triggerSyncPush?.().catch(() => {})
        return { id, saleNumber, date: now }
    }

    const { data: sale, error: saleError } = await supabase
        .from('Sale')
        .insert({
            id, saleNumber, date: now,
            subtotal: input.subtotal, discount: input.discount, total: input.total,
            paymentMethod: 'CREDITO', amountReceived: null, change: null,
            isCredit: true, clientId: input.clientId, cashRegisterId: null,
            status: 'COMPLETADA', notes: input.notes ?? null,
            syncStatus: 'SYNCED', createdAt: now, updatedAt: now,
            paymentMethod2: null, amount2: null,
        })
        .select('id, saleNumber, date')
        .single()
    if (saleError) throw saleError

    const saleItems = input.items.map(item => ({
        id: crypto.randomUUID(), saleId: sale.id,
        productId: item.product.id, quantity: item.quantity,
        unitPrice: item.unitPrice, subtotal: item.subtotal,
        notes: item.notes, createdAt: now,
    }))
    if (saleItems.length > 0) {
        const { error: itemsError } = await supabase.from('SaleItem').insert(saleItems)
        if (itemsError) throw itemsError
    }
    return { id: sale.id, saleNumber: sale.saleNumber, date: sale.date }
}

/**
 * Get all sales linked to a company (with items)
 */
export async function getSalesForCompany(companyId: string): Promise<any[]> {
    if (window.electronAPI) {
        const sales: any[] = await window.electronAPI.dbQuery(
            `SELECT * FROM Sale WHERE companyId = ? ORDER BY date DESC`,
            [companyId]
        )
        const result: any[] = []
        for (const sale of sales) {
            const items: any[] = await window.electronAPI.dbQuery(
                `SELECT si.id, si.quantity, si.unitPrice, si.subtotal, si.notes,
                        COALESCE(p.name, 'Producto eliminado') as productName
                 FROM SaleItem si LEFT JOIN Product p ON p.id = si.productId
                 WHERE si.saleId = ?`,
                [sale.id]
            )
            result.push({
                ...sale,
                isCredit: !!sale.isCredit,
                items: items.map((i: any) => ({ ...i, product: { name: i.productName } })),
            })
        }
        return result
    }
    const { data, error } = await supabase
        .from('Sale')
        .select('*, items:SaleItem(id, quantity, unitPrice, subtotal, notes, product:Product(name))')
        .eq('companyId', companyId)
        .order('date', { ascending: false })
    if (error) throw error
    return data ?? []
}

/**
 * Get lightweight summary of all company-linked sales (no items) for list cards
 */
export async function getAllCompanySales(): Promise<{ id: string; companyId: string; total: number; isCredit: boolean; status: string; paidAt: string | null }[]> {
    if (window.electronAPI) {
        const data: any[] = await window.electronAPI.dbQuery(
            `SELECT id, companyId, total, isCredit, status, paidAt FROM Sale WHERE companyId IS NOT NULL`,
            []
        )
        return data.map((s: any) => ({ ...s, isCredit: !!s.isCredit }))
    }
    const { data, error } = await supabase
        .from('Sale')
        .select('id, companyId, total, isCredit, status, paidAt')
        .not('companyId', 'is', null)
    if (error) throw error
    return (data ?? []).map((s: any) => ({ ...s }))
}

/**
 * Fetch a single sale with items for comparison view
 */
export async function getSaleDetails(saleId: string): Promise<any | null> {
    if (window.electronAPI) {
        const sale = await window.electronAPI.dbGet(
            `SELECT s.*, c.name as clientName FROM Sale s LEFT JOIN Client c ON s.clientId = c.id WHERE s.id = ?`,
            [saleId]
        )
        if (!sale) return null
        const items: any[] = await window.electronAPI.dbQuery(
            `SELECT si.productId, si.quantity, si.unitPrice, si.subtotal, si.notes,
                    COALESCE(p.name, 'Producto eliminado') as productName
             FROM SaleItem si LEFT JOIN Product p ON si.productId = p.id
             WHERE si.saleId = ?`,
            [saleId]
        )
        return {
            ...sale,
            isCredit: !!sale.isCredit,
            items: items.map((i: any) => ({ ...i, product: { name: i.productName } })),
        }
    }
    const { data, error } = await supabase
        .from('Sale')
        .select('*, client:Client(name), items:SaleItem(productId, quantity, unitPrice, subtotal, notes, product:Product(name))')
        .eq('id', saleId)
        .single()
    if (error || !data) return null
    return data
}

export async function getVoidedSales(): Promise<any[]> {
    if (window.electronAPI) {
        return await window.electronAPI.dbQuery(`
            SELECT s.id, s.saleNumber, s.date, s.total, s.paymentMethod, s.consumerName,
                   c.name as clientName
            FROM Sale s
            LEFT JOIN Client c ON s.clientId = c.id
            WHERE s.status = 'ANULADA'
            ORDER BY s.date DESC
        `)
    }
    const { data } = await supabase
        .from('Sale')
        .select('id, saleNumber, date, total, paymentMethod, consumerName, client:Client(name)')
        .eq('status', 'ANULADA')
        .order('date', { ascending: false })
    return data ?? []
}
