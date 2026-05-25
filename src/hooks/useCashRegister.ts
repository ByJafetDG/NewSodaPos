import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { openRegister, closeRegister, getActiveRegister, getRegisterHistory, updateRegister, deleteRegister, getCashAuditEntries, getSaleById, createAdjustment } from '@/services/cashRegister'

export function useActiveRegister() {
    return useQuery({
        queryKey: ['active-register'],
        queryFn: getActiveRegister,
        staleTime: 0,
    })
}

export function useRegisterHistory() {
    return useQuery({
        queryKey: ['register-history'],
        queryFn: () => getRegisterHistory(),
        staleTime: 30_000,
    })
}

export function useOpenRegister() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: openRegister,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['active-register'] }),
    })
}

export function useCloseRegister() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ registerId, finalAmount, notes }: { registerId: string; finalAmount: number; notes?: string | null }) =>
            closeRegister(registerId, finalAmount, notes),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['active-register'] })
            qc.invalidateQueries({ queryKey: ['register-history'] })
        },
    })
}

export function useUpdateRegister() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ registerId, updates }: { registerId: string; updates: { initialAmount?: number; finalAmount?: number; notes?: string | null } }) =>
            updateRegister(registerId, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['active-register'] })
            qc.invalidateQueries({ queryKey: ['register-history'] })
        },
    })
}

export function useCashAudit(registerId: string | null) {
    return useQuery({
        queryKey: ['cash-audit', registerId],
        queryFn: () => getCashAuditEntries(registerId!),
        enabled: !!registerId,
        staleTime: 1000 * 60,
    })
}

export function useSaleDetails(saleId: string | null) {
    return useQuery({
        queryKey: ['sale-detail', saleId],
        queryFn: () => getSaleById(saleId!),
        enabled: !!saleId,
        staleTime: 1000 * 60 * 5,
    })
}

export function useDeleteRegister() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteRegister,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['register-history'] })
        },
    })
}

export function useCreateAdjustment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ cashRegisterId, direction, amount, reason, employeeName }: {
            cashRegisterId: string
            direction: 'IN' | 'OUT'
            amount: number
            reason: string | null
            employeeName: string | null
        }) => createAdjustment(cashRegisterId, direction, amount, reason, employeeName),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['active-register'] })
            qc.invalidateQueries({ queryKey: ['cash-audit'] })
        },
    })
}
