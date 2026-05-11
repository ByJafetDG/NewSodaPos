import { supabase } from '@/lib/supabase'
import type { Sorteo, SorteoOption, SorteoParticipant, SorteoEntry, SorteoStats } from '@/types'

// ─── Sorteo ──────────────────────────────────────────────────────────────────

export async function getSorteos(): Promise<Sorteo[]> {
    if (window.electronAPI) {
        const data = await window.electronAPI.dbQuery(
            'SELECT * FROM Sorteo ORDER BY createdAt DESC'
        )
        return data.map(mapSorteo) as Sorteo[]
    }
    const { data, error } = await supabase.from('Sorteo').select('*').order('createdAt', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapSorteo) as Sorteo[]
}

export async function getActiveSorteos(): Promise<Sorteo[]> {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        const data = await window.electronAPI.dbQuery(
            `SELECT * FROM Sorteo WHERE status = 'ACTIVE'
             AND (startAt IS NULL OR startAt <= ?)
             AND (endAt IS NULL OR endAt >= ?)`,
            [now, now]
        )
        return data.map(mapSorteo) as Sorteo[]
    }
    const { data, error } = await supabase
        .from('Sorteo')
        .select('*')
        .eq('status', 'ACTIVE')
        .or(`startAt.is.null,startAt.lte.${now}`)
        .or(`endAt.is.null,endAt.gte.${now}`)
    if (error) throw error
    return (data ?? []).map(mapSorteo) as Sorteo[]
}

export async function createSorteo(input: { name: string; type?: string; minSpinsBetweenPrizes?: number }): Promise<Sorteo> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `INSERT INTO Sorteo (id, name, type, status, minSpinsBetweenPrizes, syncStatus, updatedAt)
             VALUES (?, ?, ?, 'DRAFT', ?, 'PENDING', ?)`,
            [id, input.name, input.type ?? 'RULETA', input.minSpinsBetweenPrizes ?? 8, now]
        )
        const rows = await window.electronAPI.dbQuery('SELECT * FROM Sorteo WHERE id = ?', [id])
        return mapSorteo(rows[0]) as Sorteo
    }
    const { data, error } = await supabase
        .from('Sorteo')
        .insert({ id, name: input.name, type: input.type ?? 'RULETA', status: 'DRAFT', minSpinsBetweenPrizes: input.minSpinsBetweenPrizes ?? 8, syncStatus: 'SYNCED' })
        .select().single()
    if (error) throw error
    return mapSorteo(data) as Sorteo
}

export async function updateSorteo(
    id: string,
    input: Partial<{ name: string; status: string; startAt: string | null; endAt: string | null; minSpinsBetweenPrizes: number }>
): Promise<void> {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        const fields = Object.keys(input) as (keyof typeof input)[]
        const sets = fields.map(f => `${f} = ?`).join(', ')
        const values = fields.map(f => input[f] ?? null)
        await window.electronAPI.dbExecute(
            `UPDATE Sorteo SET ${sets}, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
            [...values, now, id]
        )
        return
    }
    const { error } = await supabase.from('Sorteo').update({ ...input, updatedAt: now }).eq('id', id)
    if (error) throw error
}

export async function deleteSorteo(id: string): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute('DELETE FROM SorteoEntry WHERE sorteoId = ?', [id])
        await window.electronAPI.dbExecute('DELETE FROM SorteoParticipant WHERE sorteoId = ?', [id])
        await window.electronAPI.dbExecute('DELETE FROM SorteoOption WHERE sorteoId = ?', [id])
        await window.electronAPI.dbExecute('DELETE FROM Sorteo WHERE id = ?', [id])
        return
    }
    const { error } = await supabase.from('Sorteo').delete().eq('id', id)
    if (error) throw error
}

// ─── SorteoOption ─────────────────────────────────────────────────────────────

export async function getSorteoOptions(sorteoId: string): Promise<SorteoOption[]> {
    if (window.electronAPI) {
        const data = await window.electronAPI.dbQuery(
            'SELECT * FROM SorteoOption WHERE sorteoId = ? ORDER BY sortOrder ASC',
            [sorteoId]
        )
        return data.map(mapOption) as SorteoOption[]
    }
    const { data, error } = await supabase
        .from('SorteoOption').select('*').eq('sorteoId', sorteoId).order('sortOrder')
    if (error) throw error
    return (data ?? []).map(mapOption) as SorteoOption[]
}

export async function createSorteoOption(input: {
    sorteoId: string; label: string; description?: string
    quantity?: number | null; baseProbability: number
    isFiller?: boolean; color?: string; sortOrder?: number
}): Promise<SorteoOption> {
    const id = crypto.randomUUID()
    const qty = input.quantity ?? null
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `INSERT INTO SorteoOption
             (id, sorteoId, label, description, quantity, quantityRemaining, baseProbability, isFiller, color, sortOrder, syncStatus)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
            [
                id, input.sorteoId, input.label, input.description ?? null,
                qty, qty,
                input.baseProbability, input.isFiller ? 1 : 0,
                input.color ?? null, input.sortOrder ?? 0,
            ]
        )
        const rows = await window.electronAPI.dbQuery('SELECT * FROM SorteoOption WHERE id = ?', [id])
        return mapOption(rows[0]) as SorteoOption
    }
    const { data, error } = await supabase
        .from('SorteoOption')
        .insert({
            id, sorteoId: input.sorteoId, label: input.label,
            description: input.description ?? null,
            quantity: qty, quantityRemaining: qty,
            baseProbability: input.baseProbability,
            isFiller: input.isFiller ?? false,
            color: input.color ?? null,
            sortOrder: input.sortOrder ?? 0,
            syncStatus: 'SYNCED',
        })
        .select().single()
    if (error) throw error
    return mapOption(data) as SorteoOption
}

