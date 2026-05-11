import { supabase } from '@/lib/supabase'
import type { Sale } from '@/types'

function parseEmployeeName(notes: string | null): string | null {
    if (!notes) return null
    const match = notes.match(/^Cajero: (.+)$/)
    if (!match) return null
    return match[1] === 'Sin cajero' ? null : match[1]
}

// ===== Open Register =====
export async function openRegister(initialAmount: number) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(`
            INSERT INTO CashRegister (id, openedAt, initialAmount, status, syncStatus, updatedAt)
            VALUES (?, ?, ?, 'OPEN', 'PENDING', ?)
        `, [id, now, initialAmount, now]);
        return id;
    }

    const { data, error } = await supabase
        .from('CashRegister')
        .insert({
            id,
            initialAmount,
            openedAt: now,
            status: 'OPEN',
            syncStatus: 'SYNCED',
            updatedAt: now,
        })
        .select('id')
        .single()

    if (error) throw error
    return data.id
}

// ===== Get Active Register =====
// salesCash/Sinpe/etc. are only written at close time — compute live from Sale table
export async function getActiveRegister() {
    if (window.electronAPI) {
        const result = await window.electronAPI.dbGet(`
            SELECT
                cr.*,
                COALESCE((SELECT SUM(CASE WHEN paymentMethod2 IS NULL THEN total ELSE total - COALESCE(amount2,0) END) FROM Sale WHERE cashRegisterId = cr.id AND paymentMethod = 'EFECTIVO' AND status = 'COMPLETADA'), 0) as salesCash,
                COALESCE((SELECT SUM(CASE WHEN paymentMethod = 'SINPE' AND paymentMethod2 IS NULL THEN total WHEN paymentMethod2 = 'SINPE' THEN COALESCE(amount2,0) ELSE 0 END) FROM Sale WHERE cashRegisterId = cr.id AND status = 'COMPLETADA'), 0) as salesSinpe,
                COALESCE((SELECT SUM(CASE WHEN paymentMethod = 'CREDITO' AND paymentMethod2 IS NULL THEN total WHEN paymentMethod2 = 'CREDITO' THEN COALESCE(amount2,0) ELSE 0 END) FROM Sale WHERE cashRegisterId = cr.id AND status = 'COMPLETADA'), 0) as salesCredit,
                COALESCE((SELECT SUM(amount) FROM CashAdjustment WHERE cashRegisterId = cr.id AND direction = 'IN'), 0) as adjustmentsIn,
                COALESCE((SELECT SUM(amount) FROM CashAdjustment WHERE cashRegisterId = cr.id AND direction = 'OUT'), 0) as adjustmentsOut
            FROM CashRegister cr
            WHERE cr.status = 'OPEN'
            ORDER BY cr.openedAt DESC
            LIMIT 1
        `);
        return result ?? null;
    }

    const { data: register, error } = await supabase
        .from('CashRegister')
        .select('*')
        .eq('status', 'OPEN')
        .order('openedAt', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) throw error
    if (!register) return null

    const { data: sales } = await supabase
        .from('Sale')
        .select('total, paymentMethod, paymentMethod2, amount2, isCredit')
        .eq('cashRegisterId', register.id)
        .eq('status', 'COMPLETADA')

    const s = sales ?? []
    const salesCashVal = s.filter(x => x.paymentMethod === 'EFECTIVO').reduce((sum, x) => sum + x.total - (x.paymentMethod2 ? (x.amount2 ?? 0) : 0), 0)
    const salesSinpeVal = s.filter(x => x.paymentMethod === 'SINPE' && !x.paymentMethod2).reduce((sum, x) => sum + x.total, 0)
        + s.filter(x => x.paymentMethod2 === 'SINPE').reduce((sum, x) => sum + (x.amount2 ?? 0), 0)
    const salesCreditVal = s.filter(x => x.paymentMethod === 'CREDITO' && !x.paymentMethod2).reduce((sum, x) => sum + x.total, 0)
        + s.filter(x => x.paymentMethod2 === 'CREDITO').reduce((sum, x) => sum + (x.amount2 ?? 0), 0)

    const { data: adjs } = await supabase
        .from('CashAdjustment')
        .select('direction, amount')
        .eq('cashRegisterId', register.id)

    return {
        ...register,
        salesCash: salesCashVal,
        salesSinpe: salesSinpeVal,
        salesCredit: salesCreditVal,
        adjustmentsIn: (adjs ?? []).filter(a => a.direction === 'IN').reduce((s, a) => s + a.amount, 0),
        adjustmentsOut: (adjs ?? []).filter(a => a.direction === 'OUT').reduce((s, a) => s + a.amount, 0),
    }
}

