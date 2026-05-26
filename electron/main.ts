import { app, BrowserWindow, ipcMain, shell, nativeImage } from 'electron'
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

import { initDb, query, execute, get, executeMany } from './db'
import { startSyncEngine, pushSync, pullSinpeMessages, triggerPush } from './sync'

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
        startSyncEngine(win, isDev)
        autoUpdater.checkForUpdates()
        setInterval(() => autoUpdater.checkForUpdates(), 30 * 60 * 1000)
    }
    const sinpeCfg = readSinpeConfig()
    await startSinpeServer(sinpeCfg.port, sinpeCfg.senderFilter)

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
ipcMain.handle('db:execute', (_, sql: string, params: any[]) => {
    const result = execute(sql, params)
    if (!isDev) triggerPush()
    return result
})
ipcMain.handle('db:get', (_, sql: string, params: any[]) => get(sql, params))
ipcMain.handle('db:execute-transaction', (_, ops: Array<{ sql: string; params: any[] }>) => {
    const result = executeMany(ops)
    if (!isDev) triggerPush()
    return result
})

// Sync Stats
ipcMain.handle('sync:stats', async () => {
    const tables = ['Sale', 'Expense', 'Payment', 'InventoryMovement', 'CashRegister', 'Employee', 'Client', 'Product', 'Category', 'BusinessConfig'];
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
    if (isDev) {
        return { totalRemaining: 0, remaining: {}, pushErrors: ['[DEV MODE] Push deshabilitado — ejecuta el build de producción para sincronizar.'] };
    }
    const tables = ['Sale', 'Expense', 'Payment', 'InventoryMovement', 'CashRegister', 'Employee', 'Client', 'Category', 'Subcategory', 'Product', 'BusinessConfig', 'Return'];
    // Reintentar registros que fallaron anteriormente
    try {
        const syncErrors = query(`SELECT tableName, recordId FROM SyncError`, []) as { tableName: string; recordId: string }[];
        for (const err of syncErrors) {
            try {
                execute(`UPDATE "${err.tableName}" SET syncStatus = 'PENDING' WHERE id = ? AND syncStatus != 'PENDING'`, [err.recordId]);
            } catch {}
        }
    } catch {}
    const pushErrors = await pushSync();
    const remaining: Record<string, number> = {};
    let totalRemaining = 0;
    for (const table of tables) {
        try {
            const res = get(`SELECT COUNT(*) as count FROM ${table} WHERE syncStatus = 'PENDING'`, []);
            const count = res?.count ?? 0;
            if (count > 0) remaining[table] = count;
            totalRemaining += count;
        } catch { }
    }
    return { totalRemaining, remaining, pushErrors };
});

ipcMain.handle('sync:trigger-push', async () => {
    if (isDev) return;
    try {
        await pushSync();
    } catch (err) {
        console.error('[SyncTrigger] Error:', err);
    }
});

// ===== Ticket Logo: download + ESC/POS raster conversion =====

const TICKET_LOGO_PATH = () => path.join(app.getPath('userData'), 'ticket-logo.bin')
const TICKET_LOGO_URL_PATH = () => path.join(app.getPath('userData'), 'ticket-logo-url.txt')

async function downloadBuffer(url: string): Promise<Buffer> {
    const { default: https } = await import('https')
    const { default: http } = await import('http')
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http
        client.get(url, res => {
            const chunks: Buffer[] = []
            res.on('data', chunk => chunks.push(chunk))
            res.on('end', () => resolve(Buffer.concat(chunks)))
            res.on('error', reject)
        }).on('error', reject)
    })
}

