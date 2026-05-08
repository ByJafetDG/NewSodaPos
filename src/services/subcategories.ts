import { supabase } from '@/lib/supabase'
import type { Subcategory } from '@/types'

export async function getSubcategories(): Promise<Subcategory[]> {
    if (window.electronAPI) {
        const data = await window.electronAPI.dbQuery(
            'SELECT * FROM Subcategory ORDER BY categoryId, sortOrder ASC'
        )
        return data.map(s => ({
            ...s,
            isActive: !!s.isActive,
            showDays: s.showDays ? JSON.parse(s.showDays) : null,
        })) as unknown as Subcategory[]
    }
    const { data, error } = await supabase
        .from('Subcategory')
        .select('*')
        .order('categoryId')
        .order('sortOrder')
    if (error) throw error
    return (data ?? []).map(s => ({
        ...s,
        showDays: s.showDays ?? null,
    })) as unknown as Subcategory[]
}

export async function createSubcategory(input: {
    categoryId: string; name: string; showDays?: number[] | null; sortOrder?: number
}): Promise<Subcategory> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const showDaysStr = input.showDays?.length ? JSON.stringify(input.showDays) : null

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(`
            INSERT INTO Subcategory (id, categoryId, name, showDays, sortOrder, isActive, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, 1, 'PENDING', ?)
        `, [id, input.categoryId, input.name, showDaysStr, input.sortOrder ?? 0, now])
        return {
            id, categoryId: input.categoryId, name: input.name,
            showDays: input.showDays ?? null, sortOrder: input.sortOrder ?? 0,
            isActive: true, syncStatus: 'PENDING' as const,
            createdAt: new Date(now), updatedAt: new Date(now),
        }
    }
    const { data, error } = await supabase
        .from('Subcategory')
        .insert({
            id, categoryId: input.categoryId, name: input.name,
            showDays: input.showDays ?? null, sortOrder: input.sortOrder ?? 0,
            isActive: true, syncStatus: 'SYNCED', updatedAt: now,
        })
        .select().single()
    if (error) throw error
    return data as unknown as Subcategory
}

export async function updateSubcategory(
    id: string,
    input: { name?: string; showDays?: number[] | null; isActive?: boolean; sortOrder?: number }
): Promise<void> {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        const mapped: Record<string, any> = {}
        if ('name' in input) mapped.name = input.name
        if ('isActive' in input) mapped.isActive = input.isActive ? 1 : 0
        if ('sortOrder' in input) mapped.sortOrder = input.sortOrder
        if ('showDays' in input) mapped.showDays = input.showDays?.length ? JSON.stringify(input.showDays) : null
        const fields = Object.keys(mapped)
        const sets = fields.map(f => `${f} = ?`).join(', ')
        const values = fields.map(f => mapped[f])
        await window.electronAPI.dbExecute(
            `UPDATE Subcategory SET ${sets}, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
            [...values, now, id]
        )
        return
    }
    const payload: any = {}
    if ('name' in input) payload.name = input.name
    if ('isActive' in input) payload.isActive = input.isActive
    if ('sortOrder' in input) payload.sortOrder = input.sortOrder
    if ('showDays' in input) payload.showDays = input.showDays ?? null
    const { error } = await supabase
        .from('Subcategory')
        .update({ ...payload, updatedAt: now })
        .eq('id', id)
    if (error) throw error
}

export async function deleteSubcategory(id: string): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `UPDATE Product SET subcategoryId = NULL WHERE subcategoryId = ?`, [id]
        )
        await window.electronAPI.dbExecute(`DELETE FROM Subcategory WHERE id = ?`, [id])
        return
    }
    await supabase.from('Product').update({ subcategoryId: null }).eq('subcategoryId', id)
    const { error } = await supabase.from('Subcategory').delete().eq('id', id)
    if (error) throw error
}

export async function deleteSubcategoriesByCategoryId(categoryId: string): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            `UPDATE Product SET subcategoryId = NULL WHERE subcategoryId IN (SELECT id FROM Subcategory WHERE categoryId = ?)`,
            [categoryId]
        )
        await window.electronAPI.dbExecute(`DELETE FROM Subcategory WHERE categoryId = ?`, [categoryId])
        return
    }
    const { data: subs } = await supabase.from('Subcategory').select('id').eq('categoryId', categoryId)
    if (subs?.length) {
        const ids = subs.map(s => s.id)
        await supabase.from('Product').update({ subcategoryId: null }).in('subcategoryId', ids)
        await supabase.from('Subcategory').delete().in('id', ids)
    }
}