// ===== Close Register =====
export async function closeRegister(registerId: string, finalAmount: number, notes: string | null = null) {
    const now = new Date().toISOString()

    if (window.electronAPI) {
        // Calculation summary locally
        const sales = await window.electronAPI.dbQuery(`
            SELECT total, paymentMethod, paymentMethod2, amount2, isCredit FROM Sale
            WHERE cashRegisterId = ? AND status = 'COMPLETADA'
        `, [registerId]);

        const salesCash = sales
            .filter((s: any) => s.paymentMethod === 'EFECTIVO')
            .reduce((sum: number, s: any) => sum + s.total - (s.paymentMethod2 ? (s.amount2 ?? 0) : 0), 0);
        const salesSinpe = sales
            .filter((s: any) => s.paymentMethod === 'SINPE' && !s.paymentMethod2)
            .reduce((sum: number, s: any) => sum + s.total, 0)
            + sales
            .filter((s: any) => s.paymentMethod2 === 'SINPE')
            .reduce((sum: number, s: any) => sum + (s.amount2 ?? 0), 0);
        const salesCredit = sales
            .filter((s: any) => s.isCredit === 1 && !s.paymentMethod2)
            .reduce((sum: number, s: any) => sum + s.total, 0)
            + sales
            .filter((s: any) => s.paymentMethod2 === 'CREDITO')
            .reduce((sum: number, s: any) => sum + (s.amount2 ?? 0), 0);

        const expenses = await window.electronAPI.dbQuery(`
            SELECT amount FROM Expense WHERE cashRegisterId = ?
        `, [registerId]);
        const expensesTotal = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);

        await window.electronAPI.dbExecute(`
            UPDATE CashRegister SET
                closedAt = ?, finalAmount = ?, salesCash = ?, salesSinpe = ?, salesCredit = ?, 
                expensesTotal = ?, status = 'CLOSED', syncStatus = 'PENDING', updatedAt = ?, notes = ?
            WHERE id = ?
        `, [now, finalAmount, salesCash, salesSinpe, salesCredit, expensesTotal, now, notes, registerId]);
        return;
    }

    // Get sales summary for this register (Cloud version)
    const { data: sales } = await supabase
        .from('Sale')
        .select('total, paymentMethod, paymentMethod2, amount2, isCredit')
        .eq('cashRegisterId', registerId)
        .eq('status', 'COMPLETADA')

    const sv = sales ?? []
    const salesCash = sv.filter(s => s.paymentMethod === 'EFECTIVO').reduce((sum, s) => sum + s.total - (s.paymentMethod2 ? (s.amount2 ?? 0) : 0), 0)
    const salesSinpe = sv.filter(s => s.paymentMethod === 'SINPE' && !s.paymentMethod2).reduce((sum, s) => sum + s.total, 0)
        + sv.filter(s => s.paymentMethod2 === 'SINPE').reduce((sum, s) => sum + (s.amount2 ?? 0), 0)
    const salesCredit = sv.filter(s => s.isCredit && !s.paymentMethod2).reduce((sum, s) => sum + s.total, 0)
        + sv.filter(s => s.paymentMethod2 === 'CREDITO').reduce((sum, s) => sum + (s.amount2 ?? 0), 0)

    // Get expenses total
    const { data: expenses } = await supabase
        .from('Expense')
        .select('amount')
        .eq('cashRegisterId', registerId)

    const expensesTotal = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0)

    const { error } = await supabase
        .from('CashRegister')
        .update({
            closedAt: now,
            finalAmount,
            salesCash,
            salesSinpe,
            salesCredit,
            expensesTotal,
            status: 'CLOSED',
            updatedAt: now,
            notes
        })
        .eq('id', registerId)

    if (error) throw error
}