async function buildTicketLogoBytes(url: string): Promise<Buffer> {
    const imgBuf = await downloadBuffer(url)
    const img = nativeImage.createFromBuffer(imgBuf)
    const orig = img.getSize()
    const targetW = 150
    const targetH = Math.round(orig.height * targetW / orig.width)
    const resized = img.resize({ width: targetW, height: targetH, quality: 'good' })
    const bitmap = resized.getBitmap() // BGRA
    const w = resized.getSize().width
    const h = resized.getSize().height
    const xBytes = Math.ceil(w / 8)
    const raster: number[] = []
    for (let y = 0; y < h; y++) {
        for (let bx = 0; bx < xBytes; bx++) {
            let byte = 0
            for (let bit = 0; bit < 8; bit++) {
                const px = bx * 8 + bit
                if (px < w) {
                    const off = (y * w + px) * 4
                    const a = bitmap[off + 3] / 255
                    const r = a * bitmap[off + 2] + (1 - a) * 255
                    const g = a * bitmap[off + 1] + (1 - a) * 255
                    const b = a * bitmap[off + 0] + (1 - a) * 255
                    const luma = 0.299 * r + 0.587 * g + 0.114 * b
                    if (luma < 128) byte |= (0x80 >> bit)
                }
            }
            raster.push(byte)
        }
    }
    const header = [
        0x1D, 0x76, 0x30, 0x00,
        xBytes & 0xFF, (xBytes >> 8) & 0xFF,
        h & 0xFF, (h >> 8) & 0xFF,
    ]
    return Buffer.from([...header, ...raster])
}

ipcMain.handle('printer:cache-ticket-logo', async (_, url: string) => {
    try {
        const logoBytes = await buildTicketLogoBytes(url)
        fs.writeFileSync(TICKET_LOGO_PATH(), logoBytes)
        fs.writeFileSync(TICKET_LOGO_URL_PATH(), url, 'utf8')
        return { success: true }
    } catch (err: any) {
        console.error('[TicketLogo] Cache failed:', err)
        return { success: false, error: err.message }
    }
})

