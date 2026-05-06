import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/services/categories'

export function useCategories(activeOnly = true) {
    return useQuery({
        queryKey: ['categories', activeOnly],
        queryFn: () => getCategories(activeOnly),
        staleTime: 1000 * 60 * 10,
    })
}

export function useCreateCategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createCategory,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    })
}

export function useUpdateCategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...input }: { id: string; name?: string; type?: string; icon?: string; isActive?: boolean; sortOrder?: number }) =>
            updateCategory(id, input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['categories'] })
            qc.invalidateQueries({ queryKey: ['products'] })
        },
    })
}

export function useDeleteCategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteCategory,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['categories'] })
            qc.invalidateQueries({ queryKey: ['products'] })
        },
    })
}
