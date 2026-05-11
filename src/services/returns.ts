import { supabase } from '@/lib/supabase'
import { updateProductStock } from './products'
import type { Sale, ReturnRecord, ReturnType } from '@/types'

interface CreateReturnInput {
    originalSaleId: string | null
    originalSaleNumber: number | null
    type: ReturnType
    cashRegisterId: string | null
    employeeName: string | null
    notes: string | null
    inItems: Array<{ productId: string; quantity: number; unitPrice: number }>
    outItems: Array<{ productId: string; quantity: number; unitPrice: number }>
}

async function getNextReturnNumber(): Promise<number> {
    if (window.electronAPI) {
        const row = await window.electronAPI.dbGet('SELECT MAX(returnNumber) as maxNum FROM "Return"')
        return (row?.maxNum ?? 0) + 1
    }
    const { data } = await supabase
        .from('Return')
        .select('returnNumber')
        .order('returnNumber', { ascending: false })
        .limit(1)
        .maybeSingle()
    return (data?.returnNumber ?? 0) + 1
}

export async function getSaleByNumber(saleNumber: number): Promise<Sale | null> {
    if (window.electronAPI) {
        const sale = await window.electronAPI.dbGet(
            'SELECT * FROM Sale WHERE saleNumber = ?', [saleNumber]
        )
        if (!sale) return null
        const items = await window.electronAPI.dbQuery(`
            SELECT si.*, p.name as productName, p.price as productPrice, p.id as pid
            FROM SaleItem si
            LEFT JOIN Product p ON si.productId = p.id
            WHERE si.saleId = ?
        `, [sale.id])
        return {
            ...sale,
            date: new Date(sale.date),
            createdAt: new Date(sale.createdAt),
            updatedAt: new Date(sale.updatedAt),
            isCredit: !!sale.isCredit,
            items: items.map((i: any) => ({
                ...i,
                createdAt: new Date(i.createdAt),
                product: { id: i.pid, name: i.productName, price: i.productPrice },
            })),
        } as Sale
    }
    const { data } = await supabase
        .from('Sale')
        .select('*, items:SaleItem(*, product:Product(id, name, price))')
        .eq('saleNumber', saleNumber)
        .maybeSingle()
    if (!data) return null
    return {
        ...data,
        date: new Date(data.date),
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
    } as Sale
}

export async function createReturn(input: CreateReturnInput): Promise<ReturnRecord> {
    const id = crypto.randomUUID()
    const returnNumber = await getNextReturnNumber()
    const now = new Date().toISOString()

    const returnedValue = input.inItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const exchangedValue = input.outItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const netCash = returnedValue - exchangedValue

    if (window.electronAPI) {
        const ops: Array<{ sql: string; params: any[] }> = [
            {
                sql: `INSERT INTO "Return" (id, returnNumber, originalSaleId, type, cashRegisterId, netCash, employeeName, notes, date, syncStatus, createdAt, updatedAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
                params: [id, returnNumber, input.originalSaleId, input.type, input.cashRegisterId, netCash, input.employeeName, input.notes, now, now, now],
            },
            ...input.inItems.map(item => ({
                sql: `INSERT INTO ReturnItem (id, returnId, direction, productId, quantity, unitPrice, subtotal) VALUES (?, ?, 'IN', ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), id, item.productId, item.quantity, item.unitPrice, item.quantity * item.unitPrice],
            })),
            ...input.outItems.map(item => ({
                sql: `INSERT INTO ReturnItem (id, returnId, direction, productId, quantity, unitPrice, subtotal) VALUES (?, ?, 'OUT', ?, ?, ?, ?)`,
                params: [crypto.randomUUID(), id, item.productId, item.quantity, item.unitPrice, item.quantity * item.unitPrice],
            })),
            ...input.inItems.map(item => ({
                sql: `UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ? AND isInfinite = 0`,
                params: [item.quantity, now, item.productId],
            })),
            ...input.outItems.map(item => ({
                sql: `UPDATE Product SET stockQty = stockQty - ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ? AND isInfinite = 0`,
                params: [item.quantity, now, item.productId],
            })),
        ]
        await window.electronAPI.dbTransaction(ops)
        return { id, returnNumber, originalSaleId: input.originalSaleId, originalSaleNumber: input.originalSaleNumber, type: input.type, cashRegisterId: input.cashRegisterId, netCash, employeeName: input.employeeName, notes: input.notes, items: [], date: new Date(now), syncStatus: 'PENDING' }
    }

    const { data: ret, error } = await supabase.from('Return').insert({
        id, returnNumber, originalSaleId: input.originalSaleId, type: input.type,
        cashRegisterId: input.cashRegisterId, netCash, employeeName: input.employeeName,
        notes: input.notes, date: now, syncStatus: 'SYNCED', createdAt: now, updatedAt: now,
    }).select().single()
    if (error) throw error

    const returnItems = [
        ...input.inItems.map(i => ({ id: crypto.randomUUID(), returnId: id, direction: 'IN', productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.quantity * i.unitPrice })),
        ...input.outItems.map(i => ({ id: crypto.randomUUID(), returnId: id, direction: 'OUT', productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.quantity * i.unitPrice })),
    ]
    if (returnItems.length > 0) {
        const { error: itemsErr } = await supabase.from('ReturnItem').insert(returnItems)
        if (itemsErr) throw itemsErr
    }

    for (const item of input.inItems) await updateProductStock(item.productId, item.quantity)
    for (const item of input.outItems) await updateProductStock(item.productId, -item.quantity)

    return { ...ret, date: new Date(ret.date), items: [] } as ReturnRecord
}

