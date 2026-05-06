import { supabase } from '@/lib/supabase'

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
                COALESCE((SELECT SUM(total) FROM Sale WHERE cashRegisterId = cr.id AND paymentMethod = 'EFECTIVO' AND status = 'COMPLETADA'), 0) as salesCash,
                COALESCE((SELECT SUM(total) FROM Sale WHERE cashRegisterId = cr.id AND paymentMethod = 'SINPE'    AND status = 'COMPLETADA'), 0) as salesSinpe,
                COALESCE((SELECT SUM(total) FROM Sale WHERE cashRegisterId = cr.id AND paymentMethod = 'CREDITO'  AND status = 'COMPLETADA'), 0) as salesCredit
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
        .select('total, paymentMethod')
        .eq('cashRegisterId', register.id)
        .eq('status', 'COMPLETADA')

    const agg = (method: string) =>
        (sales ?? []).filter(s => s.paymentMethod === method).reduce((sum, s) => sum + s.total, 0)

    return {
        ...register,
        salesCash: agg('EFECTIVO'),
        salesSinpe: agg('SINPE'),
        salesCredit: agg('CREDITO'),
    }
}

// ===== Close Register =====
export async function closeRegister(registerId: string, finalAmount: number, notes: string | null = null) {
    const now = new Date().toISOString()

    if (window.electronAPI) {
        // Calculation summary locally
        const sales = await window.electronAPI.dbQuery(`
            SELECT total, paymentMethod, isCredit FROM Sale 
            WHERE cashRegisterId = ? AND status = 'COMPLETADA'
        `, [registerId]);

        const salesCash = sales.filter((s: any) => s.paymentMethod === 'EFECTIVO').reduce((sum: number, s: any) => sum + s.total, 0);
        const salesSinpe = sales.filter((s: any) => s.paymentMethod === 'SINPE').reduce((sum: number, s: any) => sum + s.total, 0);
        const salesCredit = sales.filter((s: any) => s.isCredit === 1).reduce((sum: number, s: any) => sum + s.total, 0);

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
        .select('total, paymentMethod, isCredit')
        .eq('cashRegisterId', registerId)
        .eq('status', 'COMPLETADA')

    const salesCash = (sales ?? [])
        .filter((s) => s.paymentMethod === 'EFECTIVO')
        .reduce((sum, s) => sum + s.total, 0)
    const salesSinpe = (sales ?? [])
        .filter((s) => s.paymentMethod === 'SINPE')
        .reduce((sum, s) => sum + s.total, 0)
    const salesCredit = (sales ?? [])
        .filter((s) => s.isCredit)
        .reduce((sum, s) => sum + s.total, 0)

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