export async function updateSorteoOption(
    id: string,
    input: Partial<{ label: string; description: string | null; quantity: number | null; baseProbability: number; isFiller: boolean; color: string | null; sortOrder: number }>
): Promise<void> {
    if (window.electronAPI) {
        const fields = Object.keys(input) as (keyof typeof input)[]
        const sets = fields.map(f => `${f} = ?`).join(', ')
        const values = fields.map(f => {
            const v = input[f]
            return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null)
        })
        await window.electronAPI.dbExecute(
            `UPDATE SorteoOption SET ${sets}, syncStatus = 'PENDING' WHERE id = ?`,
            [...values, id]
        )
        return
    }
    const { error } = await supabase.from('SorteoOption').update(input).eq('id', id)
    if (error) throw error
}

export async function deleteSorteoOption(id: string): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute('DELETE FROM SorteoOption WHERE id = ?', [id])
        return
    }
    const { error } = await supabase.from('SorteoOption').delete().eq('id', id)
    if (error) throw error
}

export async function handleSorteoWin(sorteoId: string, resultOptionId: string): Promise<void> {
    await decrementOptionQuantity(resultOptionId)

    const options = await getSorteoOptions(sorteoId)
    const nonFillers = options.filter(o => !o.isFiller)
    const allExhausted = nonFillers.length > 0 &&
        nonFillers.every(o => o.quantityRemaining !== null && (o.quantityRemaining ?? 1) <= 0)

    if (allExhausted) {
        await updateSorteo(sorteoId, { status: 'ENDED' })
    }
}

export async function decrementOptionQuantity(optionId: string): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `UPDATE SorteoOption SET quantityRemaining = quantityRemaining - 1
             WHERE id = ? AND quantityRemaining > 0`,
            [optionId]
        )
        return
    }
    const { data } = await supabase.from('SorteoOption').select('quantityRemaining').eq('id', optionId).single()
    if (data && data.quantityRemaining > 0) {
        await supabase.from('SorteoOption').update({ quantityRemaining: data.quantityRemaining - 1 }).eq('id', optionId)
    }
}

// ─── SorteoParticipant ────────────────────────────────────────────────────────

export async function getSorteoParticipants(sorteoId: string): Promise<SorteoParticipant[]> {
    if (window.electronAPI) {
        const data = await window.electronAPI.dbQuery(
            'SELECT * FROM SorteoParticipant WHERE sorteoId = ?',
            [sorteoId]
        )
        return data as SorteoParticipant[]
    }
    const { data, error } = await supabase.from('SorteoParticipant').select('*').eq('sorteoId', sorteoId)
    if (error) throw error
    return (data ?? []) as SorteoParticipant[]
}

export async function setSorteoParticipants(
    sorteoId: string,
    participants: { type: 'PRODUCT' | 'CATEGORY'; refId: string }[]
): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute('DELETE FROM SorteoParticipant WHERE sorteoId = ?', [sorteoId])
        for (const p of participants) {
            await window.electronAPI.dbExecute(
                `INSERT INTO SorteoParticipant (id, sorteoId, type, refId, syncStatus) VALUES (?, ?, ?, ?, 'PENDING')`,
                [crypto.randomUUID(), sorteoId, p.type, p.refId]
            )
        }
        return
    }
    await supabase.from('SorteoParticipant').delete().eq('sorteoId', sorteoId)
    if (participants.length > 0) {
        const rows = participants.map(p => ({
            id: crypto.randomUUID(), sorteoId, type: p.type, refId: p.refId, syncStatus: 'SYNCED'
        }))
        const { error } = await supabase.from('SorteoParticipant').insert(rows)
        if (error) throw error
    }
}

export interface OccupiedParticipant {
    type: 'PRODUCT' | 'CATEGORY'; refId: string; sorteoId: string; sorteoName: string
}

