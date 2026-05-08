import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { autoUpdater } from 'electron-updater'
import dotenv from 'dotenv'
import fs from 'fs'

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
const isDev = !app.isPackaged;
if (isDev) {
    dotenv.config();
} else {
    // In production, look for .env in the resources folder
    const envPath = path.join(process.resourcesPath, '.env');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
    }
}

import { initDb, query, execute, get } from './db'
import { startSyncEngine, pushSync } from './sync'

// Disable GPU acceleration for better compatibility on some systems
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null

function createWindow() {
    const iconPath = isDev
        ? path.join(__dirname, '../src/assets/logo-pospelon.png')
        : path.join(process.resourcesPath, 'assets/logo-pospelon.png');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 600,
        title: 'POS Soda El Pelón',
        icon: iconPath,
        autoHideMenuBar: true,
        backgroundColor: '#0a0b0d',
        fullscreen: true,
        fullscreenable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    })

    // In development, load from Vite dev server
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
        mainWindow.webContents.openDevTools({ mode: 'detach' })
    } else {
        // In production, load the built index.html
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    // Open external links in the default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })

    mainWindow.on('closed', () => {
        mainWindow = null
    })

    return mainWindow
}

// ===== App Lifecycle =====
app.whenReady().then(async () => {
    initDb()
    const win = createWindow()
    if (win) {
        startSyncEngine(win)
        autoUpdater.checkForUpdates()
        setInterval(() => autoUpdater.checkForUpdates(), 30 * 60 * 1000)
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// ===== IPC Handlers =====

// System info
ipcMain.handle('system:info', () => ({
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
}))

// Window controls
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize()
    } else {
        mainWindow?.maximize()
    }
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())

ipcMain.handle('db:query', (_, sql: string, params: any[]) => query(sql, params))
ipcMain.handle('db:execute', (_, sql: string, params: any[]) => execute(sql, params))
ipcMain.handle('db:get', (_, sql: string, params: any[]) => get(sql, params))

// Sync Stats
ipcMain.handle('sync:stats', async () => {
    const tables = ['Sale', 'Expense', 'Payment', 'InventoryMovement', 'CashRegister', 'Employee', 'Client', 'Product', 'Category'];
    let totalPending = 0;
    for (const table of tables) {
        try {
            const res = await get(`SELECT COUNT(*) as count FROM ${table} WHERE syncStatus = 'PENDING'`, []);
            totalPending += (res?.count || 0);
        } catch (err) {
            console.error(`[SyncStats] Error querying table ${table}:`, err);
        }
    }
    return { totalPending };
});

ipcMain.handle('sync:force-push', async () => {
    const tables = ['Sale', 'Expense', 'Payment', 'InventoryMovement', 'CashRegister', 'Employee', 'Client', 'Category', 'Subcategory', 'Product'];
    const now = new Date().toISOString();
    for (const table of tables) {
        try {
            execute(`UPDATE ${table} SET syncStatus = 'PENDING', updatedAt = ? WHERE syncStatus = 'SYNCED' OR syncStatus IS NULL`, [now]);
        } catch { /* table may not have updatedAt */ }
    }
    await pushSync();
});

// ===== Hardware: COM Port Printer Communication =====

// Helper: run a PowerShell script from a temp file
async function runPsScript(script: string): Promise<{ ok: boolean; stdout: string; error: string }> {
    const { exec } = await import('child_process')
    const { writeFileSync, unlinkSync } = await import('fs')
    const { join } = await import('path')
    const { tmpdir } = await import('os')

    const scriptPath = join(tmpdir(), `pos_${Date.now()}.ps1`)
    writeFileSync(scriptPath, script, 'utf8')

    return new Promise((resolve) => {
        exec(
            `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
            { encoding: 'utf8', timeout: 15000 },
            (err, stdout, stderr) => {
                try { unlinkSync(scriptPath) } catch { }
                resolve({
                    ok: !err,
                    stdout: (stdout || '').trim(),
                    error: err?.message || stderr || '',
                })
            }
        )
    })
}

// C# code for Win32 CreateFile — compiled once per PS session via Add-Type
const COM_WRITER_CSHARP = `
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public class ComWriter {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    public static extern SafeFileHandle CreateFile(
        string lpFileName, uint dwDesiredAccess, uint dwShareMode,
        IntPtr lpSecurityAttributes, uint dwCreationDisposition,
        uint dwFlagsAndAttributes, IntPtr hTemplateFile);

    public static bool Send(string port, byte[] data) {
        var handle = CreateFile(port, 0x40000000, 0, IntPtr.Zero, 3, 0, IntPtr.Zero);
        if (handle.IsInvalid) return false;
        using (var fs = new FileStream(handle, FileAccess.Write)) {
            fs.Write(data, 0, data.Length);
            fs.Flush();
        }
        return true;
    }
}
`.trim()

// Helper: send raw bytes to a COM port via Win32 CreateFile
async function sendToComPort(port: string, rawBytes: number[]): Promise<boolean> {
    const bytesStr = rawBytes.join(', ')
    // Build the PS script with the C# type and the send call
    // The COM port path needs to be \\.\COMx for CreateFile
    const comPath = `\\\\.\\${port}` // produces \\.\COM3
    const script = `
Add-Type -TypeDefinition @'
${COM_WRITER_CSHARP}
'@
try {
    [byte[]]$bytes = @(${bytesStr})
    $result = [ComWriter]::Send('${comPath}', $bytes)
    if ($result) { Write-Output 'OK' } else { Write-Output 'FAIL: CreateFile returned invalid handle' }
} catch {
    Write-Output "FAIL: $_"
}
`
    const result = await runPsScript(script)
    if (result.stdout.startsWith('OK')) {
        return true
    }
    console.error(`[COM] Send failed on ${port}:`, result.stdout || result.error)
    return false
}

// Scan for POS printers on COM ports
ipcMain.handle('printer:get-printers', async () => {
    try {
        const script = [
            '$result = @()',
            '$allPorts = [System.IO.Ports.SerialPort]::GetPortNames()',
            '',
            'foreach ($cp in $allPorts) {',
            '    $friendlyName = $cp',
            '    $pnp = Get-WmiObject Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object {',
            '        $_.Name -like "*$cp*"',
            '    } | Select-Object -First 1',
            '    if ($pnp) {',
            '        $friendlyName = $pnp.Name',
            '    }',
            '    $result += @{',
            '        name = $friendlyName',
            '        port = $cp',
            '        status = if ($pnp) { $pnp.Status } else { "Unknown" }',
            '    }',
            '}',
            '',
            '$result | ConvertTo-Json -Depth 2',
        ].join('\n')

        const res = await runPsScript(script)
        if (!res.ok || !res.stdout) {
            console.error('[Printer] COM scan failed:', res.error)
            return []
        }

        try {
            let data = JSON.parse(res.stdout)
            if (!Array.isArray(data)) data = [data]

            const printers = data
                .filter((p: any) => p.port)
                .map((p: any) => ({
                    name: p.name || p.port,
                    port: p.port,
                    status: p.status || '',
                    isComPort: true,
                }))

            console.log('[Printer] COM ports found:', printers.map((p: any) => `${p.name} (${p.port})`).join(', '))
            return printers
        } catch (e) {
            console.error('[Printer] JSON parse error:', e, 'Raw:', res.stdout)
            return []
        }
    } catch (err) {
        console.error('[Printer] Failed to scan COM ports:', err)
        return []
    }
})

// Print receipt via ESC/POS commands to COM port
ipcMain.handle('printer:print', async (_, portOrName: string, data: any) => {
    try {
        // Extract COM port from the name if needed (e.g., "TM-T20IV-SP (COM3)" -> "COM3")
        const comMatch = portOrName.match(/COM\d+/i)
        const comPort = comMatch ? comMatch[0] : portOrName

        // Build ESC/POS byte sequence for the receipt
        const ESC = 0x1B
        const GS = 0x1D
        const LF = 0x0A
        const bytes: number[] = []

        const currency = data.currencySymbol || '₡'

        // WPC1252: Spanish accents sit at their Unicode positions (0xC0-0xFF),
        // so passthrough for c < 256 works. Only map chars outside that range.
        const addText = (text: string) => {
            const map: { [key: string]: number } = {
                '₡': 0x43, // no WPC1252 slot — print as 'C'
                '€': 0x80, // WPC1252 maps € at 0x80
            }
            for (let i = 0; i < text.length; i++) {
                const char = text[i]
                if (map[char] !== undefined) {
                    bytes.push(map[char])
                } else {
                    const c = text.charCodeAt(i)
                    if (c === 160 || c === 8239) {
                        bytes.push(0x20)
                    } else if (c < 256) {
                        bytes.push(c)
                    } else {
                        bytes.push(0x3F) // '?'
                    }
                }
            }
        }

        // Initialize printer and set code page to WPC1252
        bytes.push(ESC, 0x40)       // ESC @ = Initialize
        bytes.push(ESC, 0x74, 0x10) // ESC t 16 = WPC1252 (Spanish accents at standard positions)

        // Center alignment
        bytes.push(ESC, 0x61, 0x01) // ESC a 1 = Center

        // Business name (bold, double height)
        bytes.push(ESC, 0x45, 0x01) // ESC E 1 = Bold ON
        bytes.push(GS, 0x21, 0x01)  // GS ! 1 = Double height
        addText(data.businessName || 'SODA')
        bytes.push(LF)
        bytes.push(GS, 0x21, 0x00)  // GS ! 0 = Normal size
        bytes.push(ESC, 0x45, 0x00) // ESC E 0 = Bold OFF

        if (data.address) { addText(data.address); bytes.push(LF) }
        if (data.phone) { addText(`Tel: ${data.phone}`); bytes.push(LF) }
        if (data.header && data.showHeader !== false) { addText(data.header); bytes.push(LF) }

        // Separator
        addText('--------------------------------')
        bytes.push(LF)

        // Left alignment
        bytes.push(ESC, 0x61, 0x00) // ESC a 0 = Left

        // Ticket number and date
        bytes.push(ESC, 0x45, 0x01) // Bold
        addText(`Ticket #${data.saleNumber}`)
        bytes.push(LF)
        bytes.push(ESC, 0x45, 0x00) // Bold off
        addText(new Date(data.date).toLocaleString())
        bytes.push(LF)
        if (data.cashier && data.showCashier !== false) {
            addText(`Cajero: ${data.cashier}`)
            bytes.push(LF)
        }

        addText('--------------------------------')
        bytes.push(LF)

        // Items
        const items = data.items || []
        for (const item of items) {
            const qty = `${item.quantity}x `
            const itemName = item.name || ''
            const price = ` ${currency}${(item.subtotal || 0).toLocaleString()}`
            const maxName = 32 - qty.length - price.length
            const truncName = itemName.length > maxName ? itemName.substring(0, maxName) : itemName.padEnd(maxName)
            addText(`${qty}${truncName}${price}`)
            bytes.push(LF)
            if (data.showUnitPrice && item.unitPrice) {
                addText(`   ${currency}${item.unitPrice.toLocaleString()} c/u`)
                bytes.push(LF)
            }
        }

        addText('--------------------------------')
        bytes.push(LF)

        // Total (bold, larger)
        bytes.push(ESC, 0x61, 0x02) // Right align
        bytes.push(ESC, 0x45, 0x01) // Bold
        bytes.push(GS, 0x21, 0x01)  // Double height
        addText(`TOTAL: ${currency}${(data.total || 0).toLocaleString()}`)
        bytes.push(LF)
        bytes.push(GS, 0x21, 0x00)  // Normal
        bytes.push(ESC, 0x45, 0x00) // Bold off

        // Payment info
        bytes.push(ESC, 0x61, 0x00) // Left
        addText(`Pago: ${data.paymentMethod || ''}`)
        bytes.push(LF)

        if (data.amountReceived && data.showChange !== false) {
            addText(`Recibido: ${currency}${data.amountReceived.toLocaleString()}`)
            bytes.push(LF)
            addText(`Vuelto: ${currency}${(data.change || 0).toLocaleString()}`)
            bytes.push(LF)
        }

        if (data.footer) {
            addText('--------------------------------')
            bytes.push(LF)
            bytes.push(ESC, 0x61, 0x01) // Center
            addText(data.footer)
            bytes.push(LF)
        }

        bytes.push(LF, LF, LF)
        bytes.push(GS, 0x56, 0x01) // GS V 1 = Partial cut

        const ok = await sendToComPort(comPort, bytes)
        if (ok) return { success: true }
        else return { success: false, error: `No se pudo enviar al puerto ${comPort}. Verifique la conexion.` }
    } catch (err: any) {
        console.error('[Printer] Error:', err)
        return { success: false, error: err.message }
    }
})

// Cash drawer: send ESC/POS kick command to COM port
ipcMain.handle('printer:open-drawer', async (_, portOrName: string) => {
    try {
        const comMatch = portOrName.match(/COM\d+/i)
        const comPort = comMatch ? comMatch[0] : portOrName

        // ESC p m t1 t2
        // m=0 (Pin 2), m=1 (Pin 5)
        // t1=25, t2=250 (pulse timing)
        const kickPin2 = [0x1B, 0x70, 0x00, 0x19, 0xFA]
        const kickPin5 = [0x1B, 0x70, 0x01, 0x19, 0xFA]

        const ok = await sendToComPort(comPort, [...kickPin2, ...kickPin5])
        if (ok) return { success: true }
        else return { success: false, error: `No se pudo enviar al puerto ${comPort}` }
    } catch (err: any) {
        console.error('[Drawer] Error:', err)
        return { success: false, error: err.message }
    }
})

// Email (Resend) with Queuing
ipcMain.handle('email:send', async (_, payload: { from: string; to: string[]; subject: string; html: string }) => {
    const apiKey = process.env.RESEND_API_KEY
    console.log('[Email] Sending email to:', payload.to, 'Key present:', !!apiKey)

    const recipient = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;

    if (!apiKey) {
        console.error('[Email] Error: RESEND_API_KEY not set')
        return { success: false, error: 'RESEND_API_KEY not set' }
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        if (!res.ok) {
            const err = await res.json()
            console.error('[Email] Resend API Error:', err)
            // Save to queue for retry
            execute(`INSERT INTO EmailQueue (recipient, subject, body, status, lastError) VALUES (?, ?, ?, 'PENDING', ?)`,
                [recipient, payload.subject, payload.html, JSON.stringify(err)]);
            return { success: false, error: err, queued: true }
        }

        const data = await res.json()
        console.log('[Email] Success! Queue ID:', data.id)
        return { success: true, id: data.id }
    } catch (err: any) {
        console.error('[Email] Network Error:', err.message)
        // Save to queue for retry if it's a network issue
        execute(`INSERT INTO EmailQueue (recipient, subject, body, status, lastError) VALUES (?, ?, ?, 'PENDING', ?)`,
            [recipient, payload.subject, payload.html, err.message]);
        return { success: false, error: err.message, queued: true }
    }
})

// ===== Auto-updater events =====
autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update-message', 'update-available')
})

autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-message', 'update-not-available')
})

autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-message', `Error: ${err.message}`)
})

autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-message', 'downloading', progressObj.percent)
})

autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-message', 'update-downloaded')
})

ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())
ipcMain.handle('update:check', () => autoUpdater.checkForUpdates())
