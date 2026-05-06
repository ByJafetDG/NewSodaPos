import { supabase } from '@/lib/supabase'
import type { Product } from '@/types'

/**
 * Get all active products with their category
 */
export async function getProducts(activeOnly = true): Promise<Product[]> {
    if (window.electronAPI) {
        // Use local SQLite in Electron
        let sql = `
            SELECT p.*, c.name as cat_name, c.type as cat_type
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.id
        `;
        if (activeOnly) sql += ' WHERE p.isActive = 1';
        sql += ' ORDER BY p.name ASC';

        const data = await window.electronAPI.dbQuery(sql);
        return data.map(p => ({
            ...p,
            isActive: !!p.isActive,
            isInfinite: !!p.isInfinite,
            category: { id: p.categoryId, name: p.cat_name, type: p.cat_type }
        })) as unknown as Product[];
    }

    let query = supabase
        .from('Product')
        .select('*, category:Category(*)')
        .order('name')

    if (activeOnly) query = query.eq('isActive', true)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as unknown as Product[]
}

/**
 * Get product by barcode
 */
export async function getProductByBarcode(barcode: string): Promise<Product | null> {
    if (window.electronAPI) {
        const sql = `
            SELECT p.*, c.name as cat_name, c.type as cat_type
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.id
            WHERE p.barcode = ? AND p.isActive = 1
            LIMIT 1
        `;
        const data = await window.electronAPI.dbQuery(sql, [barcode]);
        if (data.length === 0) return null;
        const p = data[0];
        return {
            ...p,
            isActive: !!p.isActive,
            category: { id: p.categoryId, name: p.cat_name, type: p.cat_type }
        } as unknown as Product;
    }

    const { data, error } = await supabase
        .from('Product')
        .select('*, category:Category(*)')
        .eq('barcode', barcode)
        .eq('isActive', true)
        .maybeSingle()

    if (error) throw error
    return data as unknown as Product | null
}

/**
 * Get products stock levels
 */
export async function getProductsStock(): Promise<any[]> {
    if (window.electronAPI) {
        const sql = `
            SELECT p.*, c.name as cat_name
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.id
            ORDER BY p.stockQty ASC
        `;
        const data = await window.electronAPI.dbQuery(sql);
        return data.map(p => ({
            ...p,
            category: { name: p.cat_name }
        }));
    }

    const { data, error } = await supabase
        .from('Product')
        .select('*, category:Category(name)')
        .order('stockQty')

    if (error) throw error
    return data ?? []
}

/**
 * Create a new product
 */
export async function createProduct(input: Partial<Product>): Promise<Product> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(`
            INSERT INTO Product (id, name, barcode, categoryId, price, cost, minStock, stockQty, isActive, isInfinite, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'PENDING', ?)
        `, [id, input.name, input.barcode || null, input.categoryId, input.price, input.cost || 0, input.minStock || 0, input.stockQty || 0, input.isInfinite ? 1 : 0, now]);

        return { ...input, id, isActive: true, updatedAt: now } as unknown as Product;
    }

    const { data, error } = await supabase
        .from('Product')
        .insert({
            ...input,
            id,
            isActive: true,
            syncStatus: 'SYNCED',
            updatedAt: now
        })
        .select()
        .single()

    if (error) throw error
    return data as unknown as Product
}

/**
 * Update an existing product
 */
export async function updateProduct(id: string, input: Partial<Product>): Promise<Product> {
    const now = new Date().toISOString()

    if (window.electronAPI) {
        const fields = Object.keys(input) as (keyof typeof input)[];
        const sets = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => (typeof input[f] === 'boolean' ? (input[f] ? 1 : 0) : input[f]));

        await window.electronAPI.dbExecute(`
            UPDATE Product SET ${sets}, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?
        `, [...values, now, id]);

        const rows = await window.electronAPI.dbQuery('SELECT * FROM Product WHERE id = ?', [id]);
        return {
            ...rows[0],
            isActive: !!rows[0].isActive,
            isInfinite: !!rows[0].isInfinite
        } as unknown as Product;
    }

    const { data, error } = await supabase
        .from('Product')
        .update({ ...input, updatedAt: now })
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Product
}
/**
 * Update product stock (delta can be negative)
 */
export async function updateProductStock(productId: string, delta: number): Promise<void> {
    if (window.electronAPI) {
        // Check if product is infinite — skip stock update
        const rows = await window.electronAPI.dbQuery('SELECT isInfinite FROM Product WHERE id = ?', [productId]);
        if (rows.length > 0 && rows[0].isInfinite) return;

        await window.electronAPI.dbExecute(
            "UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
            [delta, new Date().toISOString(), productId]
        );
        return;
    }

    // fallback to Supabase (web-only mode)
    const { data: product, error: fetchError } = await supabase
        .from('Product')
        .select('stockQty, isInfinite')
        .eq('id', productId)
        .single()

    if (fetchError) throw fetchError

    // Skip stock update for infinite products
    if (product?.isInfinite) return;

    const newQty = (product?.stockQty ?? 0) + delta

    const { error } = await supabase
        .from('Product')
        .update({ stockQty: newQty, updatedAt: new Date().toISOString() })
        .eq('id', productId)

    if (error) throw error
}

/**
 * Delete a product
 */
export async function deleteProduct(id: string): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute('DELETE FROM Product WHERE id = ?', [id]);
        return;
    }

    const { error } = await supabase
        .from('Product')
        .delete()
        .eq('id', id)

    if (error) throw error
}