// ===== Get Register History =====
export async function getRegisterHistory(limit = 20) {
    if (window.electronAPI) {
        return await window.electronAPI.dbQuery(`
            SELECT * FROM CashRegister ORDER BY openedAt DESC LIMIT ?
        `, [limit]);
    }

    const { data, error } = await supabase
        .from('CashRegister')
        .select('*')
        .order('openedAt', { ascending: false })
        .limit(limit)

    if (error) throw error
    return data ?? []
}

// ===== Update Register (edit amounts/notes on a closed register) =====
export async function updateRegister(registerId: string, updates: { initialAmount?: number; finalAmount?: number; notes?: string | null }) {
    const now = new Date().toISOString()

    if (window.electronAPI) {
        const sets: string[] = ['updatedAt = ?', "syncStatus = 'PENDING'"]
        const params: any[] = [now]

        if (updates.initialAmount !== undefined) { sets.push('initialAmount = ?'); params.push(updates.initialAmount) }
        if (updates.finalAmount !== undefined) { sets.push('finalAmount = ?'); params.push(updates.finalAmount) }
        if (updates.notes !== undefined) { sets.push('notes = ?'); params.push(updates.notes) }

        params.push(registerId)
        await window.electronAPI.dbExecute(`UPDATE CashRegister SET ${sets.join(', ')} WHERE id = ?`, params)
        return
    }

    const { error } = await supabase
        .from('CashRegister')
        .update({ ...updates, updatedAt: now })
        .eq('id', registerId)

    if (error) throw error
}

// ===== Cash Audit Entries =====
export type CashAuditEntry = {
    id: string
    type: 'VENTA' | 'GASTO' | 'DEVOLUCION' | 'AJUSTE'
    time: string
    label: string
    amountReceived: number
    changeGiven: number
    net: number
    employeeName: string | null
}

