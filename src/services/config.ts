import { supabase } from '@/lib/supabase'

export interface UpdateConfigInput {
    name?: string
    address?: string | null
    phone?: string | null
    ticketHeader?: string | null
    ticketFooter?: string | null
    ticketLogoUrl?: string | null
    emailLogoUrl?: string | null
    printerPort?: string | null
    printerModel?: string | null
    drawerEnabled?: boolean
}

export async function getBusinessConfig() {
    if (window.electronAPI) {
        const row = await window.electronAPI.dbGet("SELECT * FROM BusinessConfig WHERE id = 'default'")
        if (!row) return null
        return { ...row, drawerEnabled: !!row.drawerEnabled }
    }
    const { data, error } = await supabase.from('BusinessConfig').select('*').eq('id', 'default').single()
    if (error && error.code !== 'PGRST116') throw error
    return data
}

export async function updateBusinessConfig(input: UpdateConfigInput) {
    const now = new Date().toISOString()
    if (window.electronAPI) {
        const existing = await window.electronAPI.dbGet("SELECT id FROM BusinessConfig WHERE id = 'default'")
        if (existing) {
            const fields = Object.entries(input).map(([k]) => `${k} = ?`).join(', ')
            const values = Object.values(input).map(v => typeof v === 'boolean' ? (v ? 1 : 0) : v)
            await window.electronAPI.dbExecute(
                `UPDATE BusinessConfig SET ${fields}, updatedAt = ?, syncStatus = 'PENDING' WHERE id = 'default'`,
                [...values, now]
            )
        } else {
            await window.electronAPI.dbExecute(
                `INSERT INTO BusinessConfig (id, name, address, phone, ticketHeader, ticketFooter, printerPort, printerModel, drawerEnabled, syncStatus, updatedAt)
                 VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
                [
                    input.name ?? 'Mi Soda', input.address ?? null, input.phone ?? null,
                    input.ticketHeader ?? null, input.ticketFooter ?? '¡Gracias por su compra!',
                    input.printerPort ?? null, input.printerModel ?? null,
                    input.drawerEnabled !== undefined ? (input.drawerEnabled ? 1 : 0) : 1,
                    now,
                ]
            )
        }
        return getBusinessConfig()
    }
    const { data, error } = await supabase.from('BusinessConfig').upsert({
        id: 'default', ...input, updatedAt: now,
    }, { onConflict: 'id' }).select().single()
    if (error) throw error
    return data
}
