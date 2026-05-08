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
    const now = localISO()

    if (window.electronAPI) {
        // Offline-first operation: All in local SQLite
        await window.electronAPI.dbExecute(`
            INSERT INTO Sale (
                id, saleNumber, date, subtotal, discount, total, paymentMethod, 
                amountReceived, change, isCredit, clientId, cashRegisterId, status, notes, syncStatus
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id, saleNumber, now, input.subtotal, input.discount, input.total,
            input.paymentMethod, input.amountReceived, input.change,
            input.isCredit ? 1 : 0, input.clientId, input.cashRegisterId, 'COMPLETADA', input.notes, 'PENDING'
        ]);

        for (const item of input.items) {
            const itemId = crypto.randomUUID();
            await window.electronAPI.dbExecute(`
                INSERT INTO SaleItem (id, saleId, productId, quantity, unitPrice, subtotal, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [itemId, id, item.id, item.quantity, item.unitPrice, item.subtotal, item.notes]);

            // Update local stock via local version of updateProductStock
            await updateProductStock(item.id, -item.quantity);
        }

        return {
            id,
            saleNumber,
            date: now,
            ...input
        };
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
        })
        .select('*')
        .single()

    if (saleError) throw saleError

    // 2. Insert sale items (each needs explicit id + createdAt for Supabase)
    const saleItems = input.items.map((item) => ({
        id: crypto.randomUUID(),
        saleId: sale.id,
        productId: item.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes,
        createdAt: now,
    }))

    const { error: itemsError } = await supabase
        .from('SaleItem')
        .insert(saleItems)

    if (itemsError) throw itemsError

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

/**
 * Void a sale (cancel it and revert stock)
 */
export async function voidSale(saleId: string): Promise<void> {
    const now = new Date().toISOString()

    // 1. Get the sale and its items to know what to revert
    let items: any[] = []
    let currentStatus = ''

    if (window.electronAPI) {
        const sale = await window.electronAPI.dbGet('SELECT status FROM Sale WHERE id = ?', [saleId])
        if (!sale) throw new Error('Venta no encontrada')
        currentStatus = sale.status
        items = await window.electronAPI.dbQuery('SELECT productId, quantity FROM SaleItem WHERE saleId = ?', [saleId])
    } else {
        const { data: sale, error: fetchError } = await supabase
            .from('Sale')
            .select('status, items:SaleItem(productId, quantity)')
            .eq('id', saleId)
            .single()

        if (fetchError) throw fetchError
        currentStatus = sale.status
        items = sale.items
    }

    if (currentStatus === 'ANULADA') return // Already voided

    // 2. Void the sale
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            "UPDATE Sale SET status = 'ANULADA', updatedAt = ?, syncStatus = 'PENDING' WHERE id = ?",
            [now, saleId]
        )
    } else {
        const { error: updateError } = await supabase
            .from('Sale')
            .update({ status: 'ANULADA', updatedAt: now, syncStatus: 'SYNCED' })
            .eq('id', saleId)

        if (updateError) throw updateError
    }

    // 3. Revert stock (add back the quantities)
    for (const item of items) {
        await updateProductStock(item.productId, item.quantity)
    }
}

// ===== Update Credit Sale Items =====
export async function updateCreditSaleItems(
    saleId: string,
    updatedItems: Array<{ id: string; productId: string; quantity: number; unitPrice: number; oldQuantity: number }>
): Promise<void> {
    const now = new Date().toISOString()
    const newTotal = updatedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

    if (window.electronAPI) {
        for (const item of updatedItems) {
            await window.electronAPI.dbExecute(
                "UPDATE SaleItem SET quantity = ?, unitPrice = ? WHERE id = ?",
                [item.quantity, item.unitPrice, item.id]
            )
            const delta = item.oldQuantity - item.quantity
            if (delta !== 0) {
                await window.electronAPI.dbExecute(
                    "UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
                    [delta, now, item.productId]
                )
            }
        }
        await window.electronAPI.dbExecute(
            "UPDATE Sale SET total = ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
            [newTotal, now, saleId]
        )
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
