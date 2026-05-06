import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getEmployees, createEmployee, updateEmployee, deactivateEmployee, incrementEmployeeSales, checkAndResetMonthlySales } from '@/services/employees'

/**
 * Hook to fetch all active employees (for cashier selection)
 */
export function useEmployees() {
    return useQuery({
        queryKey: ['employees'],
        queryFn: getEmployees,
        staleTime: 1000 * 60 * 30, // 30 minutes
    })
}

/**
 * Hook to create a new employee
 */
export function useCreateEmployee() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: createEmployee,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] })
        }
    })
}

/**
 * Hook to update an employee
 */
export function useUpdateEmployee() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateEmployee>[1] }) =>
            updateEmployee(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] })
        }
    })
}

/**
 * Hook to deactivate an employee
 */
export function useDeactivateEmployee() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: deactivateEmployee,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] })
        }
    })
}

/**
 * Hook to increment employee sales
 */
export function useIncrementEmployeeSales() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: incrementEmployeeSales,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] })
        }
    })
}

/**
 * Hook to reset monthly sales
 */
export function useResetMonthlySales() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: checkAndResetMonthlySales,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] })
        }
    })
}