export async function getCashAuditEntries(registerId: string): Promise<CashAuditEntry[]> {
    let sales: any[] = []
    let expenses: any[] = []
    let returns: any[] = []
    let adjustments: any[] = []

    if (window.electronAPI) {
        sales = await window.electronAPI.dbQuery(`
            SELECT id, saleNumber, date as time, total, amountReceived, "change" as changeGiven, notes, paymentMethod2, amount2
            FROM Sale
            WHERE cashRegisterId = ? AND paymentMethod = 'EFECTIVO' AND status = 'COMPLETADA'
            ORDER BY date ASC
        `, [registerId])

        expenses = await window.electronAPI.dbQuery(`
            SELECT id, description, amount, date as time
            FROM Expense
            WHERE cashRegisterId = ?
            ORDER BY date ASC
        `, [registerId])

        returns = await window.electronAPI.dbQuery(`
            SELECT id, returnNumber, date as time, netCash, employeeName
            FROM "Return"
            WHERE cashRegisterId = ?
            ORDER BY date ASC
        `, [registerId])

        adjustments = await window.electronAPI.dbQuery(`
            SELECT id, direction, amount, reason, employeeName, date as time
            FROM CashAdjustment
            WHERE cashRegisterId = ?
            ORDER BY date ASC
        `, [registerId])
    } else {
        const { data: s } = await supabase
            .from('Sale')
            .select('id, saleNumber, date, total, amountReceived, change, notes, paymentMethod2, amount2')
            .eq('cashRegisterId', registerId)
            .eq('paymentMethod', 'EFECTIVO')
            .eq('status', 'COMPLETADA')
            .order('date', { ascending: true })
        sales = s ?? []

        const { data: e } = await supabase
            .from('Expense')
            .select('id, description, amount, date')
            .eq('cashRegisterId', registerId)
            .order('date', { ascending: true })
        expenses = e ?? []

        const { data: r } = await supabase
            .from('Return')
            .select('id, returnNumber, date, netCash, employeeName')
            .eq('cashRegisterId', registerId)
            .order('date', { ascending: true })
        returns = r ?? []

        const { data: a } = await supabase
            .from('CashAdjustment')
            .select('id, direction, amount, reason, employeeName, date')
            .eq('cashRegisterId', registerId)
            .order('date', { ascending: true })
        adjustments = a ?? []
    }

    const entries: CashAuditEntry[] = [
        ...sales.map((s: any) => ({
            id: s.id,
            type: 'VENTA' as const,
            time: s.time,
            label: s.paymentMethod2
                ? `Venta #${s.saleNumber} (+${s.paymentMethod2} ₡${s.amount2 ?? 0})`
                : `Venta #${s.saleNumber}`,
            amountReceived: s.amountReceived ?? s.total,
            changeGiven: s.changeGiven ?? 0,
            net: s.total - (s.paymentMethod2 ? (s.amount2 ?? 0) : 0),
            employeeName: parseEmployeeName(s.notes),
        })),
        ...expenses.map((e: any) => ({
            id: e.id,
            type: 'GASTO' as const,
            time: e.time,
            label: e.description || 'Gasto',
            amountReceived: 0,
            changeGiven: e.amount,
            net: -e.amount,
            employeeName: null,
        })),
        ...returns.map((r: any) => ({
            id: r.id,
            type: 'DEVOLUCION' as const,
            time: r.time,
            label: `Dev. #${r.returnNumber}`,
            amountReceived: r.netCash < 0 ? Math.abs(r.netCash) : 0,
            changeGiven: r.netCash > 0 ? r.netCash : 0,
            net: -r.netCash,
            employeeName: r.employeeName,
        })),
        ...adjustments.map((a: any) => ({
            id: a.id,
            type: 'AJUSTE' as const,
            time: a.time ?? a.date,
            label: a.direction === 'IN'
                ? `Ingreso: ${a.reason || 'Ajuste de caja'}`
                : `Retiro: ${a.reason || 'Ajuste de caja'}`,
            amountReceived: a.direction === 'IN' ? a.amount : 0,
            changeGiven: a.direction === 'OUT' ? a.amount : 0,
            net: a.direction === 'IN' ? a.amount : -a.amount,
            employeeName: a.employeeName,
        })),
    ]

    return entries.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

// ===== Get Sale By ID (for audit detail modal) =====
export async function getSaleById(saleId: string): Promise<Sale | null> {
    if (window.electronAPI) {
        const sale = await window.electronAPI.dbGet(
            `SELECT * FROM Sale WHERE id = ?`, [saleId]
        )
        if (!sale) return null

        const items = await window.electronAPI.dbQuery(`
            SELECT si.*, p.name as productName
            FROM SaleItem si
            LEFT JOIN Product p ON si.productId = p.id
            WHERE si.saleId = ?
        `, [saleId])

        return {
            ...sale,
            date: new Date(sale.date),
            createdAt: new Date(sale.createdAt),
            updatedAt: new Date(sale.updatedAt),
            isCredit: !!sale.isCredit,
            items: items.map((i: any) => ({
                ...i,
                createdAt: new Date(i.createdAt),
                product: { name: i.productName },
            })),
        } as Sale
    }

    const { data, error } = await supabase
        .from('Sale')
        .select('*, items:SaleItem(*, product:Product(name))')
        .eq('id', saleId)
        .single()

    if (error || !data) return null
    return {
        ...data,
        date: new Date(data.date),
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
    } as Sale
}

// ===== Cash Adjustment =====
export async function createAdjustment(
    cashRegisterId: string,
    direction: 'IN' | 'OUT',
    amount: number,
    reason: string | null,
    employeeName: string | null,
) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(`
            INSERT INTO CashAdjustment (id, cashRegisterId, direction, amount, reason, employeeName, date, syncStatus, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `, [id, cashRegisterId, direction, amount, reason, employeeName, now, now, now])
        return
    }

    const { error } = await supabase.from('CashAdjustment').insert({
        id, cashRegisterId, direction, amount, reason, employeeName,
        date: now, syncStatus: 'SYNCED', createdAt: now, updatedAt: now,
    })
    if (error) throw error
}

// ===== Delete Register =====
export async function deleteRegister(registerId: string) {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(`UPDATE Sale SET cashRegisterId = NULL WHERE cashRegisterId = ?`, [registerId])
        await window.electronAPI.dbExecute(`UPDATE Expense SET cashRegisterId = NULL WHERE cashRegisterId = ?`, [registerId])
        await window.electronAPI.dbExecute(`DELETE FROM CashRegister WHERE id = ?`, [registerId])
        return
    }

    const { error } = await supabase
        .from('CashRegister')
        .delete()
        .eq('id', registerId)

    if (error) throw error
}
