import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    ShoppingCart, Package, Users, Wallet,
    BarChart3, Settings2, Ticket, RotateCcw,
    Wifi, WifiOff, RefreshCw, CloudOff, Sparkles, MessageSquare,
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { cn, formatTime } from '@/lib/utils'
import type { AppPage } from '@/types'
import logo from '@/assets/logo-pospelon.png'

interface NavItem {
    id: AppPage
    label: string
    description: string
    icon: React.ElementType
    color: string
    activeBg: string
    activeBar: string
}

const NAV_ITEMS: NavItem[] = [
    {
        id: 'pos',
        label: 'Vender',
        description: 'Registrar una venta',
        icon: ShoppingCart,
        color: 'text-orange-400',
        activeBg: 'bg-orange-500/10',
        activeBar: 'bg-orange-400',
    },
    {
        id: 'inventory',
        label: 'Productos',
        description: 'Ver y editar inventario',
        icon: Package,
        color: 'text-blue-400',
        activeBg: 'bg-blue-500/10',
        activeBar: 'bg-blue-400',
    },
    {
        id: 'balances',
        label: 'Clientes',
        description: 'Saldos y créditos',
        icon: Users,
        color: 'text-violet-400',
        activeBg: 'bg-violet-500/10',
        activeBar: 'bg-violet-400',
    },
    {
        id: 'cash-register',
        label: 'Caja',
        description: 'Abrir o cerrar caja',
        icon: Wallet,
        color: 'text-emerald-400',
        activeBg: 'bg-emerald-500/10',
        activeBar: 'bg-emerald-400',
    },
    {
        id: 'reports',
        label: 'Reportes',
        description: 'Ver estadísticas de ventas',
        icon: BarChart3,
        color: 'text-cyan-400',
        activeBg: 'bg-cyan-500/10',
        activeBar: 'bg-cyan-400',
    },
    {
        id: 'sorteos',
        label: 'Sorteos',
        description: 'Ruletas y rifas para clientes',
        icon: Ticket,
        color: 'text-amber-400',
        activeBg: 'bg-amber-500/10',
        activeBar: 'bg-amber-400',
    },
    {
        id: 'returns',
        label: 'Devoluciones',
        description: 'Devolver o cambiar productos',
        icon: RotateCcw,
        color: 'text-rose-400',
        activeBg: 'bg-rose-500/10',
        activeBar: 'bg-rose-400',
    },
    {
        id: 'ai-assistant',
        label: 'Asistente IA',
        description: 'Agente inteligente del sistema',
        icon: Sparkles,
        color: 'text-indigo-400',
        activeBg: 'bg-indigo-500/10',
        activeBar: 'bg-indigo-400',
    },
    {
        id: 'sinpe',
        label: 'SINPE',
        description: 'Mensajes de pago SINPE Móvil',
        icon: MessageSquare,
        color: 'text-green-400',
        activeBg: 'bg-green-500/10',
        activeBar: 'bg-green-400',
    },
]

const SETTINGS_ITEM: NavItem = {
    id: 'settings',
    label: 'Ajustes',
    description: 'Configuración del sistema',
    icon: Settings2,
    color: 'text-slate-400',
    activeBg: 'bg-slate-500/10',
    activeBar: 'bg-slate-400',
}

