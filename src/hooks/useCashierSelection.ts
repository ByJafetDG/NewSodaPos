import { useState } from 'react'
import type { Employee } from '@/types'

export function useCashierSelection() {
    const [showCashierModal, setShowCashierModal] = useState(false)
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(() => {
        try { return JSON.parse(localStorage.getItem('pos_cashier_v2') ?? 'null') }
        catch { return null }
    })

    const selectEmployee = (emp: Employee | null) => {
        setSelectedEmployee(emp)
        try { localStorage.setItem('pos_cashier_v2', JSON.stringify(emp)) } catch { }
    }

    return {
        showCashierModal, setShowCashierModal,
        selectedEmployee,
        selectEmployee,
    }
}
