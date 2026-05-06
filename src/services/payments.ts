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

// ===== Get Credit Sales by Client =====
export async function getCreditSalesByClient(clientId: string) {
    if (window.electronAPI) {
        const sales = await window.electronAPI.dbQuery(
            "SELECT * FROM Sale WHERE clientId = ? AND isCredit = 1 AND status = 'COMPLETADA' ORDER BY date DESC",
            [clientId]
        )
        return await Promise.all(sales.map(async (sale: any) => {
            const items = await window.electronAPI!.dbQuery(`
                SELECT si.*, p.name as product_name
                FROM SaleItem si LEFT JOIN Product p ON si.productId = p.id
                WHERE si.saleId = ?
            `, [sale.id])
            return {
                ...sale,
                isCredit: !!sale.isCredit,
                items: items.map((i: any) => ({ ...i, product: { name: i.product_name } }))
            }
        }))
    }

    const { data, error } = await supabase
        .from('Sale')
        .select('*, items:SaleItem(*, product:Product(name))')
        .eq('clientId', clientId)
        .eq('isCredit', true)
        .eq('status', 'COMPLETADA')
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

// ===== Get All Clients with Balances =====
export async function getClientsWithBalances() {
    let clientsData: any[] = [];

    if (window.electronAPI) {
        clientsData = await window.electronAPI.dbQuery(
            'SELECT * FROM Client WHERE isActive = 1 ORDER BY name ASC'
        );
    } else {
        const { data, error } = await supabase
            .from('Client')
            .select('*')
            .eq('isActive', true)
            .order('name')

        if (error) throw error
        clientsData = data ?? [];
    }

    // Get balances for each client
    const results = await Promise.all(
        clientsData.map(async (client) => {
            const balance = await getClientBalance(client.id)
            return {
                ...client,
                ...balance,
                isActive: !!client.isActive
            }
        })
    )

    return results
}

// ===== Create Client =====
export async function createClient(input: {
    name: string
    type: 'TRABAJADOR' | 'ASOCIACION' | 'GENERAL'
    phone?: string
    email?: string
    company?: string
    notes?: string
}) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(`
            INSERT INTO Client (id, name, phone, email, type, company, notes, isActive, syncStatus, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'PENDING', ?, ?)
        `, [id, input.name, input.phone || null, input.email || null, input.type, input.company || null, input.notes || null, now, now]);
        return id;
    }

    const { data, error } = await supabase
        .from('Client')
        .insert({
            id,
            name: input.name,
            type: input.type,
            phone: input.phone ?? null,
            email: input.email ?? null,
            company: input.company ?? null,
            notes: input.notes ?? null,
            isActive: true,
            syncStatus: 'SYNCED',
            createdAt: now,
            updatedAt: now,
        })
        .select('id')
        .single()

    if (error) throw error
    return data.id
}

// ===== Update Client =====
export async function updateClient(id: string, input: {
    name?: string
    type?: 'TRABAJADOR' | 'ASOCIACION' | 'GENERAL'
    phone?: string
    email?: string
    company?: string
    notes?: string
    isActive?: boolean
}) {
    const now = new Date().toISOString()

    if (window.electronAPI) {
        const fields = []
        const values = []
        if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name) }
        if (input.type !== undefined) { fields.push('type = ?'); values.push(input.type) }
        if (input.phone !== undefined) { fields.push('phone = ?'); values.push(input.phone || null) }
        if (input.email !== undefined) { fields.push('email = ?'); values.push(input.email || null) }
        if (input.company !== undefined) { fields.push('company = ?'); values.push(input.company || null) }
        if (input.notes !== undefined) { fields.push('notes = ?'); values.push(input.notes || null) }
        if (input.isActive !== undefined) { fields.push('isActive = ?'); values.push(input.isActive ? 1 : 0) }

        fields.push('updatedAt = ?'); values.push(now)
        fields.push("syncStatus = 'PENDING'")
        values.push(id)

        await window.electronAPI.dbExecute(`
            UPDATE Client SET ${fields.join(', ')} WHERE id = ?
        `, values);
        return id;
    }

    const { error } = await supabase
        .from('Client')
        .update({
            ...input,
            updatedAt: now,
            syncStatus: 'SYNCED'
        })
        .eq('id', id)

    if (error) throw error
    return id
}

// ===== Delete Client (Deactivate) =====
export async function deleteClient(id: string) {
    return await updateClient(id, { isActive: false })
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