ipcMain.handle('printer:clear-ticket-logo', async () => {
    try { fs.unlinkSync(TICKET_LOGO_PATH()) } catch { }
    try { fs.unlinkSync(TICKET_LOGO_URL_PATH()) } catch { }
})

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
        // Fallback for Colón symbol: use cent symbol '¢' (0xA2 in WPC1252) which looks similar
        const displayCurrency = currency === '₡' ? '¢' : currency

        // Helper for consistent money formatting (thousands: . decimals: ,)
        const formatMoney = (val: number) => {
            const showDecimals = data.showDecimals !== false // default to true if undefined
            return (val || 0).toLocaleString('es-CR', {
                minimumFractionDigits: showDecimals ? 2 : 0,
                maximumFractionDigits: showDecimals ? 2 : 0
            })
        }

        // WPC1252: Spanish accents sit at their Unicode positions (0xC0-0xFF),
        // so passthrough for c < 256 works. Only map chars outside that range.
        const addText = (text: string) => {
            const map: { [key: string]: number } = {
                '₡': 0x43, // Fallback 'C' if somehow passed to addText, but we handle it above
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

        // Ticket logo
        const logoPath = TICKET_LOGO_PATH()
        if (data.ticketLogoUrl && fs.existsSync(logoPath)) {
            bytes.push(...Array.from(fs.readFileSync(logoPath)))
            bytes.push(LF, LF)
        } else if (data.ticketLogoUrl) {
            try {
                const logoBuffer = await buildTicketLogoBytes(data.ticketLogoUrl)
                fs.writeFileSync(logoPath, logoBuffer)
                bytes.push(...Array.from(logoBuffer))
                bytes.push(LF, LF)
            } catch (err) {
                console.error('[Printer] Logo render failed:', err)
            }
        }

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
        addText(new Date(data.date).toLocaleString('es-CR'))
        bytes.push(LF)
        if (data.cashier && data.showCashier !== false) {
            addText(`Cajero: ${data.cashier}`)
            bytes.push(LF)
        }
        if (data.clientName) {
            addText(`Cliente: ${data.clientName}`)
            bytes.push(LF)
            if (data.clientCode) {
                addText(`ID/Ced: ${data.clientCode}`)
                bytes.push(LF)
            }
        }

        addText('--------------------------------')
        bytes.push(LF)

        // Items
        const printItems = (items: any[]) => {
            for (const item of items) {
                const qty = `${item.quantity}x `
                const itemName = item.name || ''
                const price = ` ${displayCurrency}${formatMoney(item.subtotal)}`
                const maxName = 32 - qty.length - price.length
                const truncName = itemName.length > maxName ? itemName.substring(0, maxName) : itemName.padEnd(maxName)
                addText(`${qty}${truncName}${price}`)
                bytes.push(LF)
                if (data.showUnitPrice && item.unitPrice) {
                    addText(`   ${displayCurrency}${formatMoney(item.unitPrice)} c/u`)
                    bytes.push(LF)
                }
            }
        }

        if (data.items && data.items.length > 0) {
            printItems(data.items)
        }

        if (data.debtSections && data.debtSections.length > 0) {
            if (data.items && data.items.length > 0) {
                addText('--------------------------------')
                bytes.push(LF)
            }
            bytes.push(ESC, 0x61, 0x01) // Center
            bytes.push(ESC, 0x45, 0x01) // Bold
            addText('LIQUIDACION DE CUENTAS')
            bytes.push(LF)
            bytes.push(ESC, 0x45, 0x00)
            bytes.push(ESC, 0x61, 0x00) // Left
            for (const section of data.debtSections) {
                addText('--------------------------------')
                bytes.push(LF)
                const secDate = new Date(section.date).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
                bytes.push(ESC, 0x45, 0x01)
                addText(`Cuenta #${section.saleNumber} (${secDate})`)
                bytes.push(LF)
                bytes.push(ESC, 0x45, 0x00)
                printItems(section.items)
                const subtotalLabel = 'Subtotal:'
                const subtotalAmt = ` ${displayCurrency}${formatMoney(section.total)}`
                addText(`${subtotalLabel.padEnd(32 - subtotalAmt.length)}${subtotalAmt}`)
                bytes.push(LF)
            }
        }

        if (data.splitClients && data.splitClients.length > 0) {
            bytes.push(ESC, 0x61, 0x01) // Center
            addText('-- Dividido entre --')
            bytes.push(LF)
            bytes.push(ESC, 0x61, 0x00) // Left
            for (const sc of data.splitClients) {
                const cName = sc.name || ''
                const cAmt = ` ${displayCurrency}${formatMoney(sc.amount)}`
                const maxLen = 32 - cAmt.length
                const trunc = cName.length > maxLen ? cName.substring(0, maxLen) : cName.padEnd(maxLen)
                addText(`${trunc}${cAmt}`)
                bytes.push(LF)
            }
        }

        addText('--------------------------------')
        bytes.push(LF)

        // Total (bold, larger)
        bytes.push(ESC, 0x61, 0x02) // Right align
        bytes.push(ESC, 0x45, 0x01) // Bold
        bytes.push(GS, 0x21, 0x01)  // Double height
        addText(`TOTAL: ${displayCurrency}${formatMoney(data.total)}`)
        bytes.push(LF)
        bytes.push(GS, 0x21, 0x00)  // Normal
        bytes.push(ESC, 0x45, 0x00) // Bold off

        // Payment info
        bytes.push(ESC, 0x61, 0x00) // Left
        addText(`Pago: ${data.paymentMethod || ''}`)
        bytes.push(LF)

        if (data.amountReceived && data.showChange !== false) {
            addText(`Recibido: ${displayCurrency}${formatMoney(data.amountReceived)}`)
            bytes.push(LF)
            addText(`Vuelto: ${displayCurrency}${formatMoney(data.change)}`)
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
        bytes.push(GS, 0x56, data.cutType === 'full' ? 0x00 : 0x01) // GS V 0=Full cut  1=Partial cut

        const ok = await sendToComPort(comPort, bytes)
        if (ok) return { success: true }
        else return { success: false, error: `No se pudo enviar al puerto ${comPort}. Verifique la conexion.` }
    } catch (err: any) {
        console.error('[Printer] Error:', err)
        return { success: false, error: err.message }
    }
})

