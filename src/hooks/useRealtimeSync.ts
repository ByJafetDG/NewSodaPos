import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useRealtimeSync() {
    const qc = useQueryClient()

    useEffect(() => {
        if (window.electronAPI) return

        const channel = supabase
            .channel('pos-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Product' }, () => {
                qc.invalidateQueries({ queryKey: ['products'] })
                qc.invalidateQueries({ queryKey: ['products-stock'] })
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Category' }, () => {
                qc.invalidateQueries({ queryKey: ['categories'] })
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Client' }, () => {
                qc.invalidateQueries({ queryKey: ['clients'] })
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Sale' }, () => {
                qc.invalidateQueries({ queryKey: ['credit-sales'] })
                qc.invalidateQueries({ queryKey: ['sales'] })
                qc.invalidateQueries({ queryKey: ['clients-balances'] })
                qc.invalidateQueries({ queryKey: ['active-register'] })
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'InventoryMovement' }, () => {
                qc.invalidateQueries({ queryKey: ['products-stock'] })
                qc.invalidateQueries({ queryKey: ['products'] })
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'Employee' }, () => {
                qc.invalidateQueries({ queryKey: ['employees'] })
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'CashRegister' }, () => {
                qc.invalidateQueries({ queryKey: ['active-register'] })
                qc.invalidateQueries({ queryKey: ['register-history'] })
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [qc])
}