export async function getOccupiedParticipants(excludeSorteoId?: string): Promise<OccupiedParticipant[]> {
    if (window.electronAPI) {
        const sql = excludeSorteoId
            ? `SELECT sp.type, sp.refId, sp.sorteoId, s.name AS sorteoName
               FROM SorteoParticipant sp JOIN Sorteo s ON s.id = sp.sorteoId
               WHERE s.status = 'ACTIVE' AND sp.sorteoId != ?`
            : `SELECT sp.type, sp.refId, sp.sorteoId, s.name AS sorteoName
               FROM SorteoParticipant sp JOIN Sorteo s ON s.id = sp.sorteoId
               WHERE s.status = 'ACTIVE'`
        const rows = await window.electronAPI.dbQuery(sql, excludeSorteoId ? [excludeSorteoId] : [])
        return rows as OccupiedParticipant[]
    }
    const q = supabase.from('SorteoParticipant').select('type, refId, sorteoId, Sorteo!inner(name, status)').eq('Sorteo.status', 'ACTIVE')
    const { data } = excludeSorteoId ? await q.neq('sorteoId', excludeSorteoId) : await q
    return (data ?? []).map((r: any) => ({ type: r.type, refId: r.refId, sorteoId: r.sorteoId, sorteoName: r.Sorteo.name }))
}

// ─── SorteoEntry ──────────────────────────────────────────────────────────────

export async function logSorteoEntry(input: {
    sorteoId: string; saleId?: string; didParticipate: boolean
    unitCount?: number; resultOptionId?: string | null
}): Promise<void> {
    const id = crypto.randomUUID()
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `INSERT INTO SorteoEntry (id, sorteoId, saleId, didParticipate, unitCount, resultOptionId, syncStatus)
             VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
            [
                id, input.sorteoId, input.saleId ?? null,
                input.didParticipate ? 1 : 0,
                input.unitCount ?? 1,
                input.resultOptionId ?? null,
            ]
        )
        return
    }
    const { error } = await supabase.from('SorteoEntry').insert({
        id, sorteoId: input.sorteoId, saleId: input.saleId ?? null,
        didParticipate: input.didParticipate, unitCount: input.unitCount ?? 1,
        resultOptionId: input.resultOptionId ?? null, syncStatus: 'SYNCED',
    })
    if (error) throw error
}

export async function getSorteoStats(sorteoId: string): Promise<SorteoStats> {
    if (window.electronAPI) {
        const entries = await window.electronAPI.dbQuery(
            'SELECT didParticipate, resultOptionId FROM SorteoEntry WHERE sorteoId = ?',
            [sorteoId]
        ) as { didParticipate: number; resultOptionId: string | null }[]

        const options = await window.electronAPI.dbQuery(
            'SELECT id, label FROM SorteoOption WHERE sorteoId = ?',
            [sorteoId]
        ) as { id: string; label: string }[]

        const total = entries.length
        const participated = entries.filter(e => e.didParticipate).length
        const optionCounts = options.map(o => ({
            optionId: o.id,
            label: o.label,
            count: entries.filter(e => e.resultOptionId === o.id).length,
        }))

        return { total, participated, declined: total - participated, optionCounts }
    }

    const { data: entries } = await supabase
        .from('SorteoEntry').select('didParticipate, resultOptionId').eq('sorteoId', sorteoId)
    const { data: options } = await supabase
        .from('SorteoOption').select('id, label').eq('sorteoId', sorteoId)

    const total = entries?.length ?? 0
    const participated = entries?.filter(e => e.didParticipate).length ?? 0
    const optionCounts = (options ?? []).map(o => ({
        optionId: o.id,
        label: o.label,
        count: entries?.filter(e => e.resultOptionId === o.id).length ?? 0,
    }))

    return { total, participated, declined: total - participated, optionCounts }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapSorteo(r: any): Partial<Sorteo> {
    return {
        ...r,
        minSpinsBetweenPrizes: r.minSpinsBetweenPrizes ?? 8,
        startAt: r.startAt ? new Date(r.startAt) : null,
        endAt: r.endAt ? new Date(r.endAt) : null,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
    }
}

export async function getSpinsSinceLastPrize(sorteoId: string): Promise<number> {
    if (!window.electronAPI) return 999
    const lastRows = await window.electronAPI.dbQuery(
        `SELECT MAX(se.rowid) as lastRowid
         FROM SorteoEntry se
         JOIN SorteoOption so ON so.id = se.resultOptionId
         WHERE se.sorteoId = ? AND so.isFiller = 0`,
        [sorteoId]
    )
    const lastRowid = (lastRows[0] as any)?.lastRowid
    if (lastRowid == null) return 999
    const countRows = await window.electronAPI.dbQuery(
        `SELECT COUNT(*) as cnt FROM SorteoEntry WHERE sorteoId = ? AND rowid > ?`,
        [sorteoId, lastRowid]
    )
    return (countRows[0] as any)?.cnt ?? 0
}

function mapOption(r: any): Partial<SorteoOption> {
    return {
        ...r,
        isFiller: !!r.isFiller,
        quantity: r.quantity ?? null,
        quantityRemaining: r.quantityRemaining ?? null,
    }
}