// Company statement ticket: print all pending invoices for a company
ipcMain.handle('printer:print-company-statement', async (_, portOrName: string, data: any) => {
    try {
        const comMatch = portOrName.match(/COM\d+/i)
        const comPort = comMatch ? comMatch[0] : portOrName

        const ESC = 0x1B
        const GS = 0x1D
        const LF = 0x0A
        const bytes: number[] = []

        const currency = data.currencySymbol || '₡'
        const displayCurrency = currency === '₡' ? '¢' : currency

        const formatMoney = (val: number) => {
            const showDecimals = data.showDecimals !== false
            return (val || 0).toLocaleString('es-CR', {
                minimumFractionDigits: showDecimals ? 2 : 0,
                maximumFractionDigits: showDecimals ? 2 : 0
            })
        }

        const addText = (text: string) => {
            const map: { [key: string]: number } = { '₡': 0x43, '€': 0x80 }
            for (let i = 0; i < text.length; i++) {
                const char = text[i]
                if (map[char] !== undefined) { bytes.push(map[char]); continue }
                const c = text.charCodeAt(i)
                if (c === 160 || c === 8239) bytes.push(0x20)
                else if (c < 256) bytes.push(c)
                else bytes.push(0x3F)
            }
        }

        bytes.push(ESC, 0x40)
        bytes.push(ESC, 0x74, 0x10)

        bytes.push(ESC, 0x61, 0x01)
        bytes.push(ESC, 0x45, 0x01)
        bytes.push(GS, 0x21, 0x01)
        addText(data.businessName || 'SODA')
        bytes.push(LF)
        bytes.push(GS, 0x21, 0x00)
        bytes.push(ESC, 0x45, 0x00)

        if (data.address) { addText(data.address); bytes.push(LF) }
        if (data.phone) { addText(`Tel: ${data.phone}`); bytes.push(LF) }

        addText('================================')
        bytes.push(LF)

        bytes.push(ESC, 0x45, 0x01)
        addText('ESTADO DE CUENTA PENDIENTE')
        bytes.push(LF)
        bytes.push(ESC, 0x45, 0x00)

        bytes.push(ESC, 0x61, 0x00)
        addText(`Empresa: ${data.companyName}`)
        bytes.push(LF)
        addText(`Fecha: ${new Date(data.date).toLocaleDateString('es-CR')}`)
        bytes.push(LF)

        bytes.push(ESC, 0x61, 0x01)
        addText('================================')
        bytes.push(LF)
        bytes.push(ESC, 0x61, 0x00)

        const invoices: any[] = data.invoices || []
        for (let i = 0; i < invoices.length; i++) {
            const inv = invoices[i]

            bytes.push(ESC, 0x45, 0x01)
            addText(`Factura #${inv.saleNumber}`)
            bytes.push(LF)
            bytes.push(ESC, 0x45, 0x00)

            addText(new Date(inv.date).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }))
            bytes.push(LF)

            if (inv.consumerName) {
                addText(`  Consumidor: ${inv.consumerName}`)
                bytes.push(LF)
            }

            for (const item of (inv.items || [])) {
                const qty = `${item.quantity}x `
                const itemName = item.name || ''
                const price = ` ${displayCurrency}${formatMoney(item.subtotal)}`
                const maxName = 32 - qty.length - price.length
                const truncName = itemName.length > maxName ? itemName.substring(0, maxName) : itemName.padEnd(maxName)
                addText(`  ${qty}${truncName}${price}`)
                bytes.push(LF)
            }

            bytes.push(ESC, 0x61, 0x02)
            bytes.push(ESC, 0x45, 0x01)
            addText(`Total: ${displayCurrency}${formatMoney(inv.total)}`)
            bytes.push(LF)
            bytes.push(ESC, 0x45, 0x00)
            bytes.push(ESC, 0x61, 0x00)

            if (i < invoices.length - 1) {
                bytes.push(ESC, 0x61, 0x01)
                addText('--------------------------------')
                bytes.push(LF)
                bytes.push(ESC, 0x61, 0x00)
            }
        }

        bytes.push(ESC, 0x61, 0x01)
        addText('================================')
        bytes.push(LF)
        bytes.push(ESC, 0x61, 0x02)
        bytes.push(ESC, 0x45, 0x01)
        bytes.push(GS, 0x21, 0x01)
        addText(`TOTAL PENDIENTE: ${displayCurrency}${formatMoney(data.totalPending)}`)
        bytes.push(LF)
        bytes.push(GS, 0x21, 0x00)
        bytes.push(ESC, 0x45, 0x00)
        bytes.push(ESC, 0x61, 0x01)
        addText('================================')
        bytes.push(LF)

        if (data.footer) { addText(data.footer); bytes.push(LF) }

        bytes.push(LF, LF, LF)
        bytes.push(GS, 0x56, 0x01)

        const ok = await sendToComPort(comPort, bytes)
        if (ok) return { success: true }
        else return { success: false, error: `No se pudo enviar al puerto ${comPort}. Verifique la conexion.` }
    } catch (err: any) {
        console.error('[Printer] Company statement error:', err)
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

// Groq AI chat
ipcMain.handle('ai:groq-chat', async (_, payload: {
    messages: any[]
    tools: any[]
    apiKey: string
}) => {
    async function callGroq(): Promise<{ success: boolean; data?: any; error?: string }> {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${payload.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: payload.messages,
                tools: payload.tools,
                tool_choice: 'auto',
                max_tokens: 1500,
                temperature: 0.2,
            }),
        })
        if (!res.ok) {
            const errText = await res.text()
            try {
                const errJson = JSON.parse(errText)
                // Recover from malformed tool call syntax
                if (errJson.error?.code === 'tool_use_failed' && errJson.error?.failed_generation) {
                    const fg: string = errJson.error.failed_generation
                    const match = fg.match(/<function=(\w+)(\{[\s\S]*?\})<\/function>/)
                    if (match) {
                        return {
                            success: true, data: {
                                choices: [{
                                    message: {
                                        role: 'assistant', content: null,
                                        tool_calls: [{
                                            id: `call_recovered_${Date.now()}`,
                                            type: 'function',
                                            function: { name: match[1], arguments: match[2] },
                                        }],
                                    },
                                    finish_reason: 'tool_calls',
                                }],
                            }
                        }
                    }
                }
                // Return rate limit info for retry logic
                if (errJson.error?.code === 'rate_limit_exceeded') {
                    return { success: false, error: errText, data: { isRateLimit: true, raw: errJson } }
                }
            } catch {}
            return { success: false, error: errText }
        }
        const data = await res.json()
        return { success: true, data }
    }

    try {
        const first = await callGroq()
        if (!first.success && first.data?.isRateLimit) {
            // Parse wait time from Groq error and retry once
            const msg: string = first.data.raw?.error?.message ?? ''
            const waitMatch = msg.match(/try again in (\d+\.?\d*)s/)
            const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) + 1.5) * 1000 : 22000
            await new Promise(r => setTimeout(r, Math.min(waitMs, 35000)))
            return await callGroq()
        }
        return first
    } catch (err: any) {
        return { success: false, error: err.message }
    }
})

