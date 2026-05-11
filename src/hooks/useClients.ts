import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClients, createClient, updateClient, deleteClient, getCreditSales, settleSale, settleClientSales, getSalesByClient } from '@/services/clients'
import type { Client } from '@/types'

type ClientInput = Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>

export function useClients() {
    return useQuery({
        queryKey: ['clients'],
        queryFn: getClients,
        staleTime: 1000 * 60 * 10,
    })
}

export function useCreateClient() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createClient,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
    })
}

export function useUpdateClient() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<ClientInput> }) => updateClient(id, input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
    })
}

export function useDeleteClient() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteClient,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
    })
}

export function useCreditSales(clientId?: string) {
    return useQuery({
        queryKey: ['credit-sales', clientId],
        queryFn: () => getCreditSales(clientId),
        staleTime: 1000 * 30,
    })
}

export function useSettleSale() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: settleSale,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['clients'] })
        },
    })
}

export function useSettleClientSales() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: settleClientSales,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['clients'] })
        },
    })
}

export function useSalesByClient(clientId: string | null) {
    return useQuery({
        queryKey: ['sales-by-client', clientId],
        queryFn: () => getSalesByClient(clientId!),
        enabled: !!clientId,
        staleTime: 1000 * 30,
    })
}
