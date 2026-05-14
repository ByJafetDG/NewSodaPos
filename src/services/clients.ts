import { supabase } from '@/lib/supabase'
import { updateProductStock } from './products'
import type { Client } from '@/types'

type ClientInput = Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>

export async function getClients(): Promise<Client[]> {
    if (window.electronAPI) {
        const data = await window.electronAPI.dbQuery('SELECT * FROM Client ORDER BY name ASC')
        return data.map((c: any) => ({ ...c, isActive: !!c.isActive })) as unknown as Client[]
    }
    const { data, error } = await supabase.from('Client').select('*').order('name')
    if (error) throw error
    return (data ?? []) as unknown as Client[]
}

export async function createClient(input: ClientInput): Promise<Client> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const newClient: Client = {
        ...input,
        id,
        createdAt: new Date(now),
        updatedAt: new Date(now),
        syncStatus: 'PENDING'
    }

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `INSERT INTO Client (id, name, type, phone, email, notes, code, isActive, syncStatus, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'PENDING', ?, ?)`,
            [id, input.name, input.type, input.phone ?? null, input.email ?? null, input.notes ?? null, input.code ?? null, now, now]
        )
        return newClient
    }
    const { error } = await supabase.from('Client').insert({
        id, name: input.name, type: input.type,
        phone: input.phone ?? null, email: input.email ?? null,
        notes: input.notes ?? null, code: input.code ?? null, isActive: true,
        syncStatus: 'SYNCED', createdAt: now, updatedAt: now,
    })
    if (error) throw error
    return { ...newClient, syncStatus: 'SYNCED' }
}

export async function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        const fields = Object.entries(input)
            .map(([k]) => `${k} = ?`).join(', ')
        const values = Object.values(input).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v)
        await window.electronAPI.dbExecute(
            `UPDATE Client SET ${fields}, updatedAt = ?, syncStatus = 'PENDING' WHERE id = ?`,
            [...values, now, id]
        )
        // Note: This is partial, but for the sake of the return type:
        const updated = await window.electronAPI.dbGet('SELECT * FROM Client WHERE id = ?', [id])
        return updated as Client
    }
    const { data, error } = await supabase.from('Client').update({ ...input, updatedAt: now, syncStatus: 'SYNCED' }).eq('id', id).select().single()
    if (error) throw error
    return data as Client
}

export async function deleteClient(id: string): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute("DELETE FROM Client WHERE id = ?", [id])
        return
    }
    const { error } = await supabase.from('Client').delete().eq('id', id)
    if (error) throw error
}

export async function getCreditSales(clientId?: string): Promise<any[]> {
    if (window.electronAPI) {
        let sql = `
            SELECT s.*, si.id as item_id, si.productId, si.quantity, si.unitPrice, si.subtotal as item_subtotal,
                   p.name as product_name
            FROM Sale s
            LEFT JOIN SaleItem si ON si.saleId = s.id
            LEFT JOIN Product p ON p.id = si.productId
            WHERE s.isCredit = 1 AND s.status = 'COMPLETADA'
        `
        const params: any[] = []
        if (clientId) { sql += ' AND s.clientId = ?'; params.push(clientId) }
        sql += ' ORDER BY s.date DESC'
        const rows = await window.electronAPI.dbQuery(sql, params)
        return groupSaleRows(rows)
    }
    let query = supabase
        .from('Sale')
        .select('*, items:SaleItem(*, product:Product(id, name))')
        .eq('isCredit', true)
        .eq('status', 'COMPLETADA')
        .order('date', { ascending: false })
    if (clientId) query = query.eq('clientId', clientId)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
}

export async function settleSale(saleId: string): Promise<void> {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        const sale = await window.electronAPI.dbGet('SELECT total, clientId FROM Sale WHERE id = ?', [saleId])
        if (!sale) throw new Error('Venta no encontrada')
        const payRow = await window.electronAPI.dbGet(
            'SELECT COALESCE(SUM(amount), 0) as paid FROM Payment WHERE clientId = ?',
            [sale.clientId]
        )
        const paid = payRow?.paid ?? 0
        if (paid < sale.total) {
            throw new Error(`Pago insuficiente: el cliente tiene ₡${paid} en abonos pero la venta es de ₡${sale.total}`)
        }
        await window.electronAPI.dbExecute(
            "UPDATE Sale SET isCredit = 0, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
            [now, saleId]
        )
        return
    }
    const { data: sale, error: saleErr } = await supabase.from('Sale').select('total, clientId').eq('id', saleId).single()
    if (saleErr) throw saleErr
    const { data: payments } = await supabase.from('Payment').select('amount').eq('clientId', sale.clientId)
    const paid = (payments ?? []).reduce((sum: number, p: any) => sum + p.amount, 0)
    if (paid < sale.total) {
        throw new Error(`Pago insuficiente: el cliente tiene ₡${paid} en abonos pero la venta es de ₡${sale.total}`)
    }
    const { error } = await supabase.from('Sale').update({ isCredit: false, updatedAt: now, syncStatus: 'SYNCED' }).eq('id', saleId)
    if (error) throw error
}

