import { useQuery } from '@tanstack/react-query'
import { getReportData, getCashierHistoricalLeaderboard } from '@/services/reports'

export function useReportData(from: string, to: string) {
    return useQuery({
        queryKey: ['reports', from, to],
        queryFn: () => getReportData(from, to),
        staleTime: 0,
        refetchOnMount: true,
    })
}

export function useCashierLeaderboard() {
    return useQuery({
        queryKey: ['cashier-leaderboard'],
        queryFn: getCashierHistoricalLeaderboard,
        staleTime: 60 * 60 * 1000,
    })
}
