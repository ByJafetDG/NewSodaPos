import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getReturns, createReturn, getReturnWithItems, getRecentSales } from '@/services/returns'

export function useReturns() {
    return useQuery({
        queryKey: ['returns'],
        queryFn: () => getReturns(),
        staleTime: 30_000,
    })
}

export function useReturnDetail(returnId: string | null) {
    return useQuery({
        queryKey: ['return-detail', returnId],
        queryFn: () => getReturnWithItems(returnId!),
        enabled: !!returnId,
        staleTime: 1000 * 60 * 5,
    })
}

export function useRecentSales() {
    return useQuery({
        queryKey: ['recent-sales-picker'],
        queryFn: () => getRecentSales(50),
        staleTime: 60_000,
    })
}

export function useCreateReturn() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createReturn,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['returns'] })
            qc.invalidateQueries({ queryKey: ['cash-audit'] })
            qc.invalidateQueries({ queryKey: ['products'] })
        },
    })
}
