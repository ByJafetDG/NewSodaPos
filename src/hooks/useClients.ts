import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClients, createClient, updateClient, deleteClient, getDeletedClients, restoreClient, hardDeleteClient, getCreditSales, settleSale, settleClientSales, settleClientSalesWithMethod, getSalesByClient, deleteCreditSale, settleSaleDirect, getCompanies, getDeletedCompanies, createCompany, updateCompany, deleteCompany, restoreCompany, hardDeleteCompany } from '@/services/clients'
import { getSalesForCompany, getAllCompanySales } from '@/services/sales'
import { toast } from '@/components/ui/Toast'
import type { Client, Company } from '@/types'

type ClientInput = Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>
type CompanyInput = Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>

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
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['clients'] })
            qc.invalidateQueries({ queryKey: ['deleted-clients'] })
        },
    })
}

export function useDeletedClients() {
    return useQuery({
        queryKey: ['deleted-clients'],
        queryFn: getDeletedClients,
        staleTime: 1000 * 60,
    })
}

export function useRestoreClient() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: restoreClient,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['clients'] })
            qc.invalidateQueries({ queryKey: ['deleted-clients'] })
        },
    })
}

export function useHardDeleteClient() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: hardDeleteClient,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['deleted-clients'] })
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['sales-by-client'] })
        },
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
        mutationFn: (id: string) => settleSaleDirect(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['clients'] })
            qc.invalidateQueries({ queryKey: ['active-register'] })
        },
        onError: (err: Error) => toast.error(err.message),
    })
}

export function useSettleSaleDirect() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (saleId: string) => settleSaleDirect(saleId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['clients'] })
            qc.invalidateQueries({ queryKey: ['active-register'] })
        },
        onError: (err: Error) => toast.error(err.message),
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

export function useDeleteCreditSale() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteCreditSale,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['sales-by-client'] })
            qc.invalidateQueries({ queryKey: ['active-register'] })
            qc.invalidateQueries({ queryKey: ['register-history'] })
        },
        onError: (err: Error) => toast.error(err.message),
    })
}

export function useSettleClientSalesWithMethod() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ clientId, method }: { clientId: string; method: string }) =>
            settleClientSalesWithMethod(clientId, method),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['clients'] })
        },
    })
}

export function useConvertCreditPayment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ saleId, method, cashRegisterId }: { saleId: string; method: string; cashRegisterId: string | null }) =>
            settleSaleDirect(saleId, { paymentMethod: method, cashRegisterId: cashRegisterId ?? undefined }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['sales-by-client'] })
            qc.invalidateQueries({ queryKey: ['active-register'] })
            qc.invalidateQueries({ queryKey: ['register-history'] })
        },
        onError: (err: Error) => toast.error(err.message),
    })
}

// ─── Company hooks ────────────────────────────────────────────────────────────

export function useCompanies() {
    return useQuery({
        queryKey: ['companies'],
        queryFn: getCompanies,
        staleTime: 1000 * 60 * 10,
    })
}

export function useCreateCompany() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createCompany,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
    })
}

export function useUpdateCompany() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<CompanyInput> }) => updateCompany(id, input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['companies'] }),
    })
}

export function useDeleteCompany() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteCompany,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['companies'] })
            qc.invalidateQueries({ queryKey: ['deleted-companies'] })
        },
    })
}

export function useDeletedCompanies() {
    return useQuery({
        queryKey: ['deleted-companies'],
        queryFn: getDeletedCompanies,
        staleTime: 1000 * 60,
    })
}

export function useRestoreCompany() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: restoreCompany,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['companies'] })
            qc.invalidateQueries({ queryKey: ['deleted-companies'] })
            qc.invalidateQueries({ queryKey: ['clients'] })
        },
    })
}

export function useHardDeleteCompany() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: hardDeleteCompany,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['deleted-companies'] })
            qc.invalidateQueries({ queryKey: ['clients'] })
            qc.invalidateQueries({ queryKey: ['all-company-sales'] })
            qc.invalidateQueries({ queryKey: ['company-sales'] })
        },
    })
}

export function useCompanySales(companyId: string | null) {
    return useQuery({
        queryKey: ['company-sales', companyId],
        queryFn: () => getSalesForCompany(companyId!),
        enabled: !!companyId,
        staleTime: 1000 * 30,
    })
}

export function useAllCompanySales() {
    return useQuery({
        queryKey: ['all-company-sales'],
        queryFn: getAllCompanySales,
        staleTime: 1000 * 30,
    })
}
