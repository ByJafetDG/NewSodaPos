import { supabase } from '@/lib/supabase'

// ===== Types =====
interface CreateMovementInput {
    productId: string
    type: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'VENTA'
    quantity: number
    cost?: number
    reference?: string
    notes?: string
}

// ===== Get Inventory Movements =====
export async function getInventoryMovements(filters?: {
    productId?: string
    type?: string
    startDate?: string
    endDate?: string
}) {
    if (window.electronAPI) {
        let sql = `
            SELECT m.*, p.name as product_name, p.barcode as product_barcode
            FROM InventoryMovement m
            LEFT JOIN Product p ON m.productId = p.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (filters?.productId) {
            sql += ' AND m.productId = ?';
            params.push(filters.productId);
        }
        if (filters?.type) {
            sql += ' AND m.type = ?';
            params.push(filters.type);
        }
        if (filters?.startDate) {
            sql += ' AND m.date >= ?';
            params.push(filters.startDate);
        }
        if (filters?.endDate) {
            sql += ' AND m.date <= ?';
            params.push(filters.endDate);
        }

        sql += ' ORDER BY m.date DESC LIMIT 200';
        const data = await window.electronAPI.dbQuery(sql, params);
        return data.map(m => ({
            ...m,
            product: { id: m.productId, name: m.product_name, barcode: m.product_barcode }
        }));
    }

    let query = supabase
        .from('InventoryMovement')
        .select('*, product:Product(id, name, barcode)')
        .order('date', { ascending: false })
        .limit(200)

    if (filters?.productId) query = query.eq('productId', filters.productId)
    if (filters?.type) query = query.eq('type', filters.type)
    if (filters?.startDate) query = query.gte('date', filters.startDate)
    if (filters?.endDate) query = query.lte('date', filters.endDate)

    const { data, error } = await query
    if (error) throw error
    return data ?? []
}

// ===== Create Movement & Update Stock =====
export async function createMovement(input: CreateMovementInput) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        // Local SQLite transaction
        await window.electronAPI.dbExecute(`
            INSERT INTO InventoryMovement (id, productId, type, quantity, cost, reference, notes, date, syncStatus)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `, [id, input.productId, input.type, input.quantity, input.cost ?? null, input.reference ?? null, input.notes ?? null, now]);

        const delta = input.type === 'ENTRADA' ? Math.abs(input.quantity)
            : input.type === 'AJUSTE' ? input.quantity
                : -Math.abs(input.quantity);

        await window.electronAPI.dbExecute(
            "UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
            [delta, now, input.productId]
        );
        return;
    }

    // 1. Insert movement
    const { error: movError } = await supabase
        .from('InventoryMovement')
        .insert({
            id,
            productId: input.productId,
            type: input.type,
            quantity: input.quantity,
            cost: input.cost ?? null,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            date: now,
            syncStatus: 'SYNCED',
        })

    if (movError) throw movError

    // 2. Update product stock
    // Get current stock
    const { data: product, error: pError } = await supabase
        .from('Product')
        .select('stockQty')
        .eq('id', input.productId)
        .single()

    if (pError) throw pError

    const delta = input.type === 'ENTRADA' ? Math.abs(input.quantity)
        : input.type === 'AJUSTE' ? input.quantity
            : -Math.abs(input.quantity)

    const { error: updateError } = await supabase
        .from('Product')
        .update({
            stockQty: product.stockQty + delta,
            updatedAt: now,
        })
        .eq('id', input.productId)

    if (updateError) throw updateError
}

// ===== Update Movement Quantity (reverses old delta, applies new) =====
export async function updateMovement(id: string, newQty: number, type: string, productId: string, oldQty: number) {
    const now = new Date().toISOString()
    const delta = (qty: number) =>
        type === 'ENTRADA' ? Math.abs(qty) : type === 'AJUSTE' ? qty : -Math.abs(qty)
    const netChange = delta(newQty) - delta(oldQty)

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            "UPDATE InventoryMovement SET quantity = ?, syncStatus = 'PENDING' WHERE id = ?",
            [newQty, id]
        )
        await window.electronAPI.dbExecute(
            "UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
            [netChange, now, productId]
        )
        return
    }
    const { error } = await supabase.from('InventoryMovement').update({ quantity: newQty }).eq('id', id)
    if (error) throw error
    const { data: product, error: pErr } = await supabase.from('Product').select('stockQty').eq('id', productId).single()
    if (pErr) throw pErr
    const { error: uErr } = await supabase.from('Product').update({ stockQty: product.stockQty + netChange, updatedAt: now }).eq('id', productId)
    if (uErr) throw uErr
}

// ===== Delete Movement (reverses its stock delta) =====
export async function deleteMovement(id: string, type: string, quantity: number, productId: string) {
    const now = new Date().toISOString()
    const reversal = type === 'ENTRADA' ? -Math.abs(quantity) : type === 'AJUSTE' ? -quantity : Math.abs(quantity)

    if (window.electronAPI) {
        await window.electronAPI.dbExecute("DELETE FROM InventoryMovement WHERE id = ?", [id])
        await window.electronAPI.dbExecute(
            "UPDATE Product SET stockQty = stockQty + ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?",
            [reversal, now, productId]
        )
        return
    }
    const { error } = await supabase.from('InventoryMovement').delete().eq('id', id)
    if (error) throw error
    const { data: product, error: pErr } = await supabase.from('Product').select('stockQty').eq('id', productId).single()
    if (pErr) throw pErr
    const { error: uErr } = await supabase.from('Product').update({ stockQty: product.stockQty + reversal, updatedAt: now }).eq('id', productId)
    if (uErr) throw uErr
}

// ===== Get Products with Stock Info =====
export async function getProductsStock() {
    if (window.electronAPI) {
        const sql = `
            SELECT p.*, c.name as cat_name, c.type as cat_type
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.id
            WHERE p.isActive = 1
            ORDER BY p.name ASC
        `;
        const data = await window.electronAPI.dbQuery(sql);
        return data.map(p => ({
            ...p,
            isActive: !!p.isActive,
            category: { name: p.cat_name, type: p.cat_type }
        }));
    }

    const { data, error } = await supabase
        .from('Product')
        .select('*, category:Category(name, type)')
        .eq('isActive', true)
        .order('name')

    if (error) throw error
    return data ?? []
}
