import { supabase } from '@/lib/supabase'
import { deleteSubcategoriesByCategoryId } from '@/services/subcategories'
import type { Category } from '@/types'

/**
 * Get all categories ordered by sortOrder (including inactive for management)
 */
export async function getCategories(activeOnly = true): Promise<Category[]> {
    if (window.electronAPI) {
        let sql = 'SELECT * FROM Category';
        if (activeOnly) sql += ' WHERE isActive = 1';
        sql += ' ORDER BY sortOrder ASC';

        const data = await window.electronAPI.dbQuery(sql);
        return data.map(c => ({
            ...c,
            isActive: !!c.isActive
        })) as unknown as Category[];
    }

    let query = supabase
        .from('Category')
        .select('*')
        .order('sortOrder')

    if (activeOnly) query = query.eq('isActive', true)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as unknown as Category[]
}

/**
 * Create a new category 
 */
export async function createCategory(input: {
    name: string
    type?: string
    icon?: string
}): Promise<Category> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(`
            INSERT INTO Category (id, name, type, icon, sortOrder, isActive, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, 0, 1, 'PENDING', ?)
        `, [id, input.name, input.type || 'PRODUCTO', input.icon || null, now]);

        return {
            id,
            name: input.name,
            type: input.type || 'PRODUCTO',
            icon: input.icon || null,
            sortOrder: 0,
            isActive: true,
            createdAt: new Date(now),
            updatedAt: new Date(now),
        } as unknown as Category;
    }

    const { data, error } = await supabase
        .from('Category')
        .insert({
            id,
            name: input.name,
            type: input.type || 'PRODUCTO',
            icon: input.icon || null,
            sortOrder: 0,
            isActive: true,
            syncStatus: 'SYNCED',
        })
        .select()
        .single()

    if (error) throw error
    return data as unknown as Category
}

/**
 * Update an existing category
 */
export async function updateCategory(
    id: string,
    input: { name?: string; type?: string; icon?: string; isActive?: boolean; sortOrder?: number }
): Promise<Category> {
    const now = new Date().toISOString();

    if (window.electronAPI) {
        const fields = Object.keys(input) as (keyof typeof input)[];
        const sets = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => (typeof input[f] === 'boolean' ? (input[f] ? 1 : 0) : input[f]));

        await window.electronAPI.dbExecute(`
            UPDATE Category SET ${sets}, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?
        `, [...values, now, id]);

        const rows = await window.electronAPI.dbQuery('SELECT * FROM Category WHERE id = ?', [id]);
        return {
            ...rows[0],
            isActive: !!rows[0].isActive
        } as unknown as Category;
    }

    const { data, error } = await supabase
        .from('Category')
        .update({ ...input, updatedAt: now })
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Category
}

/**
 * Delete a category (only if no products reference it)
 */
export async function deleteCategory(id: string): Promise<void> {
    if (window.electronAPI) {
        const products = await window.electronAPI.dbQuery('SELECT id FROM Product WHERE categoryId = ?', [id]);
        if (products.length > 0) {
            throw new Error(`No se puede eliminar: hay ${products.length} producto(s) en esta categoría`);
        }
        await deleteSubcategoriesByCategoryId(id)
        await window.electronAPI.dbExecute('DELETE FROM Category WHERE id = ?', [id]);
        return;
    }

    // Check if any products reference this category
    const { count, error: countError } = await supabase
        .from('Product')
        .select('id', { count: 'exact', head: true })
        .eq('categoryId', id)

    if (countError) throw countError
    if ((count ?? 0) > 0) {
        throw new Error(`No se puede eliminar: hay ${count} producto(s) en esta categoría`)
    }

    await deleteSubcategoriesByCategoryId(id)

    const { error } = await supabase
        .from('Category')
        .delete()
        .eq('id', id)

    if (error) throw error
}