export async function settleClientSales(clientId: string): Promise<void> {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            "UPDATE Sale SET isCredit = 0, syncStatus = 'PENDING', updatedAt = ? WHERE clientId = ? AND isCredit = 1 AND status = 'COMPLETADA'",
            [now, clientId]
        )
        return
    }
    const { error } = await supabase.from('Sale')
        .update({ isCredit: false, updatedAt: now, syncStatus: 'SYNCED' })
        .eq('clientId', clientId).eq('isCredit', true).eq('status', 'COMPLETADA')
    if (error) throw error
}

export async function getSalesByClient(clientId: string): Promise<any[]> {
    if (window.electronAPI) {
        const sql = `
            SELECT s.*, si.id as item_id, si.productId, si.quantity, si.unitPrice, si.subtotal as item_subtotal,
                   p.name as product_name
            FROM Sale s
            LEFT JOIN SaleItem si ON si.saleId = s.id
            LEFT JOIN Product p ON p.id = si.productId
            WHERE s.clientId = ? AND s.status = 'COMPLETADA'
            ORDER BY s.date DESC
        `
        const rows = await window.electronAPI.dbQuery(sql, [clientId])
        return groupSaleRows(rows)
    }
    const { data, error } = await supabase
        .from('Sale')
        .select('*, items:SaleItem(*, product:Product(id, name))')
        .eq('clientId', clientId)
        .eq('status', 'COMPLETADA')
        .order('date', { ascending: false })
    if (error) throw error
    return (data ?? []).map((s: any) => ({
        ...s,
        items: s.items ?? [],
        date: new Date(s.date),
    }))
}

function groupSaleRows(rows: any[]): any[] {
    const map = new Map<string, any>()
    for (const row of rows) {
        if (!map.has(row.id)) {
            map.set(row.id, {
                id: row.id, saleNumber: row.saleNumber,
                date: new Date(row.date), subtotal: row.subtotal,
                discount: row.discount, total: row.total,
                paymentMethod: row.paymentMethod, isCredit: !!row.isCredit,
                clientId: row.clientId, status: row.status,
                notes: row.notes, syncStatus: row.syncStatus,
                createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
                items: [],
            })
        }
        if (row.item_id) {
            map.get(row.id)!.items.push({
                id: row.item_id, saleId: row.id,
                productId: row.productId, quantity: row.quantity,
                unitPrice: row.unitPrice, subtotal: row.item_subtotal,
                product: { id: row.productId, name: row.product_name },
            })
        }
    }
    return Array.from(map.values())
}

