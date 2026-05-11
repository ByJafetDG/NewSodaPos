import { useState, useEffect } from 'react'
import {
    Settings2, Store, Receipt, Printer, Users, Cloud,
    Monitor, Save, Plus, Trash2, ChevronRight, Wifi, WifiOff,
    RefreshCw, HardDrive, Zap, LogOut, Minimize2, Maximize2,
    CheckCircle2, Search, Info, Edit2, Download, AlertTriangle, X,
} from 'lucide-react'
import { Button } from '@/components/atoms/Button'
import { toast } from '@/components/ui/Toast'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { EmployeeFormModal } from '@/components/modals/EmployeeFormModal'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import { useEmployees, useDeactivateEmployee } from '@/hooks/useEmployees'
import { useBusinessConfig, useUpdateConfig } from '@/hooks/useConfig'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'
import type { Employee } from '@/types'

type Section = 'business' | 'ticket' | 'printer' | 'employees' | 'sync' | 'system' | 'updates'

function timeAgo(date: Date) {
    const diff = Date.now() - date.getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'hace un momento'
    if (min < 60) return `hace ${min} min`
    return `hace ${Math.floor(min / 60)}h`
}

type TicketOptions = { showCashier: boolean; showChange: boolean; showHeader: boolean; showUnitPrice: boolean; currencySymbol: string }
const DEFAULT_TICKET_OPTIONS: TicketOptions = { showCashier: true, showChange: true, showHeader: true, showUnitPrice: false, currencySymbol: '₡' }
const CURRENCY_OPTIONS = ['₡', '$', '€', '£', '¥']

const SECTIONS: { id: Section; label: string; desc: string; icon: React.ElementType; color: string }[] = [
    { id: 'business',   label: 'Negocio',         desc: 'Nombre, teléfono, dirección',       icon: Store,    color: 'text-orange-400' },
    { id: 'ticket',     label: 'Ticket',           desc: 'Encabezado y pie del recibo',       icon: Receipt,  color: 'text-amber-400' },
    { id: 'printer',    label: 'Impresora',        desc: 'Detección y configuración',         icon: Printer,  color: 'text-cyan-400' },
    { id: 'employees',  label: 'Empleados',        desc: 'Cajeros y personal',                icon: Users,    color: 'text-violet-400' },
    { id: 'sync',       label: 'Sincronización',   desc: 'Estado de la nube',                 icon: Cloud,    color: 'text-blue-400' },
    { id: 'system',     label: 'Sistema',          desc: 'Control de ventana y app',          icon: Monitor,  color: 'text-slate-400' },
    { id: 'updates',    label: 'Actualizaciones',  desc: 'Versión y actualizaciones del app',  icon: Download, color: 'text-emerald-400' },
]

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">{children}</p>
}

function TextInput({ value, onChange, placeholder, mode = 'alpha' }: {
    value: string; onChange: (v: string) => void; placeholder?: string; mode?: 'alpha' | 'numeric'
}) {
    const kb = useKeyboardInput(value, onChange, { mode })
    return (
        <input
            type="text"
            {...kb}
            placeholder={placeholder}
            className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
        />
    )
}

