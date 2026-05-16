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
    dbTransaction: (ops: Array<{ sql: string; params: any[] }>) => Promise<void>
    // Printer
    getPrinters: () => Promise<any[]>
    printReceipt: (printerName: string, data: any) => Promise<{ success: boolean, error?: string }>
    openDrawer: (printerName: string) => Promise<{ success: boolean, error?: string }>
    cacheTicketLogo: (url: string) => Promise<{ success: boolean; error?: string }>
    clearTicketLogo: () => Promise<void>
    // Storage
    listBucket: (bucket: string) => Promise<{ data: any[] | null; error: string | null }>
    // Email
    sendEmail: (payload: { from: string; to: string[]; subject: string; html: string; attachments?: { filename: string; content: string }[] }) =>
        Promise<{ success: boolean, error?: any }>
    groqChat: (payload: { messages: any[]; tools: any[]; apiKey: string }) =>
        Promise<{ success: boolean; data?: any; error?: string }>
    getLogoBase64: () => Promise<string | null>
    // Sync
    getSyncStats: () => Promise<{ totalPending: number }>
    forcePush: () => Promise<{ totalRemaining: number; remaining: Record<string, number>; pushErrors: string[] }>
    triggerSyncPush: () => Promise<void>
    getSyncErrors: () => Promise<{ id: string; tableName: string; recordId: string; errorMsg: string; attempts: number; createdAt: string; lastAttemptAt: string }[]>
    clearSyncError: (id: string) => Promise<void>
    clearAllSyncErrors: () => Promise<void>
    onDbChanged: (callback: (data: { table: string }) => void) => () => void
    onSyncLog: (callback: (data: { level: string; msg: string }) => void) => () => void
    onBarcodeConflict: (callback: (data: { productId: string; productName: string }) => void) => () => void
    // Updates
    onUpdateMessage: (callback: (message: string, percent?: number) => void) => () => void
    installUpdate: () => Promise<void>
    checkForUpdate: () => Promise<void>
    openDevTools: () => Promise<void>
    platform: string
    isElectron: true
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI
    }
    const __APP_VERSION__: string
}
