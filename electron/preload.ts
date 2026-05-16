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
    platform: string;
    isElectron: boolean;
}
