import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { openRegister, closeRegister, getActiveRegister, getRegisterHistory, updateRegister, deleteRegister } from '@/services/cashRegister'

export function useActiveRegister() {
    return useQuery({
        queryKey: ['active-register'],
        queryFn: getActiveRegister,
        staleTime: 0,
        refetchInterval: 10_000,
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

export function useDeleteRegister() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteRegister,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['register-history'] })
        },
    })
}
