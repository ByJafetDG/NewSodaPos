/**
 * TypeScript declarations for the Electron preload API
 * Accessible via window.electronAPI in the renderer process
 */
export interface ElectronAPI {
    getSystemInfo: () => Promise<{
        platform: string
        arch: string
        version: string
        electron: string
        node: string
        chrome: string
    }>
    minimizeWindow: () => Promise<void>
    maximizeWindow: () => Promise<void>
    closeWindow: () => Promise<void>
    isMaximized: () => Promise<boolean>
    dbQuery: (sql: string, params?: any[]) => Promise<any[]>
    dbExecute: (sql: string, params?: any[]) => Promise<{ changes: number, lastInsertRowid: number | bigint }>
    dbGet: (sql: string, params?: any[]) => Promise<any>
    // Printer
    getPrinters: () => Promise<any[]>
    printReceipt: (printerName: string, data: any) => Promise<{ success: boolean, error?: string }>
    openDrawer: (printerName: string) => Promise<{ success: boolean, error?: string }>
    // Email
    sendEmail: (payload: { from: string; to: string[]; subject: string; html: string }) =>
        Promise<{ success: boolean, error?: any }>
    // Sync
    getSyncStats: () => Promise<{ totalPending: number }>
    onDbChanged: (callback: (data: { table: string }) => void) => () => void
    // Updates
    onUpdateMessage: (callback: (message: string, percent?: number) => void) => () => void
    installUpdate: () => Promise<void>
    platform: string
    isElectron: true
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI
    }
}
