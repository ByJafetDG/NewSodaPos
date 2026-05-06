import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBusinessConfig, updateBusinessConfig, type UpdateConfigInput } from '@/services/config'

export function useBusinessConfig() {
    return useQuery({
        queryKey: ['business-config'],
        queryFn: getBusinessConfig,
        staleTime: 1000 * 60 * 5,
    })
}

export function useUpdateConfig() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: UpdateConfigInput) => updateBusinessConfig(input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['business-config'] }),
    })
}
