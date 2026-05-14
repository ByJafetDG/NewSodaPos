import { useQuery } from '@tanstack/react-query'
import { getReportData } from '@/services/reports'

export function useReportData(from: string, to: string) {
    return useQuery({
        queryKey: ['reports', from, to],
        queryFn: () => getReportData(from, to),
        staleTime: 0,
        refetchOnMount: true,
    })
}
