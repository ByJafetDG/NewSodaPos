import { supabase } from '@/lib/supabase'
import type { Product } from '@/types'

export async function getProducts(activeOnly = true): Promise<Product[]> {
    if (window.electronAPI) {
        let sql = `
            SELECT p.*, c.name as cat_name, c.type as cat_type,
              GROUP_CONCAT(ps.subcategoryId) as subcatIds
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.id
            LEFT JOIN ProductSubcategory ps ON p.id = ps.productId
            WHERE (p.isDeleted IS NULL OR p.isDeleted != 1)
        `;
        if (activeOnly) sql += ' AND p.isActive = 1';
        sql += ' GROUP BY p.id ORDER BY p.name ASC';

        const data = await window.electronAPI.dbQuery(sql);
        return data.map(p => ({
            ...p,
            isActive: !!p.isActive,
            isInfinite: !!p.isInfinite,
            category: { id: p.categoryId, name: p.cat_name, type: p.cat_type },
            subcategoryIds: p.subcatIds ? p.subcatIds.split(',') : [],
        })) as unknown as Product[];
    }

    let query = supabase
        .from('Product')
        .select('*, category:Category(*), productSubcategories:ProductSubcategory(subcategoryId)')
        .order('name')

    if (activeOnly) query = query.eq('isActive', true)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((p: any) => ({
        ...p,
        subcategoryIds: (p.productSubcategories ?? []).map((ps: any) => ps.subcategoryId),
    })) as unknown as Product[]
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
    if (window.electronAPI) {
        const sql = `
            SELECT p.*, c.name as cat_name, c.type as cat_type,
              GROUP_CONCAT(ps.subcategoryId) as subcatIds
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.id
            LEFT JOIN ProductSubcategory ps ON p.id = ps.productId
            WHERE p.barcode = ? AND p.isActive = 1
            GROUP BY p.id
            LIMIT 1
        `;
        const data = await window.electronAPI.dbQuery(sql, [barcode]);
        if (data.length === 0) return null;
        const p = data[0];
        return {
            ...p,
            isActive: !!p.isActive,
            category: { id: p.categoryId, name: p.cat_name, type: p.cat_type },
            subcategoryIds: p.subcatIds ? p.subcatIds.split(',') : [],
        } as unknown as Product;
    }

    const { data, error } = await supabase
        .from('Product')
        .select('*, category:Category(*), productSubcategories:ProductSubcategory(subcategoryId)')
        .eq('barcode', barcode)
        .eq('isActive', true)
        .maybeSingle()

    if (error) throw error
    if (!data) return null
    return {
        ...data,
        subcategoryIds: ((data as any).productSubcategories ?? []).map((ps: any) => ps.subcategoryId),
    } as unknown as Product
}

export async function getProductsStock(): Promise<any[]> {
    if (window.electronAPI) {
        const sql = `
            SELECT p.*, c.name as cat_name,
              GROUP_CONCAT(ps.subcategoryId) as subcatIds
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.id
            LEFT JOIN ProductSubcategory ps ON p.id = ps.productId
            WHERE (p.isDeleted IS NULL OR p.isDeleted != 1)
            GROUP BY p.id
            ORDER BY p.stockQty ASC
        `;
        const data = await window.electronAPI.dbQuery(sql);
        return data.map(p => ({
            ...p,
            category: { name: p.cat_name },
            subcategoryIds: p.subcatIds ? p.subcatIds.split(',') : [],
        }));
    }

    const { data, error } = await supabase
        .from('Product')
        .select('*, category:Category(name), productSubcategories:ProductSubcategory(subcategoryId)')
        .or('isDeleted.is.null,isDeleted.eq.false')
        .order('stockQty')

    if (error) throw error
    return (data ?? []).map((p: any) => ({
        ...p,
        subcategoryIds: (p.productSubcategories ?? []).map((ps: any) => ps.subcategoryId),
    }))
}

export async function createProduct(input: Partial<Product>): Promise<Product> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const { subcategoryIds, ...productInput } = input as any

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(`
            INSERT INTO Product (id, name, barcode, categoryId, subcategoryId, price, cost, minStock, stockQty, isActive, isInfinite, syncStatus, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'PENDING', ?)
        `, [id, productInput.name, productInput.barcode || null, productInput.categoryId, subcategoryIds?.[0] ?? null, productInput.price, productInput.cost || 0, productInput.minStock || 0, productInput.stockQty || 0, productInput.isInfinite ? 1 : 0, now]);

        if (subcategoryIds?.length) {
            for (const subId of subcategoryIds) {
                await window.electronAPI.dbExecute(
                    `INSERT OR IGNORE INTO ProductSubcategory (productId, subcategoryId) VALUES (?, ?)`,
                    [id, subId]
                );
            }
        }

        return { ...productInput, id, isActive: true, subcategoryIds: subcategoryIds ?? [], updatedAt: now } as unknown as Product;
    }

    const { data, error } = await supabase
        .from('Product')
        .insert({ ...productInput, id, isActive: true, syncStatus: 'SYNCED', updatedAt: now })
        .select()
        .single()

    if (error) throw error

    if (subcategoryIds?.length) {
        await supabase.from('ProductSubcategory').insert(
            subcategoryIds.map((subId: string) => ({ productId: id, subcategoryId: subId }))
        )
    }

    return { ...data, subcategoryIds: subcategoryIds ?? [] } as unknown as Product
}

