import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSubcategories, createSubcategory, updateSubcategory, deleteSubcategory } from '@/services/subcategories'

export function useSubcategories() {
    return useQuery({
        queryKey: ['subcategories'],
        queryFn: getSubcategories,
        staleTime: 1000 * 60 * 10,
    })
}

export function useCreateSubcategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createSubcategory,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['subcategories'] }),
    })
}

export function useUpdateSubcategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof updateSubcategory>[1]) =>
            updateSubcategory(id, input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['subcategories'] }),
    })
}

export function useDeleteSubcategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteSubcategory,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['subcategories'] })
            qc.invalidateQueries({ queryKey: ['products'] })
        },
    })
}
