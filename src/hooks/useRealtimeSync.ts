import { useEffect } from 'react'
import { useQueryClient, QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

function invalidateForTable(qc: QueryClient, table: string) {
    switch (table) {
        case 'Product':
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['products-stock'] })
            qc.invalidateQueries({ queryKey: ['product-barcode'] })
            break
        case 'Category':
            qc.invalidateQueries({ queryKey: ['categories'] })
            break
        case 'Subcategory':
            qc.invalidateQueries({ queryKey: ['subcategories'] })
            qc.invalidateQueries({ queryKey: ['products'] })
            break
        case 'Client':
            qc.invalidateQueries({ queryKey: ['clients'] })
            qc.invalidateQueries({ queryKey: ['deleted-clients'] })
            break
        case 'Company':
            qc.invalidateQueries({ queryKey: ['companies'] })
            qc.invalidateQueries({ queryKey: ['deleted-companies'] })
            qc.invalidateQueries({ queryKey: ['all-company-sales'] })
            qc.invalidateQueries({ queryKey: ['company-sales'] })
            break
        case 'Employee':
            qc.invalidateQueries({ queryKey: ['employees'] })
            break
        case 'Sale':
            qc.invalidateQueries({ queryKey: ['sales'] })
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['clients-balances'] })
            qc.invalidateQueries({ queryKey: ['active-register'] })
            qc.invalidateQueries({ queryKey: ['register-history'] })
            qc.invalidateQueries({ queryKey: ['sales-by-client'] })
            qc.invalidateQueries({ queryKey: ['all-company-sales'] })
            qc.invalidateQueries({ queryKey: ['company-sales'] })
            qc.invalidateQueries({ queryKey: ['reports'] })
            qc.invalidateQueries({ queryKey: ['recent-sales-picker'] })
            break
        case 'CashRegister':
            qc.invalidateQueries({ queryKey: ['active-register'] })
            qc.invalidateQueries({ queryKey: ['register-history'] })
            qc.invalidateQueries({ queryKey: ['cash-audit'] })
            break
        case 'Expense':
            qc.invalidateQueries({ queryKey: ['active-register'] })
            qc.invalidateQueries({ queryKey: ['register-history'] })
            qc.invalidateQueries({ queryKey: ['reports'] })
            break
        case 'InventoryMovement':
            qc.invalidateQueries({ queryKey: ['inventory-movements'] })
            qc.invalidateQueries({ queryKey: ['products-stock'] })
            qc.invalidateQueries({ queryKey: ['products'] })
            break
        case 'Payment':
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['clients-balances'] })
            qc.invalidateQueries({ queryKey: ['clients'] })
            qc.invalidateQueries({ queryKey: ['sales-by-client'] })
            qc.invalidateQueries({ queryKey: ['active-register'] })
            break
        case 'BusinessConfig':
            qc.invalidateQueries({ queryKey: ['business-config'] })
            break
        case 'Sorteo':
            qc.invalidateQueries({ queryKey: ['sorteos'] })
            qc.invalidateQueries({ queryKey: ['cartSorteo'] })
            break
        case 'TombolaEntry':
            qc.invalidateQueries({ queryKey: ['tombola-entries'] })
            break
    }
}

export function useRealtimeSync() {
    const qc = useQueryClient()

    useEffect(() => {
        if (window.electronAPI) {
            // Electron: escucha eventos IPC del sync engine y actualiza React Query
            const unsub = window.electronAPI.onDbChanged((data: { table: string }) => {
                invalidateForTable(qc, data.table)
            })
            return unsub
        }

        // Web mode: Supabase realtime directo
        const channel = supabase
            .channel('pos-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Product' }, () => {
                invalidateForTable(qc, 'Product')
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Category' }, () => {
                invalidateForTable(qc, 'Category')
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Client' }, () => {
                invalidateForTable(qc, 'Client')
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Sale' }, () => {
                invalidateForTable(qc, 'Sale')
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'InventoryMovement' }, () => {
                invalidateForTable(qc, 'InventoryMovement')
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Employee' }, () => {
                invalidateForTable(qc, 'Employee')
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'CashRegister' }, () => {
                invalidateForTable(qc, 'CashRegister')
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [qc])
}