function TextAreaInput({ value, onChange, placeholder, rows = 2 }: {
    value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
    const { open, syncValue, isOpen } = useKeyboardStore()
    return (
        <textarea
            value={value}
            onFocus={() => open({ mode: 'alpha', value, onChange })}
            onChange={e => { onChange(e.target.value); if (isOpen) syncValue(e.target.value) }}
            rows={rows}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full px-3 py-2.5 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-amber-500/40 transition-colors resize-none"
        />
    )
}

function ToggleRow({ label, description, value, onChange }: {
    label: string; description: string; value: boolean; onChange: (v: boolean) => void
}) {
    return (
        <button
            onClick={() => onChange(!value)}
            className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer text-left',
                value ? 'bg-orange-500/8 border-orange-500/20' : 'bg-[#101520] border-[#1E2A40]'
            )}
        >
            <div>
                <p className={cn('text-[13px] font-semibold', value ? 'text-orange-400' : 'text-[#E4ECF7]')}>{label}</p>
                <p className="text-[11px] text-[#3D506A] mt-0.5">{description}</p>
            </div>
            <div className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ml-4', value ? 'bg-orange-500' : 'bg-[#1C2438]')}>
                <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', value ? 'translate-x-4.5' : 'translate-x-0.5')} />
            </div>
        </button>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SettingsPage() {
    const [section, setSection] = useState<Section>('business')
    const { syncInfo } = useUIStore()

    const [appVersion, setAppVersion] = useState('')
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date'>('idle')
    const [lastChecked, setLastChecked] = useState<Date | null>(null)
    const [forcePushing, setForcePushing] = useState(false)

    type SyncError = { id: string; tableName: string; recordId: string; errorMsg: string; attempts: number; lastAttemptAt: string }
    const [syncErrors, setSyncErrors] = useState<SyncError[]>([])

    async function loadSyncErrors() {
        if (!window.electronAPI) return
        const errs = await window.electronAPI.getSyncErrors()
        setSyncErrors(errs)
    }

    async function dismissSyncError(id: string) {
        await window.electronAPI?.clearSyncError(id)
        setSyncErrors(prev => prev.filter(e => e.id !== id))
    }

    async function dismissAllSyncErrors() {
        await window.electronAPI?.clearAllSyncErrors()
        setSyncErrors([])
    }

    useEffect(() => {
        window.electronAPI?.getSystemInfo().then(info => setAppVersion(info.version))
        const unsubBarcode = window.electronAPI?.onBarcodeConflict(({ productName }) => {
            toast.warning(`Barcode duplicado en "${productName}" — barcode eliminado. Revisa Ajustes → Sincronización.`, 8000)
            loadSyncErrors()
        })
        const unsub = window.electronAPI?.onUpdateMessage((msg: string) => {
            if (msg === 'update-not-available') {
                setUpdateStatus('up-to-date')
                setLastChecked(new Date())
                toast.success('¡Estás al día! No hay actualizaciones disponibles.')
            } else if (msg === 'update-available') {
                setUpdateStatus('idle')
                setLastChecked(new Date())
            } else {
                setUpdateStatus('idle')
            }
        })
        return () => { unsub?.(); unsubBarcode?.() }
    }, [])

    async function handleCheckUpdate() {
        setUpdateStatus('checking')
        try {
            await window.electronAPI?.checkForUpdate()
        } catch {
            setLastChecked(new Date())
            setUpdateStatus('idle')
            toast.success('¡Estás al día! No hay actualizaciones disponibles.')
            return
        }
        setTimeout(() => {
            setUpdateStatus(s => {
                if (s === 'checking') {
                    setLastChecked(new Date())
                    toast.success('¡Estás al día! No hay actualizaciones disponibles.')
                    return 'idle'
                }
                return s
            })
        }, 15_000)
    }

    const { data: config } = useBusinessConfig()
    const updateConfig = useUpdateConfig()

    // Business
    const [bizName, setBizName] = useState('')
    const [bizPhone, setBizPhone] = useState('')
    const [bizAddress, setBizAddress] = useState('')

    // Ticket
    const [ticketHeader, setTicketHeader] = useState('')
    const [ticketFooter, setTicketFooter] = useState('¡Gracias por su compra!')
    const [ticketOpts, setTicketOpts] = useState<TicketOptions>(() => {
        try { return { ...DEFAULT_TICKET_OPTIONS, ...(JSON.parse(localStorage.getItem('pos_ticket_options') ?? 'null') ?? {}) } }
        catch { return DEFAULT_TICKET_OPTIONS }
    })

    // Printer
    const [drawerEnabled, setDrawerEnabled] = useState(true)
    const [detectedPrinters, setDetectedPrinters] = useState<any[]>([])
    const [selectedPort, setSelectedPort] = useState('')
    const [scanning, setScanning] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null)

    // Sync local form state from DB config when it loads
    useEffect(() => {
        if (config) {
            setBizName(config.name ?? '')
            setBizPhone(config.phone ?? '')
            setBizAddress(config.address ?? '')
            setTicketHeader(config.ticketHeader ?? '')
            setTicketFooter(config.ticketFooter ?? '¡Gracias por su compra!')
            setDrawerEnabled(config.drawerEnabled ?? true)
            setSelectedPort(config.printerPort ?? localStorage.getItem('pos_printer_port') ?? '')
        }
    }, [config])

    // Employees
    const { data: employees = [] } = useEmployees()
    const deactivateEmployee = useDeactivateEmployee()
    const [empFormOpen, setEmpFormOpen] = useState(false)
    const [editingEmp, setEditingEmp] = useState<Employee | null>(null)
    const [deletingEmp, setDeletingEmp] = useState<Employee | null>(null)

    function handleOpenAdd() {
        setEditingEmp(null)
        setEmpFormOpen(true)
    }

    function handleOpenEdit(emp: Employee) {
        setEditingEmp(emp)
        setEmpFormOpen(true)
    }

    async function handleDeleteEmp() {
        if (!deletingEmp) return
        await deactivateEmployee.mutateAsync(deletingEmp.id)
        setDeletingEmp(null)
    }

    async function handleSaveBusiness() {
        await updateConfig.mutateAsync({ name: bizName, phone: bizPhone || null, address: bizAddress || null })
    }

    async function handleSaveTicket() {
        await updateConfig.mutateAsync({ ticketHeader: ticketHeader || null, ticketFooter: ticketFooter || null })
        localStorage.setItem('pos_ticket_options', JSON.stringify(ticketOpts))
    }

    async function handleToggleDrawer(v: boolean) {
        setDrawerEnabled(v)
        await updateConfig.mutateAsync({ drawerEnabled: v })
    }

    async function handleScan() {
        if (!window.electronAPI) return
        setScanning(true)
        try {
            const printers = await window.electronAPI.getPrinters()
            setDetectedPrinters(printers)
            // If we found the port that was already selected, keep it. 
            // If not and we found only one, select it automatically.
            if (printers.length === 1 && !selectedPort) {
                setSelectedPort(printers[0].port)
            }
        } catch (err) {
            console.error('Scan failed', err)
        } finally {
            setScanning(false)
        }
    }

    async function handleSavePrinter() {
        await updateConfig.mutateAsync({ printerPort: selectedPort || null })
        if (selectedPort) localStorage.setItem('pos_printer_port', selectedPort)
        else localStorage.removeItem('pos_printer_port')
    }

    async function handleTestPrint() {
        if (!window.electronAPI || !selectedPort) return
        setTestResult(null)
        const ok = await window.electronAPI.printReceipt(selectedPort, {
            businessName: bizName || 'PRUEBA DE IMPRESION',
            saleNumber: '0000',
            date: new Date().toISOString(),
            items: [{ name: 'PRODUCTO DE PRUEBA', quantity: 1, subtotal: 0 }],
            total: 0,
            paymentMethod: 'TEST',
            footer: 'Si ves esto, la impresora esta OK'
        })
        setTestResult({ success: ok.success, msg: ok.success ? '¡Impresión enviada!' : (ok.error || 'Error al imprimir') })
        setTimeout(() => setTestResult(null), 3000)
    }

    async function handleTestDrawer() {
        if (!window.electronAPI || !selectedPort) return
        await window.electronAPI.openDrawer(selectedPort)
    }

    return (
        <div className="flex h-full">
            {/* ── Section nav ───────────────────────────── */}
            <div className="w-64 shrink-0 border-r border-[#192030] flex flex-col bg-[#0B0E19]/60">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#192030]">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-500/10">
                        <Settings2 size={18} className="text-slate-400" />
                    </div>
                    <div>
                        <p className="text-[15px] font-semibold text-[#E4ECF7]">Ajustes</p>
                        <p className="text-[11px] text-[#3D506A]">Configuración del sistema</p>
                    </div>
                </div>

                <nav className="flex-1 px-3 py-3 space-y-0.5">
                    {SECTIONS.map(s => {
                        const Icon = s.icon
                        const isActive = section === s.id
                        return (
                            <button
                                key={s.id}
                                onClick={() => { setSection(s.id); if (s.id === 'sync') loadSyncErrors() }}
                                className={cn(
                                    'relative w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all cursor-pointer text-left group',
                                    isActive ? 'bg-[#141C2E]' : 'hover:bg-[#0F1623]'
                                )}
                            >
                                {isActive && (
                                    <span className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full', s.color.replace('text-', 'bg-'))} />
                                )}
                                <div className={cn(
                                    'flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors',
                                    isActive ? cn(s.color, s.color.replace('text-', 'bg-').replace('400', '500/10')) : 'text-[#3D506A] group-hover:text-[#7A8FAA]'
                                )}>
                                    <Icon size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={cn('text-[13px] font-medium truncate', isActive ? 'text-[#E4ECF7]' : 'text-[#7A8FAA]')}>{s.label}</p>
                                    <p className="text-[10px] text-[#3D506A] truncate">{s.desc}</p>
                                </div>
                                <ChevronRight size={13} className={cn('shrink-0 transition-opacity', isActive ? 'text-[#3D506A] opacity-100' : 'opacity-0 group-hover:opacity-30')} />
                            </button>
                        )
                    })}
                </nav>

                <div className="px-5 py-4 border-t border-[#192030]">
                    <p className="text-[10px] text-[#3D506A] text-center">Soda POS v{__APP_VERSION__} © 2026</p>
                </div>
            </div>

            {/* ── Content panel ─────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-8 py-7">
                    {section === 'business' && (
                        <SectionContent
                            icon={Store} color="text-orange-400" iconBg="bg-orange-500/10"
                            title="Datos del Negocio" desc="Información que aparece en recibos y reportes"
                        >
                            <div className="space-y-4">
                                <div>
                                    <FieldLabel>Nombre del negocio</FieldLabel>
                                    <TextInput value={bizName} onChange={setBizName} placeholder="Soda El Pelón" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <FieldLabel>Teléfono</FieldLabel>
                                        <TextInput value={bizPhone} onChange={setBizPhone} placeholder="8888-8888" mode="numeric" />
                                    </div>
                                    <div>
                                        <FieldLabel>Dirección</FieldLabel>
                                        <TextInput value={bizAddress} onChange={setBizAddress} placeholder="San José, Costa Rica" />
                                    </div>
                                </div>
                                <Button variant="primary" size="md" onClick={handleSaveBusiness} loading={updateConfig.isPending} className="gap-1.5">
                                    <Save size={14} />
                                    Guardar cambios
                                </Button>
                            </div>
                        </SectionContent>
                    )}

                    {section === 'ticket' && (
                        <SectionContent
                            icon={Receipt} color="text-amber-400" iconBg="bg-amber-500/10"
                            title="Configuración del Ticket" desc="Contenido, opciones y vista previa del recibo"
                        >
                            <div className="space-y-4">
                                <div>
                                    <FieldLabel>Encabezado del ticket</FieldLabel>
                                    <TextAreaInput value={ticketHeader} onChange={setTicketHeader} placeholder="Texto que aparece al inicio del ticket..." />
                                </div>
                                <div>
                                    <FieldLabel>Pie del ticket</FieldLabel>
                                    <TextAreaInput value={ticketFooter} onChange={setTicketFooter} placeholder="¡Gracias por su compra!" />
                                </div>

                                <div>
                                    <FieldLabel>Símbolo de moneda</FieldLabel>
                                    <div className="flex gap-2">
                                        {CURRENCY_OPTIONS.map(sym => (
                                            <button
                                                key={sym}
                                                onClick={() => setTicketOpts(p => ({ ...p, currencySymbol: sym }))}
                                                className={cn(
                                                    'flex-1 h-10 rounded-xl text-[15px] font-bold border transition-all cursor-pointer',
                                                    ticketOpts.currencySymbol === sym
                                                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                                        : 'bg-[#101520] border-[#1E2A40] text-[#7A8FAA] hover:bg-[#1C2438]'
                                                )}
                                            >
                                                {sym}
                                            </button>
                                        ))}
                                    </div>
                                    {ticketOpts.currencySymbol === '₡' && (
                                        <p className="text-[10px] text-[#3D506A] mt-1.5">₡ imprime como "C" — la impresora térmica no tiene ese carácter nativo</p>
                                    )}
                                </div>

                                <div className="border-t border-[#192030] pt-4 space-y-2">
                                    <FieldLabel>Opciones de impresión</FieldLabel>
                                    <ToggleRow
                                        label="Mostrar cajero"
                                        description="Nombre del cajero en el ticket"
                                        value={ticketOpts.showCashier}
                                        onChange={v => setTicketOpts(p => ({ ...p, showCashier: v }))}
                                    />
                                    <ToggleRow
                                        label="Mostrar recibido y vuelto"
                                        description="Montos de efectivo recibido y cambio"
                                        value={ticketOpts.showChange}
                                        onChange={v => setTicketOpts(p => ({ ...p, showChange: v }))}
                                    />
                                    <ToggleRow
                                        label="Mostrar precio unitario"
                                        description="Precio por unidad de cada producto"
                                        value={ticketOpts.showUnitPrice}
                                        onChange={v => setTicketOpts(p => ({ ...p, showUnitPrice: v }))}
                                    />
                                    {ticketHeader && (
                                        <ToggleRow
                                            label="Mostrar encabezado personalizado"
                                            description="El texto de encabezado que escribiste arriba"
                                            value={ticketOpts.showHeader}
                                            onChange={v => setTicketOpts(p => ({ ...p, showHeader: v }))}
                                        />
                                    )}
                                </div>

                                <div className="border-t border-[#192030] pt-4">
                                    <FieldLabel>Vista previa</FieldLabel>
                                    <div className="flex justify-center mt-2">
                                        <TicketPreview
                                            bizName={bizName}
                                            bizAddress={bizAddress}
                                            bizPhone={bizPhone}
                                            ticketHeader={ticketHeader}
                                            ticketFooter={ticketFooter}
                                            opts={ticketOpts}
                                        />
                                    </div>
                                </div>

                                <Button variant="primary" size="md" onClick={handleSaveTicket} loading={updateConfig.isPending} className="gap-1.5">
                                    <Save size={14} />
                                    Guardar cambios
                                </Button>
                            </div>
                        </SectionContent>
                    )}

                    {section === 'printer' && (
                        <SectionContent
                            icon={Printer} color="text-cyan-400" iconBg="bg-cyan-500/10"
                            title="Impresora Térmica" desc="Detección automática y configuración ESC/POS"
                        >
                            <div className="space-y-4">
                                {/* Currently configured printer — always show if selectedPort is set */}
                                {selectedPort && detectedPrinters.length === 0 && !scanning && (
                                    <div className="flex items-center justify-between p-3 rounded-xl border bg-cyan-500/5 border-cyan-500/30">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 shrink-0">
                                                <Printer size={16} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[12px] font-semibold text-cyan-400">Impresora configurada</p>
                                                <p className="text-[10px] text-[#3D506A] uppercase font-mono">{selectedPort}</p>
                                            </div>
                                        </div>
                                        <CheckCircle2 size={14} className="text-cyan-400 shrink-0" />
                                    </div>
                                )}

                                {/* Printer list (after scan) or scan prompt */}
                                {scanning || detectedPrinters.length > 0 ? (
                                    <div className="space-y-2">
                                        {detectedPrinters.map(p => (
                                            <button
                                                key={p.port}
                                                onClick={() => setSelectedPort(p.port)}
                                                className={cn(
                                                    'w-full flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer',
                                                    selectedPort === p.port ? 'bg-cyan-500/5 border-cyan-500/40' : 'bg-[#101520] border-[#1E2A40] hover:border-[#283A56]'
                                                )}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={cn(
                                                        'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
                                                        selectedPort === p.port ? 'bg-cyan-500/20 text-cyan-400' : 'bg-[#1C2438] text-[#3D506A]'
                                                    )}>
                                                        <Printer size={16} />
                                                    </div>
                                                    <div className="text-left min-w-0">
                                                        <p className={cn('text-[12px] font-semibold truncate', selectedPort === p.port ? 'text-cyan-400' : 'text-[#E4ECF7]')}>{p.name}</p>
                                                        <p className="text-[10px] text-[#3D506A] uppercase">{p.port} · {p.status || 'Disponible'}</p>
                                                    </div>
                                                </div>
                                                {selectedPort === p.port && <CheckCircle2 size={14} className="text-cyan-400 shrink-0" />}
                                            </button>
                                        ))}
                                        {detectedPrinters.length === 0 && !scanning && (
                                            <div className="p-4 rounded-xl border border-dashed border-[#1E2A40] text-center">
                                                <p className="text-[12px] text-[#3D506A]">No se encontraron impresoras. Revisa la conexión USB.</p>
                                            </div>
                                        )}
                                        <button
                                            onClick={handleScan}
                                            disabled={scanning}
                                            className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-[#1C2438] text-[#E4ECF7] text-[12px] font-medium hover:bg-[#283A56] transition-colors cursor-pointer disabled:opacity-50"
                                        >
                                            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
                                            {scanning ? 'Buscando...' : 'Volver a escanear'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-4 p-4 rounded-xl border bg-[#101520] border-[#1E2A40]">
                                        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-[#1C2438] text-[#3D506A]">
                                            <Search size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[13px] font-semibold text-[#7A8FAA]">
                                                {selectedPort ? 'Buscar otras impresoras' : 'Detección de Impresora'}
                                            </p>
                                            <p className="text-[11px] text-[#3D506A] mt-0.5">Escanea los puertos COM para encontrar tu impresora térmica.</p>
                                        </div>
                                        <button
                                            onClick={handleScan}
                                            disabled={scanning}
                                            className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 text-[12px] font-semibold hover:bg-cyan-500/20 transition-colors cursor-pointer disabled:opacity-50"
                                        >
                                            {scanning ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                                            Escanear
                                        </button>
                                    </div>
                                )}

                                {testResult && (
                                    <div className={cn(
                                        'px-4 py-2 rounded-lg text-[12px] font-medium text-center',
                                        testResult.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                    )}>
                                        {testResult.msg}
                                    </div>
                                )}

                                <ToggleRow
                                    label="Cajón de dinero"
                                    description="Abrir automáticamente al cobrar en efectivo"
                                    value={drawerEnabled}
                                    onChange={handleToggleDrawer}
                                />

                                <div className="flex gap-2">
                                    <Button variant="primary" size="md" onClick={handleSavePrinter} loading={updateConfig.isPending} disabled={!selectedPort} className="gap-1.5">
                                        <Save size={14} />
                                        Guardar
                                    </Button>
                                    <Button variant="secondary" size="md" onClick={handleTestPrint} disabled={!selectedPort} className="gap-1.5">
                                        <Receipt size={14} />
                                        Imprimir prueba
                                    </Button>
                                    <Button variant="secondary" size="md" onClick={handleTestDrawer} disabled={!selectedPort} className="gap-1.5">
                                        <Zap size={14} />
                                        Probar cajón
                                    </Button>
                                </div>
                            </div>
                        </SectionContent>
                    )}

                    {section === 'employees' && (
                        <SectionContent
                            icon={Users} color="text-violet-400" iconBg="bg-violet-500/10"
                            title="Empleados / Cajeros" desc={`${employees.length} empleado${employees.length !== 1 ? 's' : ''} registrado${employees.length !== 1 ? 's' : ''}`}
                        >
                            <div className="space-y-4">
                                {/* Add button */}
                                <Button variant="primary" size="md" onClick={handleOpenAdd} className="gap-1.5">
                                    <Plus size={14} />
                                    Nuevo Empleado
                                </Button>

                                {/* List */}
                                <div className="space-y-1.5">
                                    {employees.map(emp => {
                                        const roleLabel = emp.role === 'CAJERO' ? 'Cajero' : emp.role === 'DUEÑO' ? 'Dueño' : emp.role === 'COCINERO' ? 'Cocinero' : 'Temporal'
                                        return (
                                            <div key={emp.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#101520] border border-[#1E2A40] hover:bg-[#141C2E] transition-colors">
                                                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10 text-violet-400 font-bold text-[14px] shrink-0">
                                                    {emp.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-medium text-[#E4ECF7] truncate">{emp.name}</p>
                                                    <p className="text-[11px] text-[#3D506A]">
                                                        {roleLabel}
                                                        {emp.role === 'TEMPORAL' && emp.activeTo && (
                                                            <span> · hasta {new Date(emp.activeTo + 'T00:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}</span>
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        onClick={() => handleOpenEdit(emp)}
                                                        className="flex items-center justify-center w-8 h-8 rounded-lg text-[#3D506A] hover:text-violet-400 hover:bg-violet-500/10 transition-colors cursor-pointer"
                                                    >
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeletingEmp(emp)}
                                                        className="flex items-center justify-center w-8 h-8 rounded-lg text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {employees.length === 0 && (
                                        <div className="flex flex-col items-center py-8 gap-2">
                                            <Users size={24} className="text-[#3D506A]" />
                                            <p className="text-[12px] text-[#3D506A]">Sin empleados registrados</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </SectionContent>
                    )}

                    {section === 'sync' && (
                        <SectionContent
                            icon={Cloud} color="text-blue-400" iconBg="bg-blue-500/10"
                            title="Sincronización" desc="Estado de conexión y datos del sistema"
                        >
                            <div className="space-y-4">
                                {/* Connection card */}
                                <div className={cn(
                                    'flex items-center gap-4 p-4 rounded-xl border',
                                    syncInfo.isOnline
                                        ? 'bg-emerald-500/5 border-emerald-500/20'
                                        : 'bg-red-500/5 border-red-500/20'
                                )}>
                                    <div className={cn('flex items-center justify-center w-11 h-11 rounded-xl shrink-0', syncInfo.isOnline ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
                                        {syncInfo.isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className={cn('text-[13px] font-semibold', syncInfo.isOnline ? 'text-emerald-400' : 'text-red-400')}>
                                                {syncInfo.isOnline ? 'Conectado' : 'Sin conexión'}
                                            </p>
                                            <span className={cn('w-1.5 h-1.5 rounded-full', syncInfo.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400')} />
                                        </div>
                                        <p className="text-[11px] text-[#3D506A] mt-0.5">
                                            {syncInfo.isOnline
                                                ? 'Los datos se sincronizan automáticamente con la nube'
                                                : 'Las ventas se guardan localmente y se subirán al reconectar'}
                                        </p>
                                    </div>
                                </div>

                                {/* Sync details */}
                                <div className="rounded-xl bg-[#101520] border border-[#1E2A40] divide-y divide-[#192030]">
                                    {[
                                        { label: 'Servidor',        value: 'Supabase (cloud)' },
                                        { label: 'Descarga',        value: 'Realtime + 5m fallback' },
                                        { label: 'Subida',          value: 'Cada 15 segundos' },
                                    ].map(row => (
                                        <div key={row.label} className="flex items-center justify-between px-4 py-3">
                                            <span className="text-[12px] text-[#3D506A]">{row.label}</span>
                                            <span className="text-[12px] text-[#7A8FAA] font-mono">{row.value}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between px-4 py-3 bg-blue-500/5">
                                        <span className="text-[12px] font-medium text-blue-400">Pendientes de subir</span>
                                        <span className={cn('text-[12px] font-bold', syncInfo.pendingCount > 0 ? 'text-amber-400' : 'text-emerald-400')}>
                                            {syncInfo.pendingCount} registros
                                        </span>
                                    </div>
                                </div>

                                {/* DevTools + Force re-sync */}
                                {window.electronAPI && (
                                    <button
                                        onClick={() => window.electronAPI!.openDevTools()}
                                        className="w-full flex items-center justify-center gap-2 h-9 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#3D506A] text-[12px] font-medium hover:text-[#7A8FAA] hover:bg-[#1C2438] transition-colors cursor-pointer"
                                    >
                                        <Monitor size={13} />
                                        Abrir consola (DevTools)
                                    </button>
                                )}
                                {window.electronAPI && (
                                    <button
                                        onClick={async () => {
                                            setForcePushing(true)
                                            try {
                                                const result = await window.electronAPI!.forcePush()
                                                if (result.totalRemaining === 0) {
                                                    toast.success('Re-sincronización completada — todo subido')
                                                } else {
                                                    const details = Object.entries(result.remaining)
                                                        .map(([t, n]) => `${t}: ${n}`)
                                                        .join(', ')
                                                    const firstError = result.pushErrors?.[0] ?? ''
                                                    toast.warning(`Sync incompleto (${details})${firstError ? ` — ${firstError}` : ''}`, 15000)
                                                }
                                            } catch {
                                                toast.error('Error al re-sincronizar')
                                            } finally {
                                                setForcePushing(false)
                                            }
                                        }}
                                        disabled={forcePushing}
                                        className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-400 text-[13px] font-medium hover:bg-blue-500/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <RefreshCw size={14} className={forcePushing ? 'animate-spin' : ''} />
                                        {forcePushing ? 'Sincronizando...' : 'Forzar re-sincronización'}
                                    </button>
                                )}

                                {/* Sync errors panel */}
                                {window.electronAPI && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <AlertTriangle size={12} className={syncErrors.length > 0 ? 'text-amber-400' : 'text-[#3D506A]'} />
                                                <span className={cn('text-[11px] uppercase tracking-wider font-semibold', syncErrors.length > 0 ? 'text-amber-400' : 'text-[#3D506A]')}>
                                                    Errores de sincronización{syncErrors.length > 0 ? ` (${syncErrors.length})` : ''}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button onClick={loadSyncErrors} className="text-[11px] text-[#3D506A] hover:text-[#7A8FAA] transition-colors cursor-pointer px-1">
                                                    <RefreshCw size={11} />
                                                </button>
                                                {syncErrors.length > 0 && (
                                                    <button onClick={dismissAllSyncErrors} className="text-[11px] text-[#3D506A] hover:text-red-400 transition-colors cursor-pointer px-1">
                                                        Limpiar todos
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {syncErrors.length === 0 ? (
                                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#101520] border border-[#1E2A40]">
                                                <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                                                <span className="text-[12px] text-[#3D506A]">Sin errores de sincronización</span>
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                                                {syncErrors.map(err => (
                                                    <div key={err.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                                                        <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-semibold text-amber-400">{err.tableName}</p>
                                                            <p className="text-[11px] text-[#7A8FAA] truncate">{err.errorMsg}</p>
                                                            <p className="text-[10px] text-[#3D506A] mt-0.5">
                                                                {err.attempts} intento{err.attempts !== 1 ? 's' : ''} · {new Date(err.lastAttemptAt).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                        <button onClick={() => dismissSyncError(err.id)} className="text-[#3D506A] hover:text-red-400 transition-colors cursor-pointer shrink-0">
                                                            <X size={11} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* App info */}
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { icon: <HardDrive size={11} />, label: `Soda POS v${__APP_VERSION__}` },
                                        { icon: <Cloud size={11} />,     label: 'Supabase' },
                                        { icon: <Zap size={11} />,       label: 'Electron + React' },
                                    ].map(chip => (
                                        <div key={chip.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#101520] border border-[#1E2A40] text-[11px] text-[#3D506A]">
                                            {chip.icon}
                                            {chip.label}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </SectionContent>
                    )}

                    {section === 'updates' && (
                        <SectionContent
                            icon={Download} color="text-emerald-400" iconBg="bg-emerald-500/10"
                            title="Actualizaciones" desc="Versión instalada y búsqueda de actualizaciones"
                        >
                            <div className="space-y-4">
                                <div className="rounded-xl bg-[#101520] border border-[#1E2A40] divide-y divide-[#192030]">
                                    <div className="flex items-center justify-between px-4 py-3">
                                        <span className="text-[12px] text-[#3D506A]">Versión instalada</span>
                                        <span className="text-[12px] font-mono text-emerald-400">v{appVersion || '...'}</span>
                                    </div>
                                    <div className="flex items-center justify-between px-4 py-3">
                                        <span className="text-[12px] text-[#3D506A]">Última verificación</span>
                                        <span className="text-[12px] font-mono text-[#7A8FAA]">
                                            {lastChecked ? timeAgo(lastChecked) : 'Al iniciar el app'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between px-4 py-3">
                                        <span className="text-[12px] text-[#3D506A]">Verificación automática</span>
                                        <span className="text-[12px] font-mono text-[#7A8FAA]">Cada 30 min</span>
                                    </div>
                                </div>

                                {updateStatus === 'up-to-date' && (
                                    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                                        <p className="text-[13px] text-emerald-400 font-medium">Tienes la última versión</p>
                                    </div>
                                )}

                                <Button
                                    variant="primary"
                                    size="md"
                                    onClick={handleCheckUpdate}
                                    loading={updateStatus === 'checking'}
                                    disabled={!window.electronAPI}
                                    className="gap-1.5"
                                >
                                    <RefreshCw size={14} />
                                    {updateStatus === 'checking' ? 'Verificando...' : 'Buscar actualización'}
                                </Button>

                                {!window.electronAPI && (
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-[11px] text-amber-500/70">
                                        <Info size={14} className="shrink-0" />
                                        Solo disponible en la versión de escritorio.
                                    </div>
                                )}
                            </div>
                        </SectionContent>
                    )}

                    {section === 'system' && (
                        <SectionContent
                            icon={Monitor} color="text-slate-400" iconBg="bg-slate-500/10"
                            title="Control del Sistema" desc="Administra el estado de la aplicación"
                        >
                            <div className="space-y-5">
                                {/* Window controls */}
                                <div className="grid grid-cols-2 gap-3">
                                    <SystemActionCard
                                        icon={<Minimize2 size={22} />}
                                        iconBg="bg-blue-500/10 text-blue-400"
                                        label="Minimizar"
                                        desc="Enviar a la barra de tareas"
                                        onClick={() => window.electronAPI?.minimizeWindow()}
                                    />
                                    <SystemActionCard
                                        icon={<Maximize2 size={22} />}
                                        iconBg="bg-amber-500/10 text-amber-400"
                                        label="Maximizar"
                                        desc="Cambiar tamaño de ventana"
                                        onClick={() => window.electronAPI?.maximizeWindow()}
                                    />
                                </div>

                                {/* Close app */}
                                <button
                                    onClick={() => {
                                        if (confirm('¿Cerrar el sistema POS?')) {
                                            window.electronAPI?.closeWindow()
                                        }
                                    }}
                                    className="w-full flex items-center justify-between px-4 py-4 rounded-xl bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 transition-colors cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/10 text-red-400">
                                            <LogOut size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-[13px] font-semibold text-red-400">Cerrar Aplicación</p>
                                            <p className="text-[11px] text-red-500/60">Finalizar sesión en este equipo</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-red-500/30 group-hover:translate-x-0.5 transition-transform" />
                                </button>

                                {!window.electronAPI && (
                                    <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-[11px] text-amber-500/70">
                                        <Info size={14} className="shrink-0" />
                                        Estas opciones solo están disponibles en la versión de escritorio.
                                    </div>
                                )}
                            </div>
                        </SectionContent>
                    )}
                </div>
            </div>

            <EmployeeFormModal
                isOpen={empFormOpen}
                onClose={() => setEmpFormOpen(false)}
                editing={editingEmp}
            />

            <DeleteConfirmModal
                isOpen={deletingEmp !== null}
                onClose={() => setDeletingEmp(null)}
                onConfirm={handleDeleteEmp}
                title="Eliminar empleado"
                description={`¿Eliminar a "${deletingEmp?.name}"? Esta acción no se puede deshacer.`}
            />
        </div>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionContent({ icon: Icon, color, iconBg, title, desc, children }: {
    icon: React.ElementType; color: string; iconBg: string
    title: string; desc: string; children: React.ReactNode
}) {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 pb-1">
                <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl shrink-0', iconBg)}>
                    <Icon size={20} className={color} />
                </div>
                <div>
                    <h2 className="text-[16px] font-semibold text-[#E4ECF7]">{title}</h2>
                    <p className="text-[12px] text-[#3D506A]">{desc}</p>
                </div>
            </div>
            {children}
        </div>
    )
}

function TicketPreview({ bizName, bizAddress, bizPhone, ticketHeader, ticketFooter, opts }: {
    bizName: string; bizAddress: string; bizPhone: string
    ticketHeader: string; ticketFooter: string
    opts: TicketOptions
}) {
    const sep = <div className="border-t border-dashed border-gray-300 my-1.5" />
    const sym = opts.currencySymbol || '₡'
    return (
        <div className="bg-white text-black font-mono p-4 rounded-lg shadow-xl text-[11px] leading-relaxed border-2 border-gray-100 w-[240px] select-none">
            <div className="text-center font-bold text-[13px]">{bizName || 'Mi Soda'}</div>
            {bizAddress && <div className="text-center text-[10px]">{bizAddress}</div>}
            {bizPhone && <div className="text-center text-[10px]">Tel: {bizPhone}</div>}
            {opts.showHeader && ticketHeader && <div className="text-center text-[10px] mt-0.5">{ticketHeader}</div>}
            {sep}
            <div>Ticket #0001</div>
            <div className="text-[10px] text-gray-500">01/01/2026 08:00</div>
            {opts.showCashier && <div>Cajero: Juan</div>}
            {sep}
            <div className="flex justify-between">
                <span>1x Casado con pollo</span>
                <span>{sym}2,500</span>
            </div>
            {opts.showUnitPrice && <div className="text-right text-[10px] text-gray-400">{sym}2,500 c/u</div>}
            <div className="flex justify-between">
                <span>2x Refresco natural</span>
                <span>{sym}800</span>
            </div>
            {opts.showUnitPrice && <div className="text-right text-[10px] text-gray-400">{sym}400 c/u</div>}
            {sep}
            <div className="text-right font-bold">TOTAL: {sym}3,300</div>
            <div className="text-[10px]">Pago: EFECTIVO</div>
            {opts.showChange && <div className="text-[10px]">Recibido: {sym}5,000</div>}
            {opts.showChange && <div className="text-[10px]">Vuelto: {sym}1,700</div>}
            {ticketFooter && (
                <>
                    {sep}
                    <div className="text-center text-[10px]">{ticketFooter}</div>
                </>
            )}
        </div>
    )
}

function SystemActionCard({ icon, iconBg, label, desc, onClick }: {
    icon: React.ReactNode; iconBg: string; label: string; desc: string; onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-3 p-4 rounded-xl bg-[#101520] border border-[#1E2A40] hover:bg-[#141C2E] transition-colors cursor-pointer group text-left"
        >
            <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl shrink-0 group-hover:scale-105 transition-transform', iconBg)}>
                {icon}
            </div>
            <div>
                <p className="text-[13px] font-semibold text-[#E4ECF7]">{label}</p>
                <p className="text-[11px] text-[#3D506A]">{desc}</p>
            </div>
        </button>
    )
}
