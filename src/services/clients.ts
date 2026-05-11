import { supabase } from '@/lib/supabase'
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

export async function createClient(input: ClientInput): Promise<void> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `INSERT INTO Client (id, name, type, phone, email, notes, code, isActive, syncStatus, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'PENDING', ?, ?)`,
            [id, input.name, input.type, input.phone ?? null, input.email ?? null, input.notes ?? null, input.code ?? null, now, now]
        )
        return
    }
    const { error } = await supabase.from('Client').insert({
        id, name: input.name, type: input.type,
        phone: input.phone ?? null, email: input.email ?? null,
        notes: input.notes ?? null, code: input.code ?? null, isActive: true,
        syncStatus: 'SYNCED', createdAt: now, updatedAt: now,
    })
    if (error) throw error
}

export async function updateClient(id: string, input: Partial<ClientInput>): Promise<void> {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        const fields = Object.entries(input)
            .map(([k]) => `${k} = ?`).join(', ')
        const values = Object.values(input).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v)
        await window.electronAPI.dbExecute(
            `UPDATE Client SET ${fields}, updatedAt = ?, syncStatus = 'PENDING' WHERE id = ?`,
            [...values, now, id]
        )
        return
    }
    const { error } = await supabase.from('Client').update({ ...input, updatedAt: now, syncStatus: 'SYNCED' }).eq('id', id)
    if (error) throw error
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
        await window.electronAPI.dbExecute(
            "UPDATE Sale SET isCredit = 0, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
            [now, saleId]
        )
        return
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
