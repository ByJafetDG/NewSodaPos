import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createSale, voidSale, updateCreditSaleItems } from '@/services/sales'
import type { CartItem, PaymentMethod } from '@/types'

interface UseSaleInput {
    items: CartItem[]
    subtotal: number
    discount: number
    total: number
    paymentMethod: PaymentMethod
    amountReceived: number | null
    change: number | null
    isCredit: boolean
    clientId: string | null
    cashRegisterId: string | null
    notes: string | null
}

/**
 * Mutation hook to create a sale
 */
export function useCreateSale() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: createSale,
        networkMode: 'always',
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] })
            queryClient.invalidateQueries({ queryKey: ['clients-balances'] })
            queryClient.invalidateQueries({ queryKey: ['credit-sales'] })
        },
    })
}

/**
 * Mutation hook to update credit sale items (edit quantities/prices)
 */
export function useUpdateCreditSaleItems() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (p: { saleId: string; items: Array<{ id: string; productId: string; quantity: number; unitPrice: number; oldQuantity: number }> }) =>
            updateCreditSaleItems(p.saleId, p.items),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] })
            queryClient.invalidateQueries({ queryKey: ['credit-sales'] })
            queryClient.invalidateQueries({ queryKey: ['clients-balances'] })
        },
    })
}

/**
 * Mutation hook to void a sale
 */
export function useVoidSale() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: voidSale,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] })
            queryClient.invalidateQueries({ queryKey: ['credit-sales'] })
            queryClient.invalidateQueries({ queryKey: ['clients-balances'] })
            queryClient.invalidateQueries({ queryKey: ['sales'] })
            queryClient.invalidateQueries({ queryKey: ['reports'] })
        },
    })
}
