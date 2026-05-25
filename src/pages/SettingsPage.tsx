import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
    Settings2, Store, Receipt, Printer, Users, Cloud,
    Monitor, Save, Plus, Trash2, ChevronRight, ChevronDown, Wifi, WifiOff,
    RefreshCw, HardDrive, Zap, LogOut, Minimize2, Maximize2,
    CheckCircle2, Search, Info, Edit2, Download, AlertTriangle, X,
    Mail, Upload, RotateCcw, Package, MessageSquare, Server, Copy, Building2,
    SlidersHorizontal, ImageOff, Image,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getDeletedClients, restoreClient, hardDeleteClient, getDeletedCompanies, restoreCompany, hardDeleteCompany } from '@/services/clients'
import { getDeletedProducts, restoreProduct, hardDeleteProduct } from '@/services/products'
import { getVoidedSales } from '@/services/sales'
import { Button } from '@/components/atoms/Button'
import { toast } from '@/components/ui/Toast'
import { sileo } from 'sileo'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { EmployeeFormModal } from '@/components/modals/EmployeeFormModal'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import { useEmployees, useDeactivateEmployee } from '@/hooks/useEmployees'
import { useBusinessConfig, useUpdateConfig } from '@/hooks/useConfig'
import { useUIStore } from '@/store/uiStore'
import { cn, crDateTime, crDateStr } from '@/lib/utils'
import { getEmployeePrefs, useEmployeePrefs } from '@/hooks/useEmployeePrefs'
import type { Employee } from '@/types'

type Section = 'business' | 'ticket' | 'email' | 'printer' | 'employees' | 'emp-prefs' | 'sync' | 'system' | 'updates' | 'trash' | 'sinpe'

function timeAgo(date: Date) {
    const diff = Date.now() - date.getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'hace un momento'
    if (min < 60) return `hace ${min} min`
    return `hace ${Math.floor(min / 60)}h`
}

type TicketOptions = { showCashier: boolean; showChange: boolean; showHeader: boolean; showUnitPrice: boolean; showDecimals: boolean; currencySymbol: string }
const DEFAULT_TICKET_OPTIONS: TicketOptions = { showCashier: true, showChange: true, showHeader: true, showUnitPrice: false, showDecimals: true, currencySymbol: '₡' }
const CURRENCY_OPTIONS = ['₡', '$', '€', '£', '¥']

