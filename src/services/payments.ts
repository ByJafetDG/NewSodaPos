import { supabase } from '@/lib/supabase'

// ===== Create Payment (Abono) =====
export async function createPayment(input: {
    clientId: string
    amount: number
    method: 'EFECTIVO' | 'SINPE' | 'TRANSFERENCIA' | 'ASOCIACION'
    reference?: string
    notes?: string
}) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(`
            INSERT INTO Payment (id, clientId, amount, method, reference, notes, date, syncStatus)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `, [id, input.clientId, input.amount, input.method, input.reference || null, input.notes || null, now]);
        return id;
    }

    const { data, error } = await supabase
        .from('Payment')
        .insert({
            id,
            clientId: input.clientId,
            amount: input.amount,
            method: input.method,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            date: now,
            syncStatus: 'SYNCED',
        })
        .select('id')
        .single()

    if (error) throw error
    return data.id
}

// ===== Get Payments by Client =====
export async function getPaymentsByClient(clientId: string) {
    if (window.electronAPI) {
        return await window.electronAPI.dbQuery(
            'SELECT * FROM Payment WHERE clientId = ? ORDER BY date DESC',
            [clientId]
        );
    }

    const { data, error } = await supabase
        .from('Payment')
        .select('*')
        .eq('clientId', clientId)
        .order('date', { ascending: false })

    if (error) throw error
    return data ?? []
}

// ===== Get Client Balance =====
export async function getClientBalance(clientId: string) {
    if (window.electronAPI) {
        // Total credit sales from local DB
        const sales = await window.electronAPI.dbQuery(
            "SELECT total FROM Sale WHERE clientId = ? AND isCredit = 1 AND status = 'COMPLETADA'",
            [clientId]
        );
        const totalDebt = (sales ?? []).reduce((sum: number, s: any) => sum + s.total, 0);

        // Total payments from local DB
        const payments = await window.electronAPI.dbQuery(
            "SELECT amount FROM Payment WHERE clientId = ?",
            [clientId]
        );
        const totalPaid = (payments ?? []).reduce((sum: number, p: any) => sum + p.amount, 0);

        return {
            totalDebt,
            totalPaid,
            balance: totalDebt - totalPaid,
        };
    }

    // Total credit sales
    const { data: sales } = await supabase
        .from('Sale')
        .select('total')
        .eq('clientId', clientId)
        .eq('isCredit', true)
        .eq('status', 'COMPLETADA')

    const totalDebt = (sales ?? []).reduce((sum, s) => sum + s.total, 0)

    // Total payments
    const { data: payments } = await supabase
        .from('Payment')
        .select('amount')
        .eq('clientId', clientId)

    const totalPaid = (payments ?? []).reduce((sum, p) => sum + p.amount, 0)

    return {
        totalDebt,
        totalPaid,
        balance: totalDebt - totalPaid,
    }
}

// ===== Update Payment =====
export async function updatePayment(id: string, input: {
    amount?: number
    method?: 'EFECTIVO' | 'SINPE' | 'TRANSFERENCIA' | 'ASOCIACION'
    reference?: string
    notes?: string
}) {
    if (window.electronAPI) {
        const fields = []
        const values = []
        if (input.amount !== undefined) { fields.push('amount = ?'); values.push(input.amount) }
        if (input.method !== undefined) { fields.push('method = ?'); values.push(input.method) }
        if (input.reference !== undefined) { fields.push('reference = ?'); values.push(input.reference || null) }
        if (input.notes !== undefined) { fields.push('notes = ?'); values.push(input.notes || null) }

        fields.push("syncStatus = 'PENDING'")
        values.push(id)

        await window.electronAPI.dbExecute(`
            UPDATE Payment SET ${fields.join(', ')} WHERE id = ?
        `, values);
        return id;
    }

    const { error } = await supabase
        .from('Payment')
        .update({
            ...input,
            syncStatus: 'SYNCED'
        })
        .eq('id', id)

    if (error) throw error
    return id
}

// ===== Delete Payment =====
export async function deletePayment(id: string) {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute('DELETE FROM Payment WHERE id = ?', [id])
        return id
    }

    const { error } = await supabase
        .from('Payment')
        .delete()
        .eq('id', id)

    if (error) throw error
    return id
}
