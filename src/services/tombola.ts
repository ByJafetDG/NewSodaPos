import { supabase } from '@/lib/supabase'
import type { TombolaEntry } from '@/types'
import type { DbTombolaEntryRow } from '@/types/db'

export async function getTombolaEntries(sorteoId: string): Promise<TombolaEntry[]> {
    if (window.electronAPI) {
        const rows = await window.electronAPI.dbQuery(
            'SELECT * FROM TombolaEntry WHERE sorteoId = ? ORDER BY number ASC',
            [sorteoId]
        ) as DbTombolaEntryRow[]
        return rows.map(mapEntry)
    }
    const { data, error } = await supabase
        .from('TombolaEntry')
        .select('*')
        .eq('sorteoId', sorteoId)
        .order('number', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapEntry)
}

export async function createTombolaEntry(input: {
    sorteoId: string
    sorteoName: string
    number: number
    participantName: string
    participantCedula: string
    participantEmail?: string | null
    paymentMethod: 'EFECTIVO' | 'SINPE'
    price: number
}): Promise<TombolaEntry> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `INSERT INTO TombolaEntry
             (id, sorteoId, number, participantName, participantCedula, participantEmail,
              paymentMethod, price, saleRegisteredAt, isWinner, prizePosition, syncStatus, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'PENDING', ?)`,
            [id, input.sorteoId, input.number, input.participantName, input.participantCedula,
             input.participantEmail ?? null, input.paymentMethod, input.price, now, now]
        )

        // Register as a Sale so it appears in reports and cash register totals
        await createSaleRecord(input.sorteoName, input.number, input.participantName, input.paymentMethod, input.price, now)

        const rows = await window.electronAPI.dbQuery(
            'SELECT * FROM TombolaEntry WHERE id = ?', [id]
        ) as DbTombolaEntryRow[]
        return mapEntry(rows[0])
    }

    const { data, error } = await supabase
        .from('TombolaEntry')
        .insert({
            id, sorteoId: input.sorteoId, number: input.number,
            participantName: input.participantName, participantCedula: input.participantCedula,
            participantEmail: input.participantEmail ?? null,
            paymentMethod: input.paymentMethod, price: input.price,
            saleRegisteredAt: now, isWinner: false, prizePosition: null,
            syncStatus: 'PENDING', updatedAt: now,
        })
        .select()
        .single()
    if (error) throw error
    return mapEntry(data)
}

async function createSaleRecord(
    sorteoName: string,
    number: number,
    participantName: string,
    paymentMethod: 'EFECTIVO' | 'SINPE',
    price: number,
    now: string,
): Promise<void> {
    if (!window.electronAPI) return
    try {
        let cashierName = 'Sin cajero'
        try {
            const emp = JSON.parse(localStorage.getItem('pos_cashier_v2') ?? 'null')
            if (emp?.name) cashierName = emp.name
        } catch {}

        const saleId = crypto.randomUUID()
        const numRows = await window.electronAPI.dbQuery(
            'SELECT COALESCE(MAX(saleNumber), 0) + 1 AS n FROM Sale'
        )
        const saleNumber = (numRows[0]?.n ?? 1) as number
        const regRows = await window.electronAPI.dbQuery(
            "SELECT id FROM CashRegister WHERE status = 'OPEN' LIMIT 1"
        )
        const cashRegisterId = (regRows[0]?.id ?? null) as string | null

        await window.electronAPI.dbTransaction([
            {
                sql: `INSERT INTO Sale
                     (id, saleNumber, date, subtotal, discount, total, paymentMethod,
                      paymentMethod2, amount2, amountReceived, change, cashRegisterId, isCredit,
                      clientId, companyId, consumerName, physicalInvoiceNumber, status, notes,
                      syncStatus, originalSaleSnapshot, modifiedFromSaleId, paidAt, updatedAt)
                     VALUES (?, ?, ?, ?, 0, ?, ?, NULL, NULL, ?, 0, ?, 0,
                             NULL, NULL, ?, NULL, 'COMPLETADA', ?,
                             'PENDING', NULL, NULL, NULL, ?)`,
                params: [saleId, saleNumber, now, price, price, paymentMethod, price,
                         cashRegisterId, participantName,
                         `Cajero: ${cashierName}`, now],
            },
            {
                sql: `INSERT INTO SaleItem (id, saleId, productId, quantity, unitPrice, subtotal, notes)
                      VALUES (?, ?, 'tombola-entry', 1, ?, ?, ?)`,
                params: [crypto.randomUUID(), saleId, price, price,
                         `Número ${number} · ${sorteoName}`],
            },
        ])
    } catch {
        // Non-fatal: TombolaEntry already created, Sale is best-effort
    }
}

export async function setTombolaWinner(entryId: string, prizePosition: number): Promise<void> {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `UPDATE TombolaEntry SET isWinner = 1, prizePosition = ?, syncStatus = 'PENDING', updatedAt = ?
             WHERE id = ?`,
            [prizePosition, now, entryId]
        )
        return
    }
    const { error } = await supabase
        .from('TombolaEntry')
        .update({ isWinner: true, prizePosition, syncStatus: 'PENDING', updatedAt: now })
        .eq('id', entryId)
    if (error) throw error
}

function mapEntry(r: DbTombolaEntryRow): TombolaEntry {
    return {
        id: r.id,
        sorteoId: r.sorteoId,
        number: r.number,
        participantName: r.participantName,
        participantCedula: r.participantCedula,
        participantEmail: r.participantEmail,
        paymentMethod: r.paymentMethod as 'EFECTIVO' | 'SINPE',
        price: r.price,
        saleRegisteredAt: r.saleRegisteredAt,
        isWinner: r.isWinner === 1,
        prizePosition: r.prizePosition,
        syncStatus: r.syncStatus as import('@/types').SyncStatus,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    }
}