function NavButton({ item, isActive, onClick, badge }: {
    item: NavItem
    isActive: boolean
    onClick: () => void
    badge?: number
}) {
    const Icon = item.icon
    const [showTip, setShowTip] = useState(false)

    return (
        <div className="relative">
            <button
                onClick={onClick}
                onMouseEnter={() => setShowTip(true)}
                onMouseLeave={() => setShowTip(false)}
                className={cn(
                    'relative w-full flex items-center gap-3 px-3 py-3.5 rounded-xl',
                    'transition-all duration-200 cursor-pointer select-none',
                    'group',
                    isActive
                        ? cn(item.activeBg, 'shadow-sm')
                        : 'hover:bg-white/[0.04]'
                )}
            >
                {/* Active left bar */}
                <motion.div
                    initial={false}
                    animate={{ opacity: isActive ? 1 : 0, scaleY: isActive ? 1 : 0.3 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                        'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r-full',
                        item.activeBar
                    )}
                />

                {/* Icon */}
                <div className={cn(
                    'relative flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0',
                    'transition-colors duration-200',
                    isActive
                        ? cn(item.color, item.activeBg)
                        : 'text-[#3D506A] group-hover:text-[#7A8FAA]',
                )}>
                    <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                    {badge != null && badge > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-green-500 text-[9px] font-bold text-white flex items-center justify-center leading-none">
                            {badge > 99 ? '99+' : badge}
                        </span>
                    )}
                </div>

                {/* Label */}
                <div className="flex flex-col items-start min-w-0">
                    <span className={cn(
                        'text-[14px] font-medium leading-tight transition-colors duration-200',
                        isActive ? 'text-[#E4ECF7]' : 'text-[#7A8FAA] group-hover:text-[#B0BDD0]'
                    )}>
                        {item.label}
                    </span>
                </div>
            </button>

            {/* Tooltip on hover (only when not active) */}
            <AnimatePresence>
                {showTip && !isActive && (
                    <motion.div
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 pointer-events-none"
                    >
                        <div className="bg-[#1C2438] border border-[#283A56] text-[#E4ECF7] text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap">
                            {item.description}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export function Sidebar() {
    const { currentPage, setCurrentPage, syncInfo, sinpeUnread } = useUIStore()
    const [time, setTime] = useState(new Date())

    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(t)
    }, [])

    const crNow = new Date(time.getTime() - 6 * 60 * 60 * 1000)
    const crDate = `${String(crNow.getUTCDate()).padStart(2,'0')}/${String(crNow.getUTCMonth()+1).padStart(2,'0')}/${crNow.getUTCFullYear()}`

    return (
        <nav
            className="flex flex-col h-full flex-shrink-0 bg-[#0B0E19] border-r border-[#192030]"
            style={{ width: 'var(--sidebar-w)' }}
        >
            {/* ── Logo ─────────────────────────────────── */}
            {/* safe-edge from top and left */}
            <div className="px-4 pt-[18px] pb-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                        <img src={logo} alt="Logo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <p className="text-[13px] font-semibold text-[#E4ECF7] leading-tight">Soda POS</p>
                        <p className="text-[11px] text-[#3D506A] leading-tight">v{__APP_VERSION__}</p>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="mx-4 h-px bg-[#192030] mb-2" />

            {/* ── Main nav ─────────────────────────────── */}
            <div className="flex flex-col gap-0.5 px-3 flex-1">
                {NAV_ITEMS.map((item) => (
                    <NavButton
                        key={item.id}
                        item={item}
                        isActive={currentPage === item.id}
                        onClick={() => setCurrentPage(item.id)}
                        badge={item.id === 'sinpe' ? sinpeUnread : undefined}
                    />
                ))}
            </div>

            {/* ── Settings (bottom) ────────────────────── */}
            <div className="px-3 mb-3">
                <div className="h-px bg-[#192030] mb-2" />
                <NavButton
                    item={SETTINGS_ITEM}
                    isActive={currentPage === 'settings'}
                    onClick={() => setCurrentPage('settings')}
                />
            </div>

            {/* ── Status footer ────────────────────────── */}
            {/* safe-edge from bottom */}
            <div className="px-4 pb-[18px]">
                <div className="bg-[#101520] border border-[#192030] rounded-xl px-3 py-2.5 space-y-2">
                    {/* Connection */}
                    <div className="flex items-center justify-between">
                        <div className={cn(
                            'flex items-center gap-1.5 text-[11px] font-medium',
                            syncInfo.isOnline ? 'text-emerald-400' : 'text-red-400'
                        )}>
                            {syncInfo.isOnline
                                ? <Wifi size={12} />
                                : <WifiOff size={12} />
                            }
                            {syncInfo.isOnline ? crDate : 'Sin conexión'}
                        </div>

                        {/* Sync badge */}
                        {syncInfo.isSyncing ? (
                            <div className="flex items-center gap-1 text-[11px] text-[#7A8FAA]">
                                <RefreshCw size={11} className="animate-spin" />
                                <span>Sync...</span>
                            </div>
                        ) : syncInfo.pendingCount > 0 ? (
                            <div className="flex items-center gap-1 text-[11px] text-amber-400">
                                <CloudOff size={11} />
                                <span>{syncInfo.pendingCount}</span>
                            </div>
                        ) : null}
                    </div>

                    {/* Time */}
                    <div className="text-[12px] font-semibold text-[#7A8FAA] tabular-nums">
                        {formatTime(time)}
                    </div>
                </div>
            </div>
        </nav>
    )
}
