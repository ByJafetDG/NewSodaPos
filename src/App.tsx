import { useEffect } from 'react'
import type React from 'react'
import { sileo, Toaster } from 'sileo'
import { formatCurrency } from '@/lib/utils'
import { AppLayout } from '@/components/layout/AppLayout'
import { useUIStore } from '@/store/uiStore'
import { ToastContainer } from '@/components/ui/Toast'
import { POSPage } from '@/pages/POSPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { BalancesPage } from '@/pages/BalancesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { CashRegisterPage } from '@/pages/CashRegisterPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SorteosPage } from '@/pages/SorteosPage'
import { ReturnsPage } from '@/pages/ReturnsPage'
import { AIAssistantPage } from '@/pages/AIAssistantPage'
import { SinpePage } from '@/pages/SinpePage'
import { StartupCajaModal } from '@/components/modals/StartupCajaModal'
import { SplashScreen } from '@/components/layout/SplashScreen'
import { UpdateModal } from '@/components/modals/UpdateModal'

function PageRenderer() {
    const { currentPage } = useUIStore()
    switch (currentPage) {
        case 'pos':           return <POSPage />
        case 'inventory':     return <InventoryPage />
        case 'balances':      return <BalancesPage />
        case 'reports':       return <ReportsPage />
        case 'cash-register': return <CashRegisterPage />
        case 'sorteos':       return <SorteosPage />
        case 'returns':       return <ReturnsPage />
        case 'settings':      return <SettingsPage />
        case 'ai-assistant':  return <AIAssistantPage />
        case 'sinpe':         return <SinpePage />
        default:              return <POSPage />
    }
}

function parseSinpeAmount(body?: string): string | null {
    if (!body) return null
    const m = body.match(/CRC\s*([\d,\.]+)/i)
        || body.match(/₡\s*([\d\s,\.]+)/)
        || body.match(/recib\S*\s+([\d\s,\.]+)\s*colones/i)
        || body.match(/([\d\s,\.]+)\s*colones/i)
    if (!m) return null
    const raw = m[1].trim()
    let num: number
    // CR format: "5.800,00" → dot=miles, comma=decimal
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
        num = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
    // US format: "5,800.00" → comma=miles, dot=decimal
    } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) {
        num = parseFloat(raw.replace(/,/g, ''))
    } else {
        num = parseFloat(raw.replace(/[,\s]/g, ''))
    }
    if (isNaN(num) || num <= 0) return null
    return formatCurrency(Math.round(num))
}

const SERVICE_SENDERS = /^(QBieN|BNCR|BCR|BAC|Scotiabank|Davivienda|Nacional|Popular|Cathay|Lafise|Promerica|Mutual|Coopeservidores)/i

function parseSinpeSender(msg: any): string | null {
    const body: string = msg?.body ?? ''
    const rawSender: string = msg?.sender ?? ''
    if (body) {
        const m = body.match(/\bde\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{4,}?)(?:\.\s|$|\s+(?:Prueba|Ref|Referencia|Consulte|desde|por\s+monto))/i)
        if (m) return m[1].trim()
        const m2 = body.match(/\bde\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{4,})/i)
        if (m2) {
            const candidate = m2[1].trim().replace(/\s{2,}/g, ' ')
            if (candidate.length <= 50) return candidate
        }
    }
    if (!SERVICE_SENDERS.test(rawSender) && rawSender.length > 1) return rawSender
    return null
}

function buildSinpeDescription(msg: any) {
    const amount = parseSinpeAmount(msg?.body)
    const sender = parseSinpeSender(msg)
    const fallbackSender = msg?.sender && !parseSinpeSender(msg) ? msg.sender : null
    return (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sender ? (
                <div style={{ fontSize: 13, color: '#E4ECF7', fontWeight: 700, lineHeight: 1.2 }}>{sender}</div>
            ) : fallbackSender ? (
                <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 500, lineHeight: 1.2 }}>{fallbackSender}</div>
            ) : null}
            {amount && (
                <div style={{
                    background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: 10, padding: '8px 14px', textAlign: 'center',
                }}>
                    <div style={{ fontSize: 9, color: '#10B981', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Monto recibido</div>
                    <div style={{ fontSize: 22, color: '#10B981', fontWeight: 900, fontFamily: 'monospace', lineHeight: 1, whiteSpace: 'nowrap' }}>{amount}</div>
                </div>
            )}
            {msg?.body && (
                <div style={{
                    fontSize: 10, color: '#4B5563', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                } as React.CSSProperties}>{msg.body}</div>
            )}
        </div>
    )
}

