import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    getSorteos, getActiveSorteos, createSorteo, updateSorteo, deleteSorteo,
    getSorteoOptions, getSorteoParticipants, getSorteoStats, getOccupiedParticipants,
    getSorteoWinners, getRaspaditaCards,
} from '@/services/sorteos'
import type { Sorteo, SorteoOption, SorteoParticipant } from '@/types'

interface CartSorteoResult {
    sorteo: Sorteo
    options: SorteoOption[]
    participants: SorteoParticipant[]
}

export function useSorteos() {
    return useQuery({
        queryKey: ['sorteos'],
        queryFn: getSorteos,
        staleTime: 1000 * 60 * 5,
    })
}

export function useCreateSorteo() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: createSorteo,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sorteos'] }),
    })
}

export function useUpdateSorteo() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof updateSorteo>[1]) =>
            updateSorteo(id, input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sorteos'] }),
    })
}

export function useDeleteSorteo() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: deleteSorteo,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sorteos'] }),
    })
}

export function useSorteoOptions(sorteoId: string | null) {
    return useQuery({
        queryKey: ['sorteoOptions', sorteoId],
        queryFn: () => getSorteoOptions(sorteoId!),
        enabled: !!sorteoId,
    })
}

export function useSorteoParticipants(sorteoId: string | null) {
    return useQuery({
        queryKey: ['sorteoParticipants', sorteoId],
        queryFn: () => getSorteoParticipants(sorteoId!),
        enabled: !!sorteoId,
    })
}

export function useCartSorteo(productIds: string[], categoryIds: string[]) {
    return useQuery({
        queryKey: ['cartSorteo', productIds.slice().sort().join(), categoryIds.slice().sort().join()],
        queryFn: async (): Promise<CartSorteoResult | null> => {
            const sorteos = await getActiveSorteos()
            for (const sorteo of sorteos) {
                const participants = await getSorteoParticipants(sorteo.id)
                const matches = participants.some(p =>
                    (p.type === 'PRODUCT' && productIds.includes(p.refId)) ||
                    (p.type === 'CATEGORY' && categoryIds.includes(p.refId))
                )
                if (matches) {
                    const options = await getSorteoOptions(sorteo.id)
                    return { sorteo, options, participants }
                }
            }
            return null
        },
        enabled: productIds.length > 0,
        staleTime: 1000 * 30,
        refetchInterval: 1000 * 60,
    })
}

export function useSorteoStats(sorteoId: string | null) {
    return useQuery({
        queryKey: ['sorteoStats', sorteoId],
        queryFn: () => getSorteoStats(sorteoId!),
        enabled: !!sorteoId,
    })
}

export function useOccupiedParticipants(excludeSorteoId?: string) {
    return useQuery({
        queryKey: ['occupiedParticipants', excludeSorteoId ?? null],
        queryFn: () => getOccupiedParticipants(excludeSorteoId),
        staleTime: 1000 * 30,
    })
}

export function useSorteoWinners(sorteoId: string | null) {
    return useQuery({
        queryKey: ['sorteoWinners', sorteoId],
        queryFn: () => getSorteoWinners(sorteoId!),
        enabled: !!sorteoId,
        staleTime: 1000 * 30,
    })
}

export function useRaspaditaCards(sorteoId: string | null) {
    return useQuery({
        queryKey: ['raspaditaCards', sorteoId],
        queryFn: () => getRaspaditaCards(sorteoId!),
        enabled: !!sorteoId,
        staleTime: 0,
    })
}