export async function updateProduct(id: string, input: Partial<Product>): Promise<Product> {
    const now = new Date().toISOString()
    const { subcategoryIds, ...productInput } = input as any

    if (window.electronAPI) {
        const fields = Object.keys(productInput) as string[];
        if (fields.length > 0) {
            const sets = fields.map(f => `${f} = ?`).join(', ');
            const values = fields.map(f => (typeof productInput[f] === 'boolean' ? (productInput[f] ? 1 : 0) : productInput[f]));
            await window.electronAPI.dbExecute(`
                UPDATE Product SET ${sets}, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?
            `, [...values, now, id]);
        }

        if ('subcategoryIds' in input) {
            await window.electronAPI.dbExecute(`DELETE FROM ProductSubcategory WHERE productId = ?`, [id]);
            for (const subId of (subcategoryIds ?? [])) {
                await window.electronAPI.dbExecute(
                    `INSERT OR IGNORE INTO ProductSubcategory (productId, subcategoryId) VALUES (?, ?)`,
                    [id, subId]
                );
            }
        }

        const rows = await window.electronAPI.dbQuery(
            `SELECT p.*, GROUP_CONCAT(ps.subcategoryId) as subcatIds
             FROM Product p
             LEFT JOIN ProductSubcategory ps ON p.id = ps.productId
             WHERE p.id = ?
             GROUP BY p.id`,
            [id]
        );
        return {
            ...rows[0],
            isActive: !!rows[0].isActive,
            isInfinite: !!rows[0].isInfinite,
            subcategoryIds: rows[0].subcatIds ? rows[0].subcatIds.split(',') : [],
        } as unknown as Product;
    }

    const { data, error } = await supabase
        .from('Product')
        .update({ ...productInput, updatedAt: now })
        .eq('id', id)
        .select()
        .single()

    if (error) throw error

    if ('subcategoryIds' in input) {
        await supabase.from('ProductSubcategory').delete().eq('productId', id)
        if (subcategoryIds?.length) {
            await supabase.from('ProductSubcategory').insert(
                subcategoryIds.map((subId: string) => ({ productId: id, subcategoryId: subId }))
            )
        }
    }

    return { ...data, subcategoryIds: subcategoryIds ?? [] } as unknown as Product
}

export async function updateProductStock(productId: string, delta: number): Promise<void> {
    if (window.electronAPI) {
        const rows = await window.electronAPI.dbQuery('SELECT isInfinite FROM Product WHERE id = ?', [productId]);
        if (rows.length > 0 && rows[0].isInfinite) return;

        await window.electronAPI.dbExecute(
            "UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
            [delta, new Date().toISOString(), productId]
        );
        return;
    }

    const { data: product, error: fetchError } = await supabase
        .from('Product')
        .select('stockQty, isInfinite')
        .eq('id', productId)
        .single()

    if (fetchError) throw fetchError
    if (product?.isInfinite) return;

    const newQty = (product?.stockQty ?? 0) + delta

    const { error } = await supabase
        .from('Product')
        .update({ stockQty: newQty, updatedAt: new Date().toISOString() })
        .eq('id', productId)

    if (error) throw error
}

export async function getDeletedProducts(): Promise<any[]> {
    if (window.electronAPI) {
        const data = await window.electronAPI.dbQuery(`
            SELECT p.*, c.name as cat_name FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.id
            WHERE p.isDeleted = 1 ORDER BY p.name ASC
        `)
        return data
    }
    const { data } = await supabase
        .from('Product')
        .select('*, category:Category(name)')
        .eq('isDeleted', true)
        .order('name')
    return data ?? []
}

export async function restoreProduct(id: string): Promise<void> {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            "UPDATE Product SET isDeleted = 0, isActive = 1, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
            [now, id]
        )
        return
    }
    const { error } = await supabase
        .from('Product')
        .update({ isDeleted: false, isActive: true, updatedAt: now })
        .eq('id', id)
    if (error) throw error
}

export async function hardDeleteProduct(id: string): Promise<void> {
    if (window.electronAPI) {
        const saleItems = await window.electronAPI.dbQuery(
            'SELECT id FROM SaleItem WHERE productId = ? LIMIT 1', [id]
        )
        if (saleItems.length > 0) throw new Error('El producto tiene ventas y no puede eliminarse permanentemente')
        await window.electronAPI.dbExecute('DELETE FROM ProductSubcategory WHERE productId = ?', [id])
        await window.electronAPI.dbExecute('DELETE FROM Product WHERE id = ?', [id])
        return
    }
    const { count } = await supabase
        .from('SaleItem').select('id', { count: 'exact', head: true }).eq('productId', id)
    if ((count ?? 0) > 0) throw new Error('El producto tiene ventas y no puede eliminarse permanentemente')
    await supabase.from('ProductSubcategory').delete().eq('productId', id)
    const { error } = await supabase.from('Product').delete().eq('id', id)
    if (error) throw error
}

export async function deleteProduct(id: string): Promise<{ soft: boolean }> {
    const now = new Date().toISOString()

    if (window.electronAPI) {
        const saleItems = await window.electronAPI.dbQuery(
            'SELECT id FROM SaleItem WHERE productId = ? LIMIT 1', [id]
        )
        await window.electronAPI.dbExecute(
            `UPDATE Product SET isDeleted = 1, isActive = 0, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
            [now, id]
        )
        return { soft: saleItems.length > 0 }
    }

    const { count } = await supabase
        .from('SaleItem')
        .select('id', { count: 'exact', head: true })
        .eq('productId', id)

    if ((count ?? 0) > 0) {
        const { error } = await supabase
            .from('Product')
            .update({ isDeleted: true, isActive: false, updatedAt: now })
            .eq('id', id)
        if (error) throw error
        return { soft: true }
    }

    const { error } = await supabase
        .from('Product')
        .delete()
        .eq('id', id)
    if (error) throw error
    return { soft: false }
}