;(window as any).__testSinpe = (sender = 'QBieN', body = 'Ha recibido 15,000.00 colones por BN SINPE MOVIL de JUAN PEREZ. Prueba 3-88517967. Referencia 123456789.') => {
    sileo.action({
        title: 'SINPE recibido',
        description: buildSinpeDescription({ sender, body }),
        position: 'top-left',
        button: { title: 'Ver SINPE', onClick: () => useUIStore.getState().setCurrentPage('sinpe') },
    })
}

;(window as any).__testToasts = {
    cajaAbierta: (amount = 25000) => sileo.success({
        title: 'Caja abierta',
        description: (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.14) 0%, rgba(5,150,105,0.05) 100%)',
                    border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: '12px 14px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px rgba(16,185,129,0.6)', display: 'inline-block' }} />
                        <span style={{ fontSize: 9, color: '#6EE7B7', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Fondo inicial</span>
                    </div>
                    <div style={{ fontSize: 28, color: '#10B981', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>
                        ₡{amount.toLocaleString('es-CR')}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 2 }}>
                    <span style={{ fontSize: 10, color: '#374151' }}>Lista para recibir ventas</span>
                    <span style={{ fontSize: 10, color: '#374151', fontFamily: 'monospace' }}>
                        {new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' })}
                    </span>
                </div>
            </div>
        ),
        position: 'top-right',
    }),
    cajaCerrada: (amount = 87500) => sileo.success({
        title: 'Caja cerrada',
        description: (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.14) 0%, rgba(217,119,6,0.05) 100%)',
                    border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '12px 14px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
                        <span style={{ fontSize: 9, color: '#FCD34D', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Conteo final</span>
                    </div>
                    <div style={{ fontSize: 28, color: '#F59E0B', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>
                        ₡{amount.toLocaleString('es-CR')}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 2 }}>
                    <span style={{ fontSize: 10, color: '#374151' }}>Sesión cerrada correctamente</span>
                    <span style={{ fontSize: 10, color: '#374151', fontFamily: 'monospace' }}>
                        {new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' })}
                    </span>
                </div>
            </div>
        ),
        position: 'top-right',
    }),
    negocioGuardado: (name = 'Soda El Pelón', phone = '8888-8888', address = 'San José, Costa Rica') => sileo.success({
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
                        {name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: '#E4ECF7', fontWeight: 700, lineHeight: 1.2, marginBottom: 3 }}>{name}</div>
                        {(phone || address) && (
                            <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4 }}>
                                {[phone, address].filter(Boolean).join(' · ')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        ),
        position: 'top-right',
    }),
    ticketGuardado: (opts = ['Cajero', 'Cambio', 'Encabezado']) => sileo.success({
        title: 'Ticket guardado',
        description: (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {opts.map((label: string) => (
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
                <div style={{ fontSize: 10, color: '#374151' }}>
                    {opts.length} opción{opts.length !== 1 ? 'es' : ''} activa{opts.length !== 1 ? 's' : ''}
                </div>
            </div>
        ),
        position: 'top-right',
    }),
    sinStock: (name = 'Gallo Pinto') => sileo.warning({
        title: 'Sin stock disponible',
        description: (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#E4ECF7', fontWeight: 600, lineHeight: 1.3 }}>{name}</div>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)',
                    borderRadius: 99, padding: '3px 10px', width: 'fit-content',
                }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
                    <span style={{ fontSize: 10, color: '#FCA5A5', fontWeight: 700 }}>Sin unidades disponibles</span>
                </div>
            </div>
        ),
        position: 'top-right',
    }),
    sinStockPostVenta: (names = ['Gallo Pinto', 'Casado de Pollo', 'Arroz con Leche', 'Sopa del día']) => {
        const shown = names.slice(0, 3)
        const extra = names.length - shown.length
        sileo.warning({
            title: names.length === 1 ? 'Producto agotado' : `${names.length} productos agotados`,
            description: (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {shown.map((name: string) => (
                        <div key={name} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                            padding: '5px 10px', borderRadius: 8,
                            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.14)',
                        }}>
                            <span style={{ fontSize: 11, color: '#CBD5E1', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                            <span style={{
                                fontSize: 9, background: 'rgba(239,68,68,0.18)', color: '#FCA5A5',
                                padding: '2px 8px', borderRadius: 99, fontWeight: 800, letterSpacing: '0.1em',
                                border: '1px solid rgba(239,68,68,0.28)', flexShrink: 0,
                            }}>AGOTADO</span>
                        </div>
                    ))}
                    {extra > 0 && (
                        <div style={{ fontSize: 10, color: '#6B7280', paddingLeft: 4 }}>+{extra} producto{extra > 1 ? 's' : ''} más</div>
                    )}
                </div>
            ),
            position: 'top-right',
        })
    },
    errorImpresora: (msg = 'No se puede conectar al puerto COM3') => sileo.error({
        title: 'Error de impresora',
        description: (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 10, padding: '8px 12px',
                }}>
                    <div style={{ fontSize: 9, color: '#EF4444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Detalles del error</div>
                    <div style={{ fontSize: 11, color: '#FCA5A5', lineHeight: 1.4 }}>{msg}</div>
                </div>
                <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                    Verifica que la impresora esté encendida y conectada por USB
                </div>
            </div>
        ),
        position: 'top-right',
    }),
    sinImpresora: () => sileo.warning({
        title: 'Sin impresora',
        description: (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 10, padding: '9px 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <span style={{ fontSize: 15 }}>🖨️</span>
                    <div style={{ fontSize: 12, color: '#FCD34D', fontWeight: 600, lineHeight: 1.3 }}>No se imprimirá ticket</div>
                </div>
                <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                    No se detecta impresora. Ve a Ajustes → Impresora para configurarla.
                </div>
            </div>
        ),
        position: 'top-right',
    }),
    sinCajon: () => sileo.warning({
        title: 'Cajón no disponible',
        description: (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 10, padding: '9px 12px',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <span style={{ fontSize: 15 }}>🪙</span>
                    <div style={{ fontSize: 12, color: '#FCD34D', fontWeight: 600, lineHeight: 1.3 }}>No se abrirá el cajón</div>
                </div>
                <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                    El cajón requiere una impresora conectada y encendida.
                </div>
            </div>
        ),
        position: 'top-right',
    }),
}

