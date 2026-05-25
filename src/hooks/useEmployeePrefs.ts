import { useState, useCallback } from 'react'

const PREFS_KEY = 'employee_grid_prefs'

export interface EmployeePrefs {
    showImagesInGrid: boolean
}

const DEFAULT_PREFS: EmployeePrefs = { showImagesInGrid: true }

function readAll(): Record<string, EmployeePrefs> {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
    catch { return {} }
}

export function getEmployeePrefs(empId: string): EmployeePrefs {
    return { ...DEFAULT_PREFS, ...readAll()[empId] }
}

export function useEmployeePrefs(empId: string | null) {
    const [prefs, setPrefs] = useState<EmployeePrefs>(() =>
        empId ? getEmployeePrefs(empId) : DEFAULT_PREFS
    )

    const update = useCallback((patch: Partial<EmployeePrefs>) => {
        if (!empId) return
        const all = readAll()
        const next = { ...DEFAULT_PREFS, ...all[empId], ...patch }
        all[empId] = next
        localStorage.setItem(PREFS_KEY, JSON.stringify(all))
        setPrefs(next)
    }, [empId])

    return { prefs, update }
}