// Email (Resend) with Queuing
ipcMain.handle('email:send', async (_, payload: { from: string; to: string[]; subject: string; html: string; attachments?: { filename: string; content: string }[] }) => {
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
ipcMain.handle('devtools:open', () => mainWindow?.webContents.openDevTools())

ipcMain.handle('assets:get-logo', () => {
    try {
        const logoPath = isDev
            ? path.join(__dirname, '../src/assets/logo-pospelon.png')
            : path.join(process.resourcesPath, 'assets/logo-pospelon.png')
        if (!fs.existsSync(logoPath)) return null
        const data = fs.readFileSync(logoPath)
        return `data:image/png;base64,${data.toString('base64')}`
    } catch {
        return null
    }
})

ipcMain.handle('storage:list-bucket', async (_, bucket: string) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY
    const authKey = serviceKey && serviceKey !== 'your_service_role_key_here' ? serviceKey : anonKey
    if (!supabaseUrl || !authKey) return { data: null, error: 'Missing Supabase config' }
    try {
        const res = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authKey}`,
                'Content-Type': 'application/json',
                'apikey': authKey,
            },
            body: JSON.stringify({ prefix: '', limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
        })
        if (!res.ok) {
            const err = await res.text()
            console.error(`[Storage] list ${bucket} failed:`, err)
            return { data: null, error: err }
        }
        const data = await res.json()
        return { data, error: null }
    } catch (err: any) {
        console.error(`[Storage] list ${bucket} error:`, err.message)
        return { data: null, error: err.message }
    }
})

ipcMain.handle('sync:get-errors', () =>
    query('SELECT * FROM SyncError ORDER BY lastAttemptAt DESC LIMIT 50', [])
)
ipcMain.handle('sync:clear-error', (_: any, id: string) =>
    execute('DELETE FROM SyncError WHERE id = ?', [id])
)
ipcMain.handle('sync:clear-all-errors', () =>
    execute('DELETE FROM SyncError', [])
)

// ===== SINPE Message Receiver =====
let sinpeServerInstance: any = null
const SINPE_CONFIG_PATH = () => path.join(app.getPath('userData'), 'sinpe-config.json')

function readSinpeConfig(): { port: number; senderFilter: string } {
    try {
        const raw = fs.readFileSync(SINPE_CONFIG_PATH(), 'utf8')
        return { port: 3971, senderFilter: 'QBien', ...JSON.parse(raw) }
    } catch {
        return { port: 3971, senderFilter: 'QBien' }
    }
}

async function getLocalIp(): Promise<string> {
    const { networkInterfaces } = await import('os')
    const nets = networkInterfaces()
    for (const name of Object.keys(nets)) {
        for (const net of (nets[name] ?? [])) {
            if (net.family === 'IPv4' && !net.internal) return net.address
        }
    }
    return '127.0.0.1'
}

async function startSinpeServer(port: number, senderFilter: string) {
    if (sinpeServerInstance) {
        try { sinpeServerInstance.close() } catch {}
        sinpeServerInstance = null
    }
    const { createServer } = await import('http')
    const server = createServer((req: any, res: any) => {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('Soda POS SINPE Receiver OK')
            return
        }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return }

        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
            try {
                let parsed: Record<string, any> = {}
                const ct = (req.headers['content-type'] as string) ?? ''
                if (ct.includes('application/json')) {
                    parsed = JSON.parse(body)
                } else {
                    const params = new URLSearchParams(body)
                    params.forEach((v, k) => { parsed[k] = v })
                }
                const sender = String(parsed.from ?? parsed.sender ?? parsed.originator ?? '')
                const message = String(parsed.message ?? parsed.body ?? parsed.text ?? parsed.smsBody ?? '')
                const rawTs = parsed.timestamp ?? parsed.sentTimestamp ?? parsed.sentStamp ?? Date.now()
                const tsNum = Number(rawTs)
                const receivedAt = new Date(tsNum > 0 && tsNum < 1e12 ? tsNum * 1000 : tsNum).toISOString()

                const filter = senderFilter.toLowerCase().trim()
                if (filter && !sender.toLowerCase().includes(filter) && !message.toLowerCase().includes(filter)) {
                    res.writeHead(200); res.end('filtered'); return
                }

                const id = `sinpe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
                execute('INSERT INTO SinpeMessage (id, sender, body, receivedAt, isRead) VALUES (?, ?, ?, ?, 0)', [id, sender, message, receivedAt])
                const msg = { id, sender, body: message, receivedAt, isRead: 0 }
                mainWindow?.webContents.send('sinpe:new-message', msg)
                mainWindow?.webContents.send('db-changed', { table: 'SinpeMessage' })

                res.writeHead(200, { 'Content-Type': 'text/plain' })
                res.end('ok')
            } catch (err) {
                console.error('[SINPE] Error processing message:', err)
                res.writeHead(500); res.end('error')
            }
        })
    })
    server.on('error', (err: any) => console.error('[SINPE] Server error:', err.message))
    server.listen(port, '0.0.0.0', () => console.log(`[SINPE] Listening on port ${port}`))
    sinpeServerInstance = server
}

