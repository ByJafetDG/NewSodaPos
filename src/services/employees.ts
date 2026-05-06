import { supabase } from '@/lib/supabase'
import type { Employee } from '@/types'

/**
 * Get all active employees. Auto-deactivates expired TEMPORAL employees.
 */
export async function getEmployees(): Promise<Employee[]> {
    const today = new Date().toISOString().slice(0, 10)

    if (window.electronAPI) {
        // Auto-deactivate expired temporals
        await window.electronAPI.dbExecute(
            `UPDATE Employee SET isActive = 0, syncStatus = 'PENDING', updatedAt = datetime('now')
             WHERE role = 'TEMPORAL' AND activeTo IS NOT NULL AND activeTo < ? AND isActive = 1`,
            [today]
        )
        const data = await window.electronAPI.dbQuery(
            'SELECT * FROM Employee WHERE isActive = 1 ORDER BY name ASC'
        )
        return data.map((e: any) => ({
            ...e,
            isActive: !!e.isActive,
            monthlySales: e.monthlySales || 0,
            lastResetMonth: e.lastResetMonth || null,
            activeFrom: e.activeFrom || null,
            activeTo: e.activeTo || null,
        })) as unknown as Employee[]
    }

    const { data, error } = await supabase
        .from('Employee')
        .select('*')
        .eq('isActive', true)
        .order('name')

    if (error) throw error
    return (data ?? []) as unknown as Employee[]
}

/**
 * Create a new employee
 */
export async function createEmployee(employee: {
    name: string; role?: string; pin?: string | null
    activeFrom?: string | null; activeTo?: string | null
}): Promise<Employee> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            'INSERT INTO Employee (id, name, role, pin, activeFrom, activeTo, syncStatus) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, employee.name, employee.role || 'CAJERO', employee.pin || null, employee.activeFrom || null, employee.activeTo || null, 'PENDING']
        )
        const rows = await window.electronAPI.dbQuery('SELECT * FROM Employee WHERE id = ?', [id])
        return rows[0] as unknown as Employee
    }

    const { data, error } = await supabase
        .from('Employee')
        .insert([{
            id,
            name: employee.name,
            role: employee.role || 'CAJERO',
            pin: employee.pin || null,
            activeFrom: employee.activeFrom || null,
            activeTo: employee.activeTo || null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
        }])
        .select()
        .single()

    if (error) throw error
    return data as unknown as Employee
}

/**
 * Update an existing employee
 */
export async function updateEmployee(id: string, updates: {
    name?: string; role?: string; pin?: string | null
    activeFrom?: string | null; activeTo?: string | null
}): Promise<void> {
    if (window.electronAPI) {
        const sets: string[] = ["updatedAt = datetime('now')", "syncStatus = 'PENDING'"]
        const params: any[] = []

        if (updates.name !== undefined)       { sets.push('name = ?');       params.push(updates.name) }
        if (updates.role !== undefined)       { sets.push('role = ?');       params.push(updates.role) }
        if (updates.pin !== undefined)        { sets.push('pin = ?');        params.push(updates.pin) }
        if (updates.activeFrom !== undefined) { sets.push('activeFrom = ?'); params.push(updates.activeFrom) }
        if (updates.activeTo !== undefined)   { sets.push('activeTo = ?');   params.push(updates.activeTo) }

        params.push(id)
        await window.electronAPI.dbExecute(`UPDATE Employee SET ${sets.join(', ')} WHERE id = ?`, params)
        return
    }

    const { error } = await supabase
        .from('Employee')
        .update({ ...updates, updatedAt: new Date().toISOString() })
        .eq('id', id)

    if (error) throw error
}

/**
 * Deactivate (soft-delete) an employee
 */
export async function deactivateEmployee(id: string): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            'UPDATE Employee SET isActive = 0, syncStatus = \'PENDING\', updatedAt = datetime(\'now\') WHERE id = ?',
            [id]
        );
        return
    }

    const { error } = await supabase
        .from('Employee')
        .update({ isActive: false, updatedAt: new Date().toISOString() })
        .eq('id', id)

    if (error) throw error
}

/**
 * Increment monthly sales for an employee
 */
export async function incrementEmployeeSales(id: string): Promise<void> {
    if (window.electronAPI) {
        await window.electronAPI.dbExecute(
            'UPDATE Employee SET monthlySales = monthlySales + 1, syncStatus = \'PENDING\', updatedAt = datetime(\'now\') WHERE id = ?',
            [id]
        );
        return
    }

    const { error } = await supabase.rpc('increment_employee_sales', { employee_id: id });
    if (error) {
        // Fallback if RPC doesn't exist
        const { data: emp } = await supabase.from('Employee').select('monthlySales').eq('id', id).single();
        await supabase.from('Employee')
            .update({ monthlySales: (emp?.monthlySales || 0) + 1, updatedAt: new Date().toISOString() })
            .eq('id', id);
    }
}

/**
 * Check if month changed and reset all employee sales if so
 */
export async function checkAndResetMonthlySales(): Promise<void> {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    if (window.electronAPI) {
        const rows = await window.electronAPI.dbQuery('SELECT lastResetMonth FROM Employee LIMIT 1');
        const lastReset = rows[0]?.lastResetMonth;

        if (lastReset !== currentMonth) {
            await window.electronAPI.dbExecute(
                'UPDATE Employee SET monthlySales = 0, lastResetMonth = ?, syncStatus = \'PENDING\', updatedAt = datetime(\'now\')',
                [currentMonth]
            );
        }
        return
    }

    // Supabase logic (can be handled by a cron job too, but here as safety)
    const { data: employees } = await supabase.from('Employee').select('lastResetMonth').limit(1);
    if (employees && employees[0]?.lastResetMonth !== currentMonth) {
        await supabase.from('Employee')
            .update({ monthlySales: 0, lastResetMonth: currentMonth, updatedAt: new Date().toISOString() })
            .neq('id', 'placeholder'); // Update all
    }
}