export async function getReturns(limit = 50): Promise<ReturnRecord[]> {
    if (window.electronAPI) {
        const rows = await window.electronAPI.dbQuery(`
            SELECT r.*, s.saleNumber as originalSaleNumber
            FROM "Return" r
            LEFT JOIN Sale s ON r.originalSaleId = s.id
            ORDER BY r.date DESC LIMIT ?
        `, [limit])
        return rows.map((r: any) => ({ ...r, date: new Date(r.date), items: [] }))
    }
    const { data, error } = await supabase
        .from('Return')
        .select('*, originalSale:Sale(saleNumber)')
        .order('date', { ascending: false })
        .limit(limit)
    if (error) throw error
    return (data ?? []).map((r: any) => ({
        ...r, originalSaleNumber: r.originalSale?.saleNumber ?? null,
        date: new Date(r.date), items: [],
    }))
}

export type RecentSaleRow = {
    id: string
    saleNumber: number
    date: string
    total: number
    paymentMethod: string
}

export async function getRecentSales(limit = 50): Promise<RecentSaleRow[]> {
    if (window.electronAPI) {
        return await window.electronAPI.dbQuery(`
            SELECT id, saleNumber, date, total, paymentMethod
            FROM Sale WHERE status = 'COMPLETADA'
            ORDER BY date DESC LIMIT ?
        `, [limit])
    }
    const { data, error } = await supabase
        .from('Sale')
        .select('id, saleNumber, date, total, paymentMethod')
        .eq('status', 'COMPLETADA')
        .order('date', { ascending: false })
        .limit(limit)
    if (error) throw error
    return data ?? []
}

export async function getReturnWithItems(returnId: string): Promise<ReturnRecord | null> {
    if (window.electronAPI) {
        const ret = await window.electronAPI.dbGet(`
            SELECT r.*, s.saleNumber as originalSaleNumber
            FROM "Return" r LEFT JOIN Sale s ON r.originalSaleId = s.id
            WHERE r.id = ?
        `, [returnId])
        if (!ret) return null
        const items = await window.electronAPI.dbQuery(`
            SELECT ri.*, p.name as productName FROM ReturnItem ri
            LEFT JOIN Product p ON ri.productId = p.id
            WHERE ri.returnId = ?
        `, [returnId])
        return {
            ...ret,
            date: new Date(ret.date),
            items: items.map((i: any) => ({ ...i, productName: i.productName ?? i.productId })),
        }
    }
    const { data, error } = await supabase
        .from('Return')
        .select('*, originalSale:Sale(saleNumber), items:ReturnItem(*, product:Product(name))')
        .eq('id', returnId)
        .single()
    if (error || !data) return null
    return {
        ...data,
        originalSaleNumber: data.originalSale?.saleNumber ?? null,
        date: new Date(data.date),
        items: (data.items ?? []).map((i: any) => ({ ...i, productName: i.product?.name ?? i.productId })),
    } as ReturnRecord
}