ipcMain.handle('sinpe:get-messages', () =>
    query('SELECT * FROM SinpeMessage WHERE deletedAt IS NULL ORDER BY receivedAt DESC LIMIT 200', [])
)
ipcMain.handle('sinpe:refresh', async () => {
    await pullSinpeMessages()
    return query('SELECT * FROM SinpeMessage WHERE deletedAt IS NULL ORDER BY receivedAt DESC LIMIT 200', [])
})
ipcMain.handle('sinpe:get-unread-count', () => {
    const row = get('SELECT COUNT(*) as count FROM SinpeMessage WHERE isRead = 0 AND deletedAt IS NULL', []) as any
    return row?.count ?? 0
})
ipcMain.handle('sinpe:mark-read', (_: any, id: string) =>
    execute('UPDATE SinpeMessage SET isRead = 1 WHERE id = ?', [id])
)
ipcMain.handle('sinpe:mark-all-read', () =>
    execute('UPDATE SinpeMessage SET isRead = 1 WHERE deletedAt IS NULL', [])
)
ipcMain.handle('sinpe:delete-one', (_: any, id: string) =>
    execute("UPDATE SinpeMessage SET deletedAt = ?, syncStatus = 'PENDING' WHERE id = ?", [new Date().toISOString(), id])
)
ipcMain.handle('sinpe:clear-all', () =>
    execute("UPDATE SinpeMessage SET deletedAt = ?, syncStatus = 'PENDING' WHERE deletedAt IS NULL", [new Date().toISOString()])
)
ipcMain.handle('sinpe:get-deleted', () =>
    query('SELECT * FROM SinpeMessage WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC LIMIT 200', [])
)
ipcMain.handle('sinpe:restore', (_: any, id: string) =>
    execute('UPDATE SinpeMessage SET deletedAt = NULL WHERE id = ?', [id])
)
ipcMain.handle('sinpe:hard-delete-one', (_: any, id: string) =>
    execute('DELETE FROM SinpeMessage WHERE id = ?', [id])
)
ipcMain.handle('sinpe:clear-trash', () =>
    execute('DELETE FROM SinpeMessage WHERE deletedAt IS NOT NULL', [])
)
ipcMain.handle('sinpe:get-config', () => readSinpeConfig())
ipcMain.handle('sinpe:save-config', async (_: any, cfg: { port: number; senderFilter: string }) => {
    try {
        fs.writeFileSync(SINPE_CONFIG_PATH(), JSON.stringify(cfg, null, 2), 'utf8')
        await startSinpeServer(cfg.port, cfg.senderFilter)
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
})
ipcMain.handle('sinpe:get-local-ip', getLocalIp)
ipcMain.handle('sinpe:get-server-port', () => readSinpeConfig().port)

// ===== Product Image Cache =====

const PRODUCT_IMAGES_DIR = () => path.join(app.getPath('userData'), 'product-images')

ipcMain.handle('product-image:download', async (_, productId: string, url: string) => {
    try {
        const dir = PRODUCT_IMAGES_DIR()
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        const imgBuf = await downloadBuffer(url)
        fs.writeFileSync(path.join(dir, `${productId}.jpg`), imgBuf)
        return { success: true }
    } catch (err: any) {
        console.error('[ProductImage] Download failed:', err.message)
        return { success: false, error: err.message }
    }
})

ipcMain.handle('product-image:get-local', (_, productId: string) => {
    const filePath = path.join(PRODUCT_IMAGES_DIR(), `${productId}.jpg`)
    if (!fs.existsSync(filePath)) return null
    const data = fs.readFileSync(filePath)
    return `data:image/jpeg;base64,${data.toString('base64')}`
})
