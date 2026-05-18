import { contextBridge, ipcRenderer } from 'electron'

/**
 * Preload script — exposes a safe API from main process to the renderer
 * using contextBridge. This is the only bridge between React and Node.js.
 */
const electronAPI = {
    // System
    getSystemInfo: () => ipcRenderer.invoke('system:info'),

    // Window controls
    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

    // Database
    dbQuery: (sql: string, params: any[] = []) => ipcRenderer.invoke('db:query', sql, params),
    dbExecute: (sql: string, params: any[] = []) => ipcRenderer.invoke('db:execute', sql, params),
    dbGet: (sql: string, params: any[] = []) => ipcRenderer.invoke('db:get', sql, params),
    dbTransaction: (ops: Array<{ sql: string; params: any[] }>) => ipcRenderer.invoke('db:execute-transaction', ops),
    // Printer
    getPrinters: () => ipcRenderer.invoke('printer:get-printers'),
    printReceipt: (printerName: string, data: any) => ipcRenderer.invoke('printer:print', printerName, data),
    printCompanyStatement: (printerName: string, data: any) => ipcRenderer.invoke('printer:print-company-statement', printerName, data),
    openDrawer: (printerName: string) => ipcRenderer.invoke('printer:open-drawer', printerName),
    cacheTicketLogo: (url: string) => ipcRenderer.invoke('printer:cache-ticket-logo', url),
    clearTicketLogo: () => ipcRenderer.invoke('printer:clear-ticket-logo'),

    // AI
    groqChat: (payload: { messages: any[]; tools: any[]; apiKey: string }) =>
        ipcRenderer.invoke('ai:groq-chat', payload),

    // Email
    sendEmail: (payload: { from: string; to: string[]; subject: string; html: string; attachments?: { filename: string; content: string }[] }) =>
        ipcRenderer.invoke('email:send', payload),
    getLogoBase64: (): Promise<string | null> => ipcRenderer.invoke('assets:get-logo'),

    // Sync
    // Storage
    listBucket: (bucket: string) => ipcRenderer.invoke('storage:list-bucket', bucket),

    getSyncStats: () => ipcRenderer.invoke('sync:stats'),
    forcePush: () => ipcRenderer.invoke('sync:force-push'),
    getSyncErrors: () => ipcRenderer.invoke('sync:get-errors'),
    clearSyncError: (id: string) => ipcRenderer.invoke('sync:clear-error', id),
    clearAllSyncErrors: () => ipcRenderer.invoke('sync:clear-all-errors'),
    triggerSyncPush: () => ipcRenderer.invoke('sync:trigger-push'),
    onBarcodeConflict: (callback: (data: { productId: string; productName: string }) => void) => {
        const sub = (_event: any, data: any) => callback(data);
        ipcRenderer.on('sync-barcode-conflict', sub);
        return () => { ipcRenderer.removeListener('sync-barcode-conflict', sub); };
    },
    onDbChanged: (callback: (data: { table: string }) => void) => {
        const subscription = (_event: any, data: any) => callback(data);
        ipcRenderer.on('db-changed', subscription);
        return () => {
            ipcRenderer.removeListener('db-changed', subscription);
        };
    },
    onSyncLog: (callback: (data: { level: string; msg: string }) => void) => {
        const subscription = (_event: any, data: any) => callback(data);
        ipcRenderer.on('sync-log', subscription);
        return () => { ipcRenderer.removeListener('sync-log', subscription); };
    },

    // Updates
    onUpdateMessage: (callback: (message: string, percent?: number) => void) => {
        const subscription = (_event: any, message: string, percent?: number) => callback(message, percent);
        ipcRenderer.on('update-message', subscription);
        return () => {
            ipcRenderer.removeListener('update-message', subscription);
        };
    },
    installUpdate: () => ipcRenderer.invoke('update:install'),
    checkForUpdate: () => ipcRenderer.invoke('update:check'),
    openDevTools: () => ipcRenderer.invoke('devtools:open'),

    // SINPE
    getSinpeMessages: (): Promise<any[]> => ipcRenderer.invoke('sinpe:get-messages'),
    getSinpeUnreadCount: (): Promise<number> => ipcRenderer.invoke('sinpe:get-unread-count'),
    markSinpeRead: (id: string): Promise<void> => ipcRenderer.invoke('sinpe:mark-read', id),
    markAllSinpeRead: (): Promise<void> => ipcRenderer.invoke('sinpe:mark-all-read'),
    deleteSinpeMessage: (id: string): Promise<void> => ipcRenderer.invoke('sinpe:delete-one', id),
    clearSinpeMessages: (): Promise<void> => ipcRenderer.invoke('sinpe:clear-all'),
    getSinpeConfig: (): Promise<{ port: number; senderFilter: string }> => ipcRenderer.invoke('sinpe:get-config'),
    saveSinpeConfig: (cfg: { port: number; senderFilter: string }): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('sinpe:save-config', cfg),
    getSinpeLocalIp: (): Promise<string> => ipcRenderer.invoke('sinpe:get-local-ip'),
    getSinpeServerPort: (): Promise<number> => ipcRenderer.invoke('sinpe:get-server-port'),
    getSinpeDeleted: (): Promise<any[]> => ipcRenderer.invoke('sinpe:get-deleted'),
    restoreSinpeMessage: (id: string): Promise<void> => ipcRenderer.invoke('sinpe:restore', id),
    hardDeleteSinpeMessage: (id: string): Promise<void> => ipcRenderer.invoke('sinpe:hard-delete-one', id),
    clearSinpeTrash: (): Promise<void> => ipcRenderer.invoke('sinpe:clear-trash'),
    onSinpeNewMessage: (callback: (msg: any) => void) => {
        const sub = (_event: any, data: any) => callback(data)
        ipcRenderer.on('sinpe:new-message', sub)
        return () => ipcRenderer.removeListener('sinpe:new-message', sub)
    },

    // Platform detection
    platform: process.platform,
    isElectron: true,

    // TODO: Hardware
    // printTicket: (data: any) => ipcRenderer.invoke('printer:print', data),
    // openCashDrawer: () => ipcRenderer.invoke('drawer:open'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// TypeScript declaration for the renderer
export interface ElectronAPI {
    getSystemInfo: () => Promise<any>;
    minimizeWindow: () => Promise<void>;
    maximizeWindow: () => Promise<void>;
    closeWindow: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    dbQuery: (sql: string, params?: any[]) => Promise<any[]>;
    dbExecute: (sql: string, params?: any[]) => Promise<any>;
    dbGet: (sql: string, params?: any[]) => Promise<any>;
    dbTransaction: (ops: Array<{ sql: string; params: any[] }>) => Promise<void>;
    getPrinters: () => Promise<any[]>;
    printReceipt: (printerName: string, data: any) => Promise<any>;
    printCompanyStatement: (printerName: string, data: any) => Promise<{ success: boolean; error?: string }>;
    openDrawer: (printerName: string) => Promise<any>;
    cacheTicketLogo: (url: string) => Promise<{ success: boolean; error?: string }>;
    clearTicketLogo: () => Promise<void>;
    groqChat: (payload: { messages: any[]; tools: any[]; apiKey: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
    sendEmail: (payload: any) => Promise<any>;
    listBucket: (bucket: string) => Promise<{ data: any[] | null; error: string | null }>;
    getSyncStats: () => Promise<any>;
    forcePush: () => Promise<void>;
    triggerSyncPush: () => Promise<void>;
    onDbChanged: (callback: (data: { table: string }) => void) => () => void;
    onUpdateMessage: (callback: (message: string, percent?: number) => void) => () => void;
    installUpdate: () => Promise<void>;
    checkForUpdate: () => Promise<void>;
    getSinpeMessages: () => Promise<any[]>;
    getSinpeUnreadCount: () => Promise<number>;
    markSinpeRead: (id: string) => Promise<void>;
    markAllSinpeRead: () => Promise<void>;
    deleteSinpeMessage: (id: string) => Promise<void>;
    clearSinpeMessages: () => Promise<void>;
    getSinpeConfig: () => Promise<{ port: number; senderFilter: string }>;
    saveSinpeConfig: (cfg: { port: number; senderFilter: string }) => Promise<{ success: boolean; error?: string }>;
    getSinpeLocalIp: () => Promise<string>;
    getSinpeServerPort: () => Promise<number>;
    getSinpeDeleted: () => Promise<any[]>;
    restoreSinpeMessage: (id: string) => Promise<void>;
    hardDeleteSinpeMessage: (id: string) => Promise<void>;
    clearSinpeTrash: () => Promise<void>;
    onSinpeNewMessage: (callback: (msg: any) => void) => () => void;
    getLogoBase64: () => Promise<string | null>;
    openDevTools: () => Promise<void>;
    getSyncErrors: () => Promise<any[]>;
    clearSyncError: (id: string) => Promise<void>;
    clearAllSyncErrors: () => Promise<void>;
    onSyncLog: (callback: (data: { level: string; msg: string }) => void) => () => void;
    onBarcodeConflict: (callback: (data: { productId: string; productName: string }) => void) => () => void;
    platform: string;
    isElectron: boolean;
}
