import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getInventoryMovements, createMovement, getProductsStock, updateMovement, deleteMovement } from '@/services/inventory'

export function useCreateMovementBatch() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ entries, batchRef, notes }: {
            entries: Array<{ productId: string; qty: number }>
            batchRef: string
            notes?: string
        }) => {
            for (const e of entries) {
                await createMovement({
                    productId: e.productId,
                    type: 'ENTRADA',
                    quantity: e.qty,
                    reference: batchRef,
                    notes,
                })
            }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products-stock'] })
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['inventory-movements'] })
        },
    })
}

export function useProductsStock() {
    return useQuery({
        queryKey: ['products-stock'],
        queryFn: getProductsStock,
        staleTime: 1000 * 60 * 2,
    })
}

export function useInventoryMovements(filters?: { productId?: string; type?: string }) {
    return useQuery({
        queryKey: ['inventory-movements', filters],
        queryFn: () => getInventoryMovements(filters),
        staleTime: 1000 * 60 * 2,
    })
}

export function useCreateMovement() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createMovement,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products-stock'] })
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['inventory-movements'] })
        },
    })
}

export function useUpdateMovement() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (p: { id: string; newQty: number; type: string; productId: string; oldQty: number }) =>
            updateMovement(p.id, p.newQty, p.type, p.productId, p.oldQty),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products-stock'] })
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['inventory-movements'] })
        },
    })
}

export function useDeleteMovement() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (p: { id: string; type: string; quantity: number; productId: string }) =>
            deleteMovement(p.id, p.type, p.quantity, p.productId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products-stock'] })
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['inventory-movements'] })
        },
    })
}