const SECTIONS: { id: Section; label: string; desc: string; icon: React.ElementType; color: string }[] = [
    { id: 'business',   label: 'Negocio',         desc: 'Nombre, teléfono, dirección',       icon: Store,    color: 'text-orange-400' },
    { id: 'ticket',     label: 'Ticket',           desc: 'Logo, encabezado y pie del recibo', icon: Receipt,  color: 'text-amber-400' },
    { id: 'email',      label: 'Correo',           desc: 'Logo y apariencia del recibo',      icon: Mail,     color: 'text-sky-400' },
    { id: 'printer',    label: 'Impresora',        desc: 'Detección y configuración',         icon: Printer,  color: 'text-cyan-400' },
    { id: 'employees',  label: 'Empleados',        desc: 'Cajeros y personal',                icon: Users,              color: 'text-violet-400' },
    { id: 'emp-prefs',  label: 'Preferencias',     desc: 'Configuración por empleado',        icon: SlidersHorizontal,  color: 'text-indigo-400' },
    { id: 'sync',       label: 'Sincronización',   desc: 'Estado de la nube',                 icon: Cloud,              color: 'text-blue-400' },
    { id: 'system',     label: 'Sistema',          desc: 'Control de ventana y app',          icon: Monitor,  color: 'text-slate-400' },
    { id: 'updates',    label: 'Actualizaciones',  desc: 'Versión y actualizaciones del app',  icon: Download, color: 'text-emerald-400' },
    { id: 'trash',      label: 'Papelera',         desc: 'Eliminados y ventas anuladas',       icon: Trash2,      color: 'text-red-400' },
    { id: 'sinpe',      label: 'SINPE',            desc: 'Servidor y configuración de SINPE',  icon: MessageSquare, color: 'text-green-400' },
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
    const [showCloseConfirm, setShowCloseConfirm] = useState(false)

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
    const [ticketLogoUrl, setTicketLogoUrl] = useState('')
    const [uploadingTicket, setUploadingTicket] = useState(false)

    // Email
    const [emailLogoUrl, setEmailLogoUrl] = useState('')
    const [uploadingEmail, setUploadingEmail] = useState(false)
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
            setTicketLogoUrl(config.ticketLogoUrl ?? '')
            setEmailLogoUrl(config.emailLogoUrl ?? '')
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
        sileo.success({
            title: 'Negocio guardado',
            description: (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                            background: 'linear-gradient(135deg, rgba(249,115,22,0.25), rgba(249,115,22,0.08))',
                            border: '1px solid rgba(249,115,22,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 19, fontWeight: 900, color: '#F97316',
                        }}>
                            {bizName.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, color: '#E4ECF7', fontWeight: 700, lineHeight: 1.2, marginBottom: 3 }}>{bizName}</div>
                            {(bizPhone || bizAddress) && (
                                <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4 }}>
                                    {[bizPhone, bizAddress].filter(Boolean).join(' · ')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ),
            position: 'top-right',
        })
    }

    async function handleSaveTicket() {
        await updateConfig.mutateAsync({ ticketHeader: ticketHeader || null, ticketFooter: ticketFooter || null })
        localStorage.setItem('pos_ticket_options', JSON.stringify(ticketOpts))
        const activeOpts = [
            ticketOpts.showCashier && 'Cajero',
            ticketOpts.showChange && 'Cambio',
            ticketOpts.showUnitPrice && 'Precio unitario',
            ticketOpts.showHeader && 'Encabezado',
        ].filter(Boolean) as string[]
        sileo.success({
            title: 'Ticket guardado',
            description: (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activeOpts.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {activeOpts.map(label => (
                                <span key={label} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    fontSize: 10, background: 'rgba(16,185,129,0.1)', color: '#10B981',
                                    padding: '3px 9px', borderRadius: 99, fontWeight: 600,
                                    border: '1px solid rgba(16,185,129,0.22)',
                                }}>
                                    <span style={{ fontSize: 8, fontWeight: 900 }}>✓</span>
                                    {label}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <span style={{ fontSize: 11, color: '#6B7280' }}>Sin opciones activas</span>
                    )}
                    <div style={{ fontSize: 10, color: '#374151' }}>
                        {activeOpts.length} opción{activeOpts.length !== 1 ? 'es' : ''} activa{activeOpts.length !== 1 ? 's' : ''}
                    </div>
                </div>
            ),
            position: 'top-right',
        })
    }

    async function handleUploadTicketLogo(file: File) {
        setUploadingTicket(true)
        try {
            if (ticketLogoUrl) {
                const oldPath = ticketLogoUrl.split('/object/public/ticketLogos/')[1]?.split('?')[0]
                if (oldPath) await supabase.storage.from('ticketLogos').remove([oldPath])
            }
            const ext = file.name.split('.').pop() ?? 'png'
            const fileName = `ticket-logo-${Date.now()}.${ext}`
            const { error } = await supabase.storage.from('ticketLogos').upload(fileName, file)
            if (error) throw error
            const { data: { publicUrl } } = supabase.storage.from('ticketLogos').getPublicUrl(fileName)
            await updateConfig.mutateAsync({ ticketLogoUrl: publicUrl })
            setTicketLogoUrl(publicUrl)
            if (window.electronAPI) {
                const res = await window.electronAPI.cacheTicketLogo(publicUrl)
                if (!res.success) toast.warning('Logo guardado pero falló la caché local: ' + res.error)
            }
            toast.success('Logo de ticket guardado')
        } catch (err: any) {
            toast.error('Error al subir logo: ' + err.message)
        } finally {
            setUploadingTicket(false)
        }
    }

    async function handleClearTicketLogo() {
        if (ticketLogoUrl) {
            const oldPath = ticketLogoUrl.split('/object/public/ticketLogos/')[1]?.split('?')[0]
            if (oldPath) await supabase.storage.from('ticketLogos').remove([oldPath])
        }
        await updateConfig.mutateAsync({ ticketLogoUrl: null })
        setTicketLogoUrl('')
        if (window.electronAPI) await window.electronAPI.clearTicketLogo()
        toast.success('Logo de ticket eliminado')
    }

    async function handleUploadEmailLogo(file: File) {
        setUploadingEmail(true)
        try {
            if (emailLogoUrl) {
                const oldPath = emailLogoUrl.split('/object/public/emailLogos/')[1]?.split('?')[0]
                if (oldPath) await supabase.storage.from('emailLogos').remove([oldPath])
            }
            const ext = file.name.split('.').pop() ?? 'png'
            const fileName = `email-logo-${Date.now()}.${ext}`
            const { error } = await supabase.storage.from('emailLogos').upload(fileName, file)
            if (error) throw error
            const { data: { publicUrl } } = supabase.storage.from('emailLogos').getPublicUrl(fileName)
            await updateConfig.mutateAsync({ emailLogoUrl: publicUrl })
            setEmailLogoUrl(publicUrl)
            toast.success('Logo de correo guardado')
        } catch (err: any) {
            toast.error('Error al subir logo: ' + err.message)
        } finally {
            setUploadingEmail(false)
        }
    }

    async function handleClearEmailLogo() {
        if (emailLogoUrl) {
            const oldPath = emailLogoUrl.split('/object/public/emailLogos/')[1]?.split('?')[0]
            if (oldPath) await supabase.storage.from('emailLogos').remove([oldPath])
        }
        await updateConfig.mutateAsync({ emailLogoUrl: null })
        setEmailLogoUrl('')
        toast.success('Logo de correo eliminado')
    }

    async function handleSelectTicketLogo(url: string) {
        await updateConfig.mutateAsync({ ticketLogoUrl: url })
        setTicketLogoUrl(url)
        if (window.electronAPI) {
            const res = await window.electronAPI.cacheTicketLogo(url)
            if (!res.success) toast.warning('Logo seleccionado pero falló la caché: ' + res.error)
        }
        toast.success('Logo de ticket actualizado')
    }

    async function handleSelectEmailLogo(url: string) {
        await updateConfig.mutateAsync({ emailLogoUrl: url })
        setEmailLogoUrl(url)
        toast.success('Logo de correo actualizado')
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
        const opts = ticketOpts
        const ok = await window.electronAPI.printReceipt(selectedPort, {
            businessName: bizName || 'PRUEBA DE IMPRESION',
            address: bizAddress || null,
            phone: bizPhone || null,
            header: ticketHeader || null,
            saleNumber: '0000',
            date: new Date().toISOString(),
            cashier: 'Cajero de prueba',
            items: [{ name: 'PRODUCTO DE PRUEBA', quantity: 1, unitPrice: 1500, subtotal: 1500 }],
            total: 1500,
            paymentMethod: 'EFECTIVO',
            amountReceived: 2000,
            change: 500,
            footer: ticketFooter || 'Si ves esto, la impresora esta OK',
            ticketLogoUrl: ticketLogoUrl || null,
            showCashier: opts.showCashier,
            showChange: opts.showChange,
            showHeader: opts.showHeader,
            showUnitPrice: opts.showUnitPrice,
            showDecimals: opts.showDecimals,
            currencySymbol: opts.currencySymbol,
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
                                    <FieldLabel>Logo del ticket</FieldLabel>
                                    <div className="flex gap-3 items-start">
                                        <div className="flex-1 min-w-0">
                                            <LogoUploadField
                                                logoUrl={ticketLogoUrl}
                                                uploading={uploadingTicket}
                                                onUpload={handleUploadTicketLogo}
                                                onClear={handleClearTicketLogo}
                                                accentColor="amber"
                                                hint="Se imprimirá centrado a 300px de ancho"
                                            />
                                        </div>
                                        <BucketPickerPanel
                                            bucket="ticketLogos"
                                            currentUrl={ticketLogoUrl}
                                            onSelect={handleSelectTicketLogo}
                                            accentColor="amber"
                                        />
                                    </div>
                                </div>
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
                                    <ToggleRow
                                        label="Mostrar decimales"
                                        description="Forzar 2 decimales en los montos (ej: ,00)"
                                        value={ticketOpts.showDecimals}
                                        onChange={v => setTicketOpts(p => ({ ...p, showDecimals: v }))}
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
                                            ticketLogoUrl={ticketLogoUrl || undefined}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button variant="primary" size="md" onClick={handleSaveTicket} loading={updateConfig.isPending} className="gap-1.5">
                                        <Save size={14} />
                                        Guardar cambios
                                    </Button>
                                    <Button
                                        variant="secondary" size="md"
                                        onClick={handleTestPrint}
                                        disabled={!selectedPort}
                                        title={!selectedPort ? 'Configura una impresora primero' : undefined}
                                        className="gap-1.5"
                                    >
                                        <Receipt size={14} />
                                        Imprimir prueba
                                    </Button>
                                </div>
                            </div>
                        </SectionContent>
                    )}

                    {section === 'email' && (
                        <SectionContent
                            icon={Mail} color="text-sky-400" iconBg="bg-sky-500/10"
                            title="Recibo por Correo" desc="Apariencia del correo que se envía al cliente"
                        >
                            <div className="space-y-5">
                                <div>
                                    <FieldLabel>Logo del correo</FieldLabel>
                                    <div className="flex gap-3 items-start">
                                        <div className="flex-1 min-w-0">
                                            <LogoUploadField
                                                logoUrl={emailLogoUrl}
                                                uploading={uploadingEmail}
                                                onUpload={handleUploadEmailLogo}
                                                onClear={handleClearEmailLogo}
                                                accentColor="sky"
                                                hint="Se muestra en la esquina superior del recibo de correo"
                                            />
                                        </div>
                                        <BucketPickerPanel
                                            bucket="emailLogos"
                                            currentUrl={emailLogoUrl}
                                            onSelect={handleSelectEmailLogo}
                                            accentColor="sky"
                                        />
                                    </div>
                                </div>

                                <div className="border-t border-[#192030] pt-4">
                                    <FieldLabel>Vista previa del encabezado</FieldLabel>
                                    <div className="mt-2 rounded-xl border border-[#1E2A40] overflow-hidden bg-[#0D1117]">
                                        <div className="bg-[#13192A] px-5 py-4 flex items-center gap-4 border-b border-[#1E2A40]">
                                            {emailLogoUrl ? (
                                                <img
                                                    src={emailLogoUrl}
                                                    alt="Logo"
                                                    className="w-14 h-14 rounded-2xl object-cover shrink-0 border border-[#1E2A40]"
                                                />
                                            ) : (
                                                <div className="w-14 h-14 rounded-2xl bg-sky-500/20 flex items-center justify-center shrink-0">
                                                    <span className="text-sky-400 font-bold text-xl">
                                                        {(bizName || 'S').charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <div>
                                                <p className="text-[13px] font-semibold text-[#E4ECF7]">{bizName || 'Mi Soda'}</p>
                                                <p className="text-[11px] text-[#3D506A]">Recibo de compra · #{new Date().getFullYear()}001</p>
                                            </div>
                                        </div>
                                        <div className="px-5 py-3">
                                            <p className="text-[11px] text-[#3D506A]">Contenido del recibo...</p>
                                        </div>
                                    </div>
                                </div>

                                {!emailLogoUrl && (
                                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#101520] border border-[#1E2A40]">
                                        <Info size={12} className="text-[#3D506A] shrink-0" />
                                        <span className="text-[11px] text-[#3D506A]">Sin logo, el correo mostrará la inicial del nombre del negocio.</span>
                                    </div>
                                )}
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

                    {section === 'emp-prefs' && (
                        <SectionContent
                            icon={SlidersHorizontal} color="text-indigo-400" iconBg="bg-indigo-500/10"
                            title="Preferencias por Empleado" desc="Personaliza la experiencia del POS para cada cajero"
                        >
                            <EmpPrefsSection employees={employees ?? []} />
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
                                                await sileo.promise(window.electronAPI!.forcePush(), {
                                                    loading: { title: 'Sincronizando...', description: 'Subiendo cambios pendientes', position: 'top-right' },
                                                    success: (result) => result.totalRemaining === 0
                                                        ? {
                                                            title: 'Sincronización completa',
                                                            description: (
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 2 }}>
                                                                    <span style={{ color: '#10B981' }}>✓</span>
                                                                    <span style={{ color: '#7A8FAA' }}>Todo subido correctamente</span>
                                                                </span>
                                                            ),
                                                            position: 'top-right' as const,
                                                          }
                                                        : {
                                                            title: 'Sync incompleto',
                                                            type: 'warning' as const,
                                                            description: (
                                                                <span style={{ fontSize: 12, color: '#F59E0B', marginTop: 2, display: 'block' }}>
                                                                    {Object.entries(result.remaining).map(([t, n]) => `${t}: ${n}`).join(' · ')}
                                                                </span>
                                                            ),
                                                            position: 'top-right' as const,
                                                          },
                                                    error: { title: 'Error al re-sincronizar', description: 'Revisa tu conexión a internet', position: 'top-right' },
                                                })
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

                    {section === 'trash' && <TrashSection />}

                    {section === 'sinpe' && <SinpeSettingsSection />}

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
                                    onClick={() => setShowCloseConfirm(true)}
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

            <DeleteConfirmModal
                isOpen={showCloseConfirm}
                onClose={() => setShowCloseConfirm(false)}
                onConfirm={() => window.electronAPI?.closeWindow()}
                title="Cerrar aplicación"
                description="¿Estás seguro de que deseas cerrar el sistema POS?"
                confirmLabel="Cerrar aplicación"
            />
        </div>
    )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BucketPickerPanel({ bucket, currentUrl, onSelect, accentColor }: {
    bucket: string
    currentUrl: string
    onSelect: (url: string) => Promise<void>
    accentColor: 'amber' | 'sky'
}) {
    const [files, setFiles] = useState<{ name: string; url: string }[]>([])
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const isAmber = accentColor === 'amber'

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

    const load = async () => {
        setLoading(true)
        setErrorMsg(null)
        try {
            let rawFiles: any[] = []

            if (window.electronAPI) {
                const result = await window.electronAPI.listBucket(bucket)
                if (result.error) throw new Error(result.error)
                rawFiles = result.data ?? []
            } else {
                const { data, error } = await supabase.storage.from(bucket).list('', { limit: 100 })
                if (error) throw new Error(error.message)
                rawFiles = data ?? []
            }

            setFiles(
                rawFiles
                    .filter((f: any) => f.name && !f.name.startsWith('.') && f.id)
                    .map((f: any) => ({
                        name: f.name,
                        url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${f.name}`,
                    }))
            )
        } catch (err: any) {
            setErrorMsg(err.message ?? 'Error al listar bucket')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [bucket])

    const selectedBorder = isAmber ? 'border-amber-500' : 'border-sky-500'
    const hoverBorder = isAmber ? 'hover:border-amber-500/40' : 'hover:border-sky-500/40'
    const refreshColor = isAmber ? 'hover:text-amber-400' : 'hover:text-sky-400'

    return (
        <div className="flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center justify-between w-[140px]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3D506A]">Del bucket</p>
                <button
                    onClick={load}
                    title="Recargar"
                    className={cn('text-[#3D506A] transition-colors cursor-pointer', refreshColor)}
                >
                    <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>
            <div className="w-[140px] h-[108px] rounded-xl bg-[#101520] border border-[#1E2A40] overflow-y-auto p-1.5">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <RefreshCw size={14} className="animate-spin text-[#3D506A]" />
                    </div>
                ) : errorMsg ? (
                    <div className="flex items-center justify-center h-full px-2">
                        <p className="text-[10px] text-red-400/70 text-center leading-snug">{errorMsg}</p>
                    </div>
                ) : files.length === 0 ? (
                    <div className="flex items-center justify-center h-full px-2">
                        <p className="text-[10px] text-[#3D506A] text-center leading-snug">Sin imágenes en el bucket</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-1">
                        {files.map(f => (
                            <button
                                key={f.name}
                                onClick={() => onSelect(f.url)}
                                title={f.name}
                                className={cn(
                                    'aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer',
                                    currentUrl === f.url ? selectedBorder : cn('border-transparent', hoverBorder)
                                )}
                            >
                                <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function LogoUploadField({ logoUrl, uploading, onUpload, onClear, accentColor, hint }: {
    logoUrl: string
    uploading: boolean
    onUpload: (file: File) => void
    onClear: () => void
    accentColor: 'amber' | 'sky'
    hint?: string
}) {
    const fileRef = useRef<HTMLInputElement>(null)
    const accent = accentColor === 'amber'
        ? { border: 'border-amber-500/30', bg: 'bg-amber-500/8', text: 'text-amber-400', hover: 'hover:bg-amber-500/15' }
        : { border: 'border-sky-500/30', bg: 'bg-sky-500/8', text: 'text-sky-400', hover: 'hover:bg-sky-500/15' }

    return (
        <div className="space-y-2">
            {logoUrl ? (
                <div className={cn('flex items-center gap-3 p-3 rounded-xl border', accent.bg, accent.border)}>
                    <img src={logoUrl} alt="Logo" className="w-14 h-14 rounded-xl object-cover shrink-0 border border-[#1E2A40]" />
                    <div className="flex-1 min-w-0">
                        <p className={cn('text-[12px] font-semibold', accent.text)}>Logo configurado</p>
                        {hint && <p className="text-[10px] text-[#3D506A] mt-0.5 truncate">{hint}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className={cn('flex items-center gap-1 px-3 h-8 rounded-lg text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50', accent.text, accent.hover)}
                        >
                            <Upload size={11} />
                            Cambiar
                        </button>
                        <button
                            onClick={onClear}
                            disabled={uploading}
                            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#3D506A] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className={cn(
                        'w-full flex items-center justify-center gap-2 h-20 rounded-xl border border-dashed transition-all cursor-pointer disabled:opacity-50',
                        'bg-[#101520] border-[#1E2A40] text-[#3D506A]',
                        accent.hover, `hover:${accent.border}`, `hover:${accent.text}`
                    )}
                >
                    {uploading ? (
                        <RefreshCw size={16} className="animate-spin" />
                    ) : (
                        <>
                            <Upload size={16} />
                            <span className="text-[12px] font-medium">Subir imagen</span>
                        </>
                    )}
                </button>
            )}
            {hint && !logoUrl && <p className="text-[10px] text-[#3D506A]">{hint}</p>}
            <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) { onUpload(file); e.target.value = '' }
                }}
            />
        </div>
    )
}

function TrashSection() {
    const [tab, setTab] = useState<'clients' | 'companies' | 'products' | 'sales' | 'sinpe'>('clients')
    const [confirmHard, setConfirmHard] = useState<{ type: 'client' | 'company' | 'product'; id: string; name: string } | null>(null)
    const [confirmRestore, setConfirmRestore] = useState<{ type: 'client' | 'company' | 'product'; id: string; name: string } | null>(null)
    const [isActing, setIsActing] = useState(false)
    const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null)
    const qc = useQueryClient()

    // SINPE trash state
    const [sinpeDeleted, setSinpeDeleted] = useState<any[]>([])
    const [loadingSinpe, setLoadingSinpe] = useState(false)
    const [pendingClearSinpeTrash, setPendingClearSinpeTrash] = useState(false)

    const { data: deletedClients = [], isLoading: loadingClients } = useQuery({
        queryKey: ['trash-clients'],
        queryFn: getDeletedClients,
    })
    const { data: deletedCompanies = [], isLoading: loadingCompanies } = useQuery({
        queryKey: ['trash-companies'],
        queryFn: getDeletedCompanies,
    })
    const { data: deletedProducts = [], isLoading: loadingProducts } = useQuery({
        queryKey: ['trash-products'],
        queryFn: getDeletedProducts,
    })
    const { data: voidedSales = [], isLoading: loadingSales } = useQuery({
        queryKey: ['trash-sales'],
        queryFn: getVoidedSales,
    })

    useEffect(() => {
        if (tab !== 'sinpe') return
        setLoadingSinpe(true)
        window.electronAPI?.getSinpeDeleted?.().then((msgs: any[]) => {
            setSinpeDeleted(msgs)
            setLoadingSinpe(false)
        })
    }, [tab])

    async function handleSinpeRestore(id: string) {
        await window.electronAPI?.restoreSinpeMessage?.(id)
        setSinpeDeleted(prev => prev.filter(m => m.id !== id))
        toast.success('Mensaje restaurado')
    }

    async function handleSinpeHardDelete(id: string) {
        await window.electronAPI?.hardDeleteSinpeMessage?.(id)
        setSinpeDeleted(prev => prev.filter(m => m.id !== id))
    }

    async function handleSinpeClearTrash() {
        await window.electronAPI?.clearSinpeTrash?.()
        setSinpeDeleted([])
        setPendingClearSinpeTrash(false)
        toast.success('Papelera SINPE vaciada')
    }

    function fmtSinpeDate(iso: string) { return crDateTime(iso) }

    async function handleRestoreConfirmed() {
        if (!confirmRestore) return
        setIsActing(true)
        try {
            if (confirmRestore.type === 'client') {
                await restoreClient(confirmRestore.id)
                qc.invalidateQueries({ queryKey: ['clients'] })
                qc.invalidateQueries({ queryKey: ['trash-clients'] })
                toast.success('Cliente restaurado')
            } else if (confirmRestore.type === 'company') {
                await restoreCompany(confirmRestore.id)
                qc.invalidateQueries({ queryKey: ['companies'] })
                qc.invalidateQueries({ queryKey: ['trash-companies'] })
                toast.success('Empresa restaurada')
            } else {
                await restoreProduct(confirmRestore.id)
                qc.invalidateQueries({ queryKey: ['products'] })
                qc.invalidateQueries({ queryKey: ['trash-products'] })
                toast.success('Producto restaurado')
            }
            setConfirmRestore(null)
        } catch {
            toast.error('Error al restaurar')
        } finally {
            setIsActing(false)
        }
    }

    async function handleHardDelete() {
        if (!confirmHard) return
        setIsActing(true)
        try {
            if (confirmHard.type === 'client') {
                await hardDeleteClient(confirmHard.id)
                qc.invalidateQueries({ queryKey: ['clients'] })
                qc.invalidateQueries({ queryKey: ['trash-clients'] })
            } else if (confirmHard.type === 'company') {
                await hardDeleteCompany(confirmHard.id)
                qc.invalidateQueries({ queryKey: ['companies'] })
                qc.invalidateQueries({ queryKey: ['trash-companies'] })
            } else {
                await hardDeleteProduct(confirmHard.id)
                qc.invalidateQueries({ queryKey: ['trash-products'] })
            }
            toast.success('Eliminado permanentemente')
            setConfirmHard(null)
        } catch (err: any) {
            toast.error(err.message ?? 'Error al eliminar')
        } finally {
            setIsActing(false)
        }
    }

    function fmtDate(d: any) { return crDateStr(d) }

    function parseCashier(notes: string | null): string | null {
        if (!notes) return null
        const m = notes.match(/Cajero:\s*(.+?)(?:\n|$)/)
        return m ? m[1].trim() : null
    }

    const tabs = [
        { id: 'clients' as const, label: 'Clientes', count: (deletedClients as any[]).length },
        { id: 'companies' as const, label: 'Empresas', count: (deletedCompanies as any[]).length },
        { id: 'products' as const, label: 'Productos', count: (deletedProducts as any[]).length },
        { id: 'sales' as const, label: 'Ventas anuladas', count: (voidedSales as any[]).length },
        { id: 'sinpe' as const, label: 'SINPE', count: sinpeDeleted.length },
    ]

    return (
        <SectionContent icon={Trash2} color="text-red-400" iconBg="bg-red-500/10" title="Papelera" desc="Registros eliminados y ventas anuladas">
            <div className="flex gap-1 p-1 bg-[#0B0E19] rounded-xl border border-[#192030] mb-1">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                            'flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
                            tab === t.id ? 'bg-[#141C2E] text-[#E4ECF7]' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                        )}
                    >
                        {t.label}
                        {t.count > 0 && (
                            <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold', tab === t.id ? 'bg-red-500/20 text-red-400' : 'bg-[#1C2438] text-[#3D506A]')}>
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {tab === 'clients' && (
                <div className="space-y-2">
                    {loadingClients ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">Cargando...</p>
                    ) : (deletedClients as any[]).length === 0 ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">No hay clientes eliminados</p>
                    ) : (deletedClients as any[]).map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#0B0E19] border border-[#192030]">
                            <div>
                                <p className="text-[13px] text-[#E4ECF7] font-medium">{c.name}</p>
                                <p className="text-[11px] text-[#3D506A]">{c.phone || c.email || 'Sin contacto'}</p>
                                {c.updatedAt && <p className="text-[10px] text-[#3D506A]">Eliminado {crDateTime(c.updatedAt)}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setConfirmRestore({ type: 'client', id: c.id, name: c.name })} disabled={isActing} className="flex items-center gap-1 px-3 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] hover:bg-emerald-500/20 transition-all cursor-pointer disabled:opacity-50">
                                    <RotateCcw size={11} /> Restaurar
                                </button>
                                <button onClick={() => setConfirmHard({ type: 'client', id: c.id, name: c.name })} disabled={isActing} className="flex items-center gap-1 px-3 h-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] hover:bg-red-500/20 transition-all cursor-pointer disabled:opacity-50">
                                    <Trash2 size={11} /> Borrar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'companies' && (
                <div className="space-y-2">
                    {loadingCompanies ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">Cargando...</p>
                    ) : (deletedCompanies as any[]).length === 0 ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">No hay empresas eliminadas</p>
                    ) : (deletedCompanies as any[]).map((co: any) => (
                        <div key={co.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#0B0E19] border border-[#192030]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#141C2E] border border-[#1E2A40] flex items-center justify-center shrink-0">
                                    <Building2 size={14} className="text-[#3D506A]" />
                                </div>
                                <div>
                                    <p className="text-[13px] text-[#E4ECF7] font-medium">{co.name}</p>
                                    <p className="text-[11px] text-[#3D506A]">{co.taxId || co.billingEmail || 'Sin cédula jurídica'}</p>
                                    {co.deletedAt && <p className="text-[10px] text-[#3D506A]">Eliminada {crDateTime(co.deletedAt)}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setConfirmRestore({ type: 'company', id: co.id, name: co.name })} disabled={isActing} className="flex items-center gap-1 px-3 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] hover:bg-emerald-500/20 transition-all cursor-pointer disabled:opacity-50">
                                    <RotateCcw size={11} /> Restaurar
                                </button>
                                <button onClick={() => setConfirmHard({ type: 'company', id: co.id, name: co.name })} disabled={isActing} className="flex items-center gap-1 px-3 h-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] hover:bg-red-500/20 transition-all cursor-pointer disabled:opacity-50">
                                    <Trash2 size={11} /> Borrar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'products' && (
                <div className="space-y-2">
                    {loadingProducts ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">Cargando...</p>
                    ) : (deletedProducts as any[]).length === 0 ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">No hay productos eliminados</p>
                    ) : (deletedProducts as any[]).map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#0B0E19] border border-[#192030]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#141C2E] border border-[#1E2A40] flex items-center justify-center shrink-0">
                                    <Package size={14} className="text-[#3D506A]" />
                                </div>
                                <div>
                                    <p className="text-[13px] text-[#E4ECF7] font-medium">{p.name}</p>
                                    <p className="text-[11px] text-[#3D506A]">{p.cat_name || p.category?.name || 'Sin categoría'}</p>
                                    {p.updatedAt && <p className="text-[10px] text-[#3D506A]">Eliminado {crDateTime(p.updatedAt)}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setConfirmRestore({ type: 'product', id: p.id, name: p.name })} disabled={isActing} className="flex items-center gap-1 px-3 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] hover:bg-emerald-500/20 transition-all cursor-pointer disabled:opacity-50">
                                    <RotateCcw size={11} /> Restaurar
                                </button>
                                <button onClick={() => setConfirmHard({ type: 'product', id: p.id, name: p.name })} disabled={isActing} className="flex items-center gap-1 px-3 h-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] hover:bg-red-500/20 transition-all cursor-pointer disabled:opacity-50">
                                    <Trash2 size={11} /> Borrar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'sales' && (
                <div className="space-y-2">
                    {loadingSales ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">Cargando...</p>
                    ) : (voidedSales as any[]).length === 0 ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">No hay ventas anuladas</p>
                    ) : (voidedSales as any[]).map((s: any) => {
                        const isExpanded = expandedSaleId === s.id
                        const cashier = parseCashier(s.notes)
                        return (
                            <div key={s.id} className="rounded-xl bg-[#0B0E19] border border-[#192030] overflow-hidden">
                                <button
                                    onClick={() => setExpandedSaleId(isExpanded ? null : s.id)}
                                    className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-[#141C2E] transition-colors cursor-pointer"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-mono shrink-0">#{s.saleNumber}</span>
                                        <div className="min-w-0">
                                            <p className="text-[12px] text-[#E4ECF7]">{fmtDate(s.date)}</p>
                                            {s.updatedAt && (
                                                <p className="text-[10px] text-[#3D506A]">
                                                    Anulada {crDateTime(s.updatedAt)}{cashier && ` · ${cashier}`}
                                                </p>
                                            )}
                                            {(s.clientName || s.consumerName) && (
                                                <p className="text-[11px] text-[#3D506A] truncate">{s.clientName || s.consumerName}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                        <div className="text-right">
                                            <p className="text-[13px] font-semibold text-[#E4ECF7]">₡{(s.total ?? 0).toLocaleString('es-CR')}</p>
                                            <p className="text-[10px] text-[#3D506A]">{s.paymentMethod}</p>
                                        </div>
                                        <ChevronDown size={14} className={cn('text-[#3D506A] transition-transform duration-150 shrink-0', isExpanded && 'rotate-180')} />
                                    </div>
                                </button>
                                {isExpanded && (
                                    <div className="border-t border-[#192030] px-4 py-2.5 space-y-1.5">
                                        {(s.items ?? []).length === 0 ? (
                                            <p className="text-[11px] text-[#3D506A]">Sin productos registrados</p>
                                        ) : (s.items as any[]).map((item: any) => (
                                            <div key={item.id} className="flex items-center justify-between">
                                                <span className="text-[11px] text-[#7A8FAA]">{item.name} <span className="text-[#3D506A]">× {item.quantity}</span></span>
                                                <span className="text-[11px] text-[#3D506A] font-mono">₡{(item.subtotal ?? 0).toLocaleString('es-CR')}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {tab === 'sinpe' && (
                <div className="space-y-2">
                    {sinpeDeleted.length > 0 && (
                        <div className="flex justify-end mb-1">
                            {pendingClearSinpeTrash ? (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-[#7A8FAA]">¿Vaciar papelera SINPE?</span>
                                    <button onClick={handleSinpeClearTrash} className="h-7 px-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] font-semibold active:bg-red-500/30 cursor-pointer">Confirmar</button>
                                    <button onClick={() => setPendingClearSinpeTrash(false)} className="h-7 px-3 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] text-[11px] cursor-pointer">Cancelar</button>
                                </div>
                            ) : (
                                <button onClick={() => setPendingClearSinpeTrash(true)} className="flex items-center gap-1 h-7 px-3 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] text-[11px] active:text-red-400 cursor-pointer">
                                    <Trash2 size={11} /> Vaciar papelera
                                </button>
                            )}
                        </div>
                    )}
                    {loadingSinpe ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">Cargando...</p>
                    ) : sinpeDeleted.length === 0 ? (
                        <p className="text-[12px] text-[#3D506A] text-center py-8">No hay mensajes SINPE eliminados</p>
                    ) : sinpeDeleted.map((m: any) => (
                        <div key={m.id} className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-[#0B0E19] border border-[#192030]">
                            <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-green-400 truncate">{m.sender || 'Sin remitente'}</p>
                                <p className="text-[11px] text-[#7A8FAA] line-clamp-2 mt-0.5">{m.body}</p>
                                <p className="text-[10px] text-[#3D506A] mt-1">{fmtSinpeDate(m.receivedAt)}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                <button onClick={() => handleSinpeRestore(m.id)} className="flex items-center gap-1 px-3 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] active:bg-emerald-500/20 cursor-pointer">
                                    <RotateCcw size={11} /> Restaurar
                                </button>
                                <button onClick={() => handleSinpeHardDelete(m.id)} className="flex items-center gap-1 px-3 h-7 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] active:bg-red-500/20 cursor-pointer">
                                    <Trash2 size={11} /> Borrar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <DeleteConfirmModal
                isOpen={confirmHard !== null}
                onClose={() => setConfirmHard(null)}
                onConfirm={handleHardDelete}
                title="Eliminar permanentemente"
                description={`¿Eliminar "${confirmHard?.name}" para siempre? Esta acción no se puede deshacer.`}
                confirmLabel="Eliminar para siempre"
                isPending={isActing}
            />
            <DeleteConfirmModal
                isOpen={confirmRestore !== null}
                onClose={() => setConfirmRestore(null)}
                onConfirm={handleRestoreConfirmed}
                title="Restaurar elemento"
                description={`¿Restaurar "${confirmRestore?.name}"? Volverá a estar activo en el sistema.`}
                confirmLabel="Restaurar"
                confirmVariant="success"
                isPending={isActing}
            />
        </SectionContent>
    )
}

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

function TicketPreview({ bizName, bizAddress, bizPhone, ticketHeader, ticketFooter, opts, ticketLogoUrl }: {
    bizName: string; bizAddress: string; bizPhone: string
    ticketHeader: string; ticketFooter: string
    opts: TicketOptions
    ticketLogoUrl?: string
}) {
    const sep = <div className="border-t border-dashed border-gray-300 my-1.5" />
    const sym = opts.currencySymbol === '₡' ? '¢' : (opts.currencySymbol || '₡')
    const fmt = (n: number) => n.toLocaleString('es-CR', {
        minimumFractionDigits: opts.showDecimals ? 2 : 0,
        maximumFractionDigits: opts.showDecimals ? 2 : 0
    })

    return (
        <div className="bg-white text-black font-mono p-4 rounded-lg shadow-xl text-[11px] leading-relaxed border-2 border-gray-100 w-[240px] select-none">
            {ticketLogoUrl && (
                <div className="flex justify-center mb-1.5">
                    <img src={ticketLogoUrl} alt="Logo" className="max-w-[120px] max-h-[60px] object-contain" style={{ imageRendering: 'pixelated' }} />
                </div>
            )}
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
                <span>{sym}{fmt(2500)}</span>
            </div>
            {opts.showUnitPrice && <div className="text-right text-[10px] text-gray-400">{sym}{fmt(2500)} c/u</div>}
            <div className="flex justify-between">
                <span>2x Refresco natural</span>
                <span>{sym}{fmt(800)}</span>
            </div>
            {opts.showUnitPrice && <div className="text-right text-[10px] text-gray-400">{sym}{fmt(400)} c/u</div>}
            {sep}
            <div className="text-right font-bold">TOTAL: {sym}{fmt(3300)}</div>
            <div className="text-[10px]">Pago: EFECTIVO</div>
            {opts.showChange && <div className="text-[10px]">Recibido: {sym}{fmt(5000)}</div>}
            {opts.showChange && <div className="text-[10px]">Vuelto: {sym}{fmt(1700)}</div>}
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

function EmpPrefsRow({ employee }: { employee: Employee }) {
    const { prefs, update } = useEmployeePrefs(employee.id)
    return (
        <div className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-[#0C1420] border border-[#1A2535]">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-[15px] font-black text-violet-300 shrink-0">
                    {employee.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p className="text-[13px] font-semibold text-[#E4ECF7]">{employee.name}</p>
                    <p className="text-[11px] text-[#3D506A]">{employee.role === 'ADMIN' ? 'Administrador' : employee.role === 'TEMPORAL' ? 'Temporal' : 'Cajero'}</p>
                </div>
            </div>
            <div className="flex items-center gap-2.5">
                {prefs.showImagesInGrid
                    ? <Image size={13} className="text-indigo-400" />
                    : <ImageOff size={13} className="text-[#3D506A]" />
                }
                <p className="text-[11px] text-[#3D506A] w-[88px] text-right">
                    {prefs.showImagesInGrid ? 'Con imágenes' : 'Sin imágenes'}
                </p>
                <button
                    onClick={() => update({ showImagesInGrid: !prefs.showImagesInGrid })}
                    className={cn(
                        'relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0',
                        prefs.showImagesInGrid ? 'bg-indigo-500' : 'bg-[#1E2D42]'
                    )}
                >
                    <span className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200',
                        prefs.showImagesInGrid ? 'left-[22px]' : 'left-0.5'
                    )} />
                </button>
            </div>
        </div>
    )
}

function EmpPrefsSection({ employees }: { employees: Employee[] }) {
    const active = employees.filter(e => e.isActive)
    if (active.length === 0) return (
        <p className="text-[12px] text-[#3D506A] text-center py-6">No hay empleados activos</p>
    )
    return (
        <div className="space-y-2">
            <p className="text-[11px] text-[#3D506A] mb-3">
                Activa o desactiva las imágenes en el modo grilla del POS para cada empleado.
            </p>
            {active.map(emp => <EmpPrefsRow key={emp.id} employee={emp} />)}
        </div>
    )
}

function SinpeSettingsSection() {
    const [localIp, setLocalIp] = useState('...')
    const [port, setPort] = useState(3971)
    const [configPort, setConfigPort] = useState('3971')
    const [configFilter, setConfigFilter] = useState('QBien')
    const [savingConfig, setSavingConfig] = useState(false)
    const [showGuide, setShowGuide] = useState(false)

    const kbPort = useKeyboardInput(configPort, setConfigPort, { mode: 'numeric' })
    const kbFilter = useKeyboardInput(configFilter, setConfigFilter, { mode: 'alpha' })

    useEffect(() => {
        window.electronAPI?.getSinpeLocalIp?.().then((ip: string) => setLocalIp(ip))
        window.electronAPI?.getSinpeConfig?.().then((cfg: { port: number; senderFilter: string }) => {
            setPort(cfg.port)
            setConfigPort(String(cfg.port))
            setConfigFilter(cfg.senderFilter)
        })
    }, [])

    async function handleSave() {
        const p = parseInt(configPort)
        if (isNaN(p) || p < 1024 || p > 65535) {
            toast.error('Puerto inválido (1024–65535)')
            return
        }
        setSavingConfig(true)
        const res = await window.electronAPI?.saveSinpeConfig?.({ port: p, senderFilter: configFilter.trim() })
        setSavingConfig(false)
        if (res?.success) {
            setPort(p)
            toast.success('Configuración guardada — servidor reiniciado')
        } else {
            toast.error(res?.error ?? 'Error al guardar')
        }
    }

    function copyText(text: string) {
        navigator.clipboard.writeText(text).then(() => toast.success('Copiado'))
    }

    const localUrl = `http://${localIp}:${port}/sms`

    return (
        <SectionContent
            icon={MessageSquare} color="text-green-400" iconBg="bg-green-500/10"
            title="SINPE Móvil" desc="Servidor HTTP y configuración de reenvío de mensajes"
        >
            {/* Server status */}
            <div className="rounded-2xl bg-[#101520] border border-[#1E2A40] p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <Server size={13} className="text-green-400" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Estado del servidor</span>
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Activo
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-xl bg-[#080B14] border border-[#192030]">
                        <p className="text-[10px] text-[#3D506A] mb-0.5">Puerto local</p>
                        <p className="text-[13px] font-mono text-[#E4ECF7]">{port}</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#080B14] border border-[#192030]">
                        <p className="text-[10px] text-[#3D506A] mb-0.5">IP local</p>
                        <p className="text-[13px] font-mono text-[#E4ECF7]">{localIp}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#080B14] border border-[#192030]">
                    <Wifi size={11} className="text-[#3D506A] shrink-0" />
                    <span className="text-[11px] font-mono text-[#7A8FAA] truncate flex-1">{localUrl}</span>
                    <button
                        onClick={() => copyText(localUrl)}
                        className="shrink-0 text-[#3D506A] active:text-green-400 transition-colors cursor-pointer"
                    >
                        <Copy size={11} />
                    </button>
                </div>
                <p className="text-[10px] text-[#3D506A]">
                    URL para mismo WiFi. Para usar desde cualquier red, configura Cloudflare Tunnel en la guía de abajo.
                </p>
            </div>

            {/* Config */}
            <div className="rounded-2xl bg-[#101520] border border-[#1E2A40] p-4 space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] flex items-center gap-2">
                    <Settings2 size={12} />
                    Configuración
                </p>
                <div className="space-y-1.5">
                    <FieldLabel>Puerto del servidor</FieldLabel>
                    <input {...kbPort} className="w-full h-9 px-3 rounded-xl bg-[#080B14] border border-[#1E2A40] text-[#E4ECF7] text-[13px] outline-none focus:border-green-500/40 font-mono" />
                </div>
                <div className="space-y-1.5">
                    <FieldLabel>Filtro de remitente</FieldLabel>
                    <input {...kbFilter} placeholder="QBien" className="w-full h-9 px-3 rounded-xl bg-[#080B14] border border-[#1E2A40] text-[#E4ECF7] text-[13px] outline-none focus:border-green-500/40" />
                    <p className="text-[10px] text-[#3D506A]">Solo guarda mensajes que contengan este texto en el remitente o cuerpo. Dejar vacío para guardar todos.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={savingConfig}
                    className="w-full h-9 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-[12px] font-semibold active:bg-green-500/20 transition-colors disabled:opacity-50 cursor-pointer"
                >
                    {savingConfig ? 'Guardando...' : 'Guardar y reiniciar servidor'}
                </button>
            </div>

            {/* Setup guide */}
            <div className="rounded-2xl bg-[#101520] border border-[#1E2A40] overflow-hidden">
                <button
                    onClick={() => setShowGuide(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] active:text-[#7A8FAA] transition-colors cursor-pointer"
                >
                    <div className="flex items-center gap-2">
                        <Info size={12} />
                        Guía de configuración completa
                    </div>
                    <ChevronRight size={12} className={cn('transition-transform', showGuide && 'rotate-90')} />
                </button>
                {showGuide && (
                    <div className="px-4 pb-4 space-y-4 border-t border-[#192030] pt-4">
                        <SinpeStepBlock n={1} title="Instalar MacroDroid en el celular">
                            <p className="text-[#7A8FAA] text-[12px]">Descarga <span className="text-[#E4ECF7] font-semibold">MacroDroid</span> (gratis) de ArloSoft en Play Store. Permite automatizar el reenvío de notificaciones al servidor.</p>
                        </SinpeStepBlock>

                        <SinpeStepBlock n={2} title="Instalar Cloudflare Tunnel en la PC">
                            <p className="text-[#7A8FAA] text-[12px] mb-2">Descarga <span className="text-[#E4ECF7]">cloudflared.exe</span> desde:</p>
                            <SinpeCodeBlock text="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" onCopy={copyText} />
                            <p className="text-[#7A8FAA] text-[12px] mt-2">Mueve el archivo a una carpeta fija, ej: <span className="font-mono text-[#E4ECF7]">C:\cloudflared\</span></p>
                        </SinpeStepBlock>

                        <SinpeStepBlock n={3} title="Iniciar el túnel">
                            <p className="text-[#7A8FAA] text-[12px] mb-2">Abre PowerShell y ejecuta:</p>
                            <SinpeCodeBlock text={`C:\\cloudflared\\cloudflared.exe tunnel --url http://localhost:${port}`} onCopy={copyText} />
                            <p className="text-[#7A8FAA] text-[12px] mt-2">Verás una URL pública así:</p>
                            <SinpeCodeBlock text="https://xxxx-xxxx.trycloudflare.com/sms" onCopy={copyText} />
                            <p className="text-[#7A8FAA] text-[12px] mt-1">Copia esa URL — la necesitas en el paso 4.</p>
                        </SinpeStepBlock>

                        <SinpeStepBlock n={4} title="Crear macro en MacroDroid">
                            <div className="space-y-2 text-[12px] text-[#7A8FAA]">
                                <p>En MacroDroid, toca <span className="text-[#E4ECF7]">+ Agregar macro</span> y configura:</p>
                                <div className="space-y-1.5 pl-1">
                                    <p><span className="text-green-400 font-semibold">Trigger:</span> <span className="text-[#E4ECF7]">Notificación recibida</span> → App de Mensajes</p>
                                    <p><span className="text-green-400 font-semibold">Acción:</span> <span className="text-[#E4ECF7]">Solicitud HTTP</span></p>
                                </div>
                                <p className="pt-1">En la acción HTTP pon:</p>
                                <div className="space-y-1.5 p-2.5 rounded-xl bg-[#080B14] border border-[#192030]">
                                    <div className="flex gap-2"><span className="text-[#3D506A] shrink-0 w-16">URL:</span><span className="text-[#E4ECF7] font-mono text-[10px] break-all">{localUrl}</span></div>
                                    <div className="flex gap-2"><span className="text-[#3D506A] shrink-0 w-16">Método:</span><span className="text-[#E4ECF7]">POST</span></div>
                                    <div className="flex gap-2 items-start"><span className="text-[#3D506A] shrink-0 w-16">Cuerpo:</span><span className="text-[#E4ECF7] font-mono text-[10px] break-all">{`{"from":"{titulo de notificacion}","message":"{texto de notificacion}"}`}</span></div>
                                    <div className="flex gap-2"><span className="text-[#3D506A] shrink-0 w-16">Header:</span><span className="text-[#E4ECF7] font-mono text-[10px]">Content-Type: application/json</span></div>
                                </div>
                                <p className="text-[10px] text-[#3D506A] pt-1">Cuando instales Cloudflare Tunnel, cambia la URL por la pública <span className="text-[#7A8FAA]">https://xxxx.trycloudflare.com/sms</span>.</p>
                            </div>
                        </SinpeStepBlock>

                        <SinpeStepBlock n={5} title="Inicio automático del túnel (opcional)">
                            <p className="text-[#7A8FAA] text-[12px]">Para que el túnel inicie con Windows, abre Ejecutar (<span className="text-[#E4ECF7]">Win+R</span>) y escribe:</p>
                            <SinpeCodeBlock text="shell:startup" onCopy={copyText} />
                            <p className="text-[#7A8FAA] text-[12px] mt-1.5">Crea un acceso directo del comando cloudflared en esa carpeta.</p>
                            <p className="text-[#7A8FAA] text-[10px] mt-1.5">Nota: la URL cambia al reiniciar el túnel. Para URL fija permanente, crea cuenta gratuita en <span className="text-[#E4ECF7]">dash.cloudflare.com</span></p>
                        </SinpeStepBlock>
                    </div>
                )}
            </div>
        </SectionContent>
    )
}

function SinpeStepBlock({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                    {n}
                </span>
                <span className="text-[12px] font-semibold text-[#E4ECF7]">{title}</span>
            </div>
            <div className="ml-7">{children}</div>
        </div>
    )
}

function SinpeCodeBlock({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
    return (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[#060810] border border-[#192030]">
            <span className="font-mono text-[10px] text-green-300 break-all flex-1 leading-relaxed">{text}</span>
            <button onClick={() => onCopy(text)} className="shrink-0 text-[#3D506A] active:text-green-400 transition-colors cursor-pointer mt-0.5">
                <Copy size={11} />
            </button>
        </div>
    )
}