function playNotificationChime() {
    try {
        const ctx = new AudioContext()
        const notes = [880, 1108, 1318] // A5 → C#6 → E6 (acorde A mayor ascendente)
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.value = freq
            const t = ctx.currentTime + i * 0.13
            gain.gain.setValueAtTime(0, t)
            gain.gain.linearRampToValueAtTime(0.25, t + 0.015)
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
            osc.start(t)
            osc.stop(t + 0.45)
        })
        setTimeout(() => ctx.close(), 2000)
    } catch {}
}

export default function App() {
    const { setSinpeUnread, incrementSinpeUnread } = useUIStore()

    useEffect(() => {
        if (!window.electronAPI?.getSinpeUnreadCount) return
        window.electronAPI.getSinpeUnreadCount().then((n: number) => setSinpeUnread(n))
        const unsub = window.electronAPI.onSinpeNewMessage?.((msg: any) => {
            incrementSinpeUnread()
            if (useUIStore.getState().currentPage !== 'sinpe') {
                playNotificationChime()
                sileo.action({
                    title: 'SINPE recibido',
                    description: buildSinpeDescription(msg),
                    position: 'top-left',
                    button: { title: 'Ver SINPE', onClick: () => useUIStore.getState().setCurrentPage('sinpe') },
                })
            }
        })
        return () => { unsub?.() }
    }, [])

    return (
        <>
            <AppLayout>
                <PageRenderer />
            </AppLayout>
            <ToastContainer />
            <Toaster position="top-left" theme="dark" />
            <StartupCajaModal />
            <UpdateModal />
            <SplashScreen />
        </>
    )
}
