import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProducts, getProductByBarcode, getProductsStock, createProduct, updateProduct, deleteProduct } from '@/services/products'
import type { Product } from '@/types'

/**
 * Hook to fetch all active products
 */
export function useProducts(activeOnly = true) {
    return useQuery({
        queryKey: ['products', activeOnly],
        queryFn: () => getProducts(activeOnly),
        staleTime: 1000 * 60 * 5, // 5 minutes
    })
}

/**
 * Hook to search product by barcode
 */
export function useProductByBarcode(barcode: string | null) {
    return useQuery({
        queryKey: ['product-barcode', barcode],
        queryFn: () => getProductByBarcode(barcode!),
        enabled: !!barcode && barcode.length > 3,
    })
}

/**
 * Hook to fetch products stock levels
 */
export function useProductsStock() {
    return useQuery({
        queryKey: ['products-stock'],
        queryFn: getProductsStock,
    })
}

/**
 * Hook to create a new product
 */
export function useCreateProduct() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createProduct,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['products-stock'] })
        },
    })
}

/**
 * Hook to update an existing product
 */
export function useUpdateProduct() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string, input: Partial<Product> }) => updateProduct(id, input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['products-stock'] })
            qc.invalidateQueries({ queryKey: ['product-barcode'] })
        },
    })
}

/**
 * Hook to delete a product
 */
export function useDeleteProduct() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteProduct,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['products-stock'] })
        },
    })
}