export async function deleteCreditSale(saleId: string): Promise<void> {
    if (window.electronAPI) {
        const sale = await window.electronAPI.dbGet(
            'SELECT id, total, cashRegisterId, isCredit, status FROM Sale WHERE id = ?', [saleId]
        )
        if (!sale || !sale.isCredit || sale.status !== 'COMPLETADA') throw new Error('Venta no válida para eliminar')

        const items = await window.electronAPI.dbQuery(`
            SELECT si.productId, si.quantity, p.isInfinite
            FROM SaleItem si LEFT JOIN Product p ON p.id = si.productId
            WHERE si.saleId = ?
        `, [saleId])

        const now = new Date().toISOString()
        const ops: Array<{ sql: string; params: any[] }> = []

        for (const item of items) {
            if (!item.isInfinite) {
                ops.push({
                    sql: `UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ? AND isInfinite = 0`,
                    params: [item.quantity, now, item.productId],
                })
            }
        }
        ops.push({ sql: `DELETE FROM SaleItem WHERE saleId = ?`, params: [saleId] })
        ops.push({ sql: `DELETE FROM Sale WHERE id = ?`, params: [saleId] })

        await window.electronAPI.dbTransaction(ops)

        if (sale.cashRegisterId) {
            const reg = await window.electronAPI.dbGet('SELECT id, status FROM CashRegister WHERE id = ?', [sale.cashRegisterId])
            if (reg?.status === 'CLOSED') {
                await window.electronAPI.dbExecute(
                    `UPDATE CashRegister SET salesCredit = MAX(0, salesCredit - ?), syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
                    [sale.total, now, sale.cashRegisterId]
                )
            }
        }
        return
    }

    const { data: sale, error: saleErr } = await supabase
        .from('Sale').select('total, cashRegisterId, isCredit, status').eq('id', saleId).single()
    if (saleErr || !sale?.isCredit || sale.status !== 'COMPLETADA') throw new Error('Venta no válida para eliminar')

    const { data: saleItems } = await supabase
        .from('SaleItem').select('productId, quantity').eq('saleId', saleId)

    for (const item of (saleItems ?? []) as any[]) {
        await updateProductStock(item.productId, item.quantity)
    }

    await supabase.from('SaleItem').delete().eq('saleId', saleId)
    await supabase.from('Sale').delete().eq('id', saleId)

    if (sale.cashRegisterId) {
        const { data: reg } = await supabase
            .from('CashRegister').select('status, salesCredit').eq('id', sale.cashRegisterId).single()
        if (reg?.status === 'CLOSED') {
            const now = new Date().toISOString()
            await supabase.from('CashRegister').update({
                salesCredit: Math.max(0, (reg.salesCredit ?? 0) - sale.total),
                updatedAt: now,
            }).eq('id', sale.cashRegisterId)
        }
    }
}

export async function settleSaleDirect(
    saleId: string,
    opts?: {
        paymentMethod?: string
        cashRegisterId?: string | null
        amountReceived?: number | null
        change?: number | null
    }
): Promise<void> {
    const now = new Date().toISOString()

    if (window.electronAPI) {
        // Fetch original sale before update so we can fix the old closed register
        const origSale = opts?.cashRegisterId !== undefined
            ? await window.electronAPI.dbGet('SELECT total, cashRegisterId FROM Sale WHERE id = ?', [saleId])
            : null

        const sets = ["isCredit = 0", "paidAt = ?", "syncStatus = 'PENDING'", "updatedAt = ?"]
        const params: any[] = [now, now]
        if (opts?.paymentMethod)              { sets.push('paymentMethod = ?');   params.push(opts.paymentMethod) }
        if (opts?.cashRegisterId !== undefined){ sets.push('cashRegisterId = ?'); params.push(opts.cashRegisterId) }
        if (opts?.amountReceived !== undefined){ sets.push('amountReceived = ?'); params.push(opts.amountReceived) }
        if (opts?.change !== undefined)        { sets.push('"change" = ?');        params.push(opts.change) }
        params.push(saleId)
        await window.electronAPI.dbExecute(`UPDATE Sale SET ${sets.join(', ')} WHERE id = ?`, params)

        // If sale moved to a different register, remove it from old closed register's salesCredit
        if (origSale?.cashRegisterId && opts?.cashRegisterId !== origSale.cashRegisterId) {
            const reg = await window.electronAPI.dbGet(
                'SELECT id, status FROM CashRegister WHERE id = ?', [origSale.cashRegisterId]
            )
            if (reg?.status === 'CLOSED') {
                await window.electronAPI.dbExecute(
                    `UPDATE CashRegister SET salesCredit = MAX(0, salesCredit - ?), syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
                    [origSale.total, now, origSale.cashRegisterId]
                )
            }
        }
        return
    }

    // Supabase path: read original first, then update
    const { data: origSale } = opts?.cashRegisterId !== undefined
        ? await supabase.from('Sale').select('total, cashRegisterId').eq('id', saleId).single()
        : { data: null }

    const update: Record<string, any> = { isCredit: false, paidAt: now, updatedAt: now, syncStatus: 'SYNCED' }
    if (opts?.paymentMethod)               update.paymentMethod   = opts.paymentMethod
    if (opts?.cashRegisterId !== undefined) update.cashRegisterId = opts.cashRegisterId
    if (opts?.amountReceived !== undefined) update.amountReceived = opts.amountReceived
    if (opts?.change !== undefined)         update.change         = opts.change
    const { error } = await supabase.from('Sale').update(update).eq('id', saleId)
    if (error) throw error

    if (origSale?.cashRegisterId && opts?.cashRegisterId !== origSale.cashRegisterId) {
        const { data: reg } = await supabase
            .from('CashRegister').select('status, salesCredit').eq('id', origSale.cashRegisterId).single()
        if (reg?.status === 'CLOSED') {
            await supabase.from('CashRegister').update({
                salesCredit: Math.max(0, (reg.salesCredit ?? 0) - origSale.total),
                updatedAt: now,
            }).eq('id', origSale.cashRegisterId)
        }
    }
}
