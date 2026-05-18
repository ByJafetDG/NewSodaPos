import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageSquare, Check, CheckCheck, Trash2, Search, X, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/uiStore'
import { toast } from '@/components/ui/Toast'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'

const PAGE_SIZE = 15

interface SinpeMsg {
    id: string
    sender: string
    body: string
    receivedAt: string
    isRead: number
}

function formatRelative(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    const hrs = Math.floor(mins / 60)
    const days = Math.floor(hrs / 24)
    if (mins < 1) return 'ahora'
    if (mins < 60) return `hace ${mins}m`
    if (hrs < 24) return `hace ${hrs}h`
    if (days === 1) return 'ayer'
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', timeZone: 'America/Costa_Rica' })
}

function formatFull(iso: string): string {
    return new Date(iso).toLocaleString('es-CR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'America/Costa_Rica',
    })
}

export function SinpePage() {
    const { setSinpeUnread } = useUIStore()
    const [messages, setMessages] = useState<SinpeMsg[]>([])
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('')
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
    const [pendingClearAll, setPendingClearAll] = useState(false)
    const sentinelRef = useRef<HTMLDivElement>(null)

    const kbFilter = useKeyboardInput(filter, setFilter, { mode: 'alpha' })

    const fetchMessages = useCallback(async () => {
        if (!window.electronAPI) return
        const fn = window.electronAPI.refreshSinpeMessages ?? window.electronAPI.getSinpeMessages
        const msgs = await fn()
        setMessages(msgs as SinpeMsg[])
        setLoading(false)
    }, [])

    useEffect(() => {
        fetchMessages()
        const unsubNew = window.electronAPI?.onSinpeNewMessage?.((msg: SinpeMsg) => {
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [msg, ...prev])
        })
        const unsubDb = window.electronAPI?.onDbChanged?.((data) => {
            if (data.table !== 'SinpeMessage') return
            window.electronAPI?.getSinpeMessages?.().then(msgs => {
                setMessages(msgs as SinpeMsg[])
            })
        })
        return () => { unsubNew?.(); unsubDb?.() }
    }, [])

    useEffect(() => {
        if (!loading) {
            const unread = messages.filter(m => !m.isRead).length
            setSinpeUnread(unread)
        }
    }, [messages, loading])

    // Infinite scroll: load more when sentinel enters viewport
    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel) return
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(v => v + PAGE_SIZE)
                }
            },
            { threshold: 0.1 }
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [])

    // Reset visible count when filter changes
    useEffect(() => {
        setVisibleCount(PAGE_SIZE)
    }, [filter])

    async function handleMarkAllRead() {
        await window.electronAPI?.markAllSinpeRead?.()
        setMessages(prev => prev.map(m => ({ ...m, isRead: 1 })))
        setSinpeUnread(0)
    }

    async function handleMarkRead(id: string) {
        await window.electronAPI?.markSinpeRead?.(id)
        setMessages(prev => prev.map(m => m.id === id ? { ...m, isRead: 1 } : m))
    }

    async function handleDeleteOne(id: string) {
        await window.electronAPI?.deleteSinpeMessage?.(id)
        setMessages(prev => prev.filter(m => m.id !== id))
        setPendingDeleteId(null)
    }

    async function handleClearAll() {
        await window.electronAPI?.clearSinpeMessages?.()
        setMessages([])
        setSinpeUnread(0)
    }

    const q = filter.trim().toLowerCase()
    const filtered = q
        ? messages.filter(m =>
            m.sender.toLowerCase().includes(q) ||
            m.body.toLowerCase().includes(q)
        )
        : messages

    const visible = filtered.slice(0, visibleCount)
    const hasMore = visibleCount < filtered.length
    const unreadCount = messages.filter(m => !m.isRead).length

    return (
        <div className="flex flex-col h-full bg-[#080B14] text-[#E4ECF7]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
                        <MessageSquare size={18} className="text-green-400" />
                    </div>
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E4ECF7]">SINPE Móvil</h1>
                        <p className="text-[11px] text-[#3D506A]">Mensajes recibidos de pago</p>
                    </div>
                    {unreadCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[11px] font-semibold">
                            {unreadCount} sin leer
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchMessages}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] text-[12px] active:text-[#E4ECF7] transition-colors cursor-pointer"
                    >
                        <RefreshCw size={12} />
                        Actualizar
                    </button>
                    {unreadCount > 0 && (
                        <button
                            onClick={handleMarkAllRead}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] text-[12px] active:text-green-400 transition-colors cursor-pointer"
                        >
                            <CheckCheck size={12} />
                            Marcar todo leído
                        </button>
                    )}
                    {messages.length > 0 && (
                        pendingClearAll ? (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-[#7A8FAA]">¿Borrar todo?</span>
                                <button
                                    onClick={() => { handleClearAll(); setPendingClearAll(false) }}
                                    className="h-8 px-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[12px] font-semibold active:bg-red-500/30 cursor-pointer"
                                >
                                    Confirmar
                                </button>
                                <button
                                    onClick={() => setPendingClearAll(false)}
                                    className="h-8 px-3 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] text-[12px] active:text-[#E4ECF7] cursor-pointer"
                                >
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setPendingClearAll(true)}
                                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#101520] border border-[#1E2A40] text-[#7A8FAA] text-[12px] active:text-red-400 transition-colors cursor-pointer"
                            >
                                <Trash2 size={12} />
                                Limpiar todo
                            </button>
                        )
                    )}
                </div>
            </div>

            {/* Search bar */}
            <div className="px-6 py-3 border-b border-[#192030] shrink-0">
                <div className="relative max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none" />
                    <input
                        {...kbFilter}
                        placeholder="Filtrar por nombre o número de referencia..."
                        className="w-full h-9 pl-9 pr-8 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] outline-none focus:border-green-500/40 placeholder-[#3D506A]"
                    />
                    {filter && (
                        <button
                            onClick={() => setFilter('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3D506A] active:text-[#7A8FAA] cursor-pointer"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
                {q && (
                    <p className="text-[10px] text-[#3D506A] mt-1.5">
                        {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para &ldquo;{q}&rdquo;
                    </p>
                )}
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-40 text-[#3D506A] text-[13px]">
                        Cargando...
                    </div>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-[#3D506A] gap-3">
                        <MessageSquare size={36} className="opacity-20" />
                        <p className="text-[13px]">
                            {q ? 'Sin resultados para ese filtro' : 'Sin mensajes aún'}
                        </p>
                        {!q && (
                            <p className="text-[11px] text-center max-w-xs text-[#3D506A]">
                                Los mensajes SINPE aparecerán aquí cuando lleguen al celular del negocio
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="p-6 space-y-2 max-w-3xl">
                        {visible.map(msg => (
                            <MsgCard
                                key={msg.id}
                                msg={msg}
                                pending={pendingDeleteId === msg.id}
                                onRead={() => handleMarkRead(msg.id)}
                                onDelete={() => handleDeleteOne(msg.id)}
                                onPendingDelete={() => setPendingDeleteId(msg.id)}
                                onCancelDelete={() => setPendingDeleteId(null)}
                            />
                        ))}

                        {/* Infinite scroll sentinel */}
                        {hasMore && (
                            <div ref={sentinelRef} className="flex items-center justify-center py-4">
                                <span className="text-[11px] text-[#3D506A]">Cargando más...</span>
                            </div>
                        )}

                        {!hasMore && filtered.length > PAGE_SIZE && (
                            <p className="text-center text-[11px] text-[#3D506A] py-4">
                                Mostrando todos los {filtered.length} mensajes
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

function MsgCard({ msg, pending, onRead, onDelete, onPendingDelete, onCancelDelete }: {
    msg: SinpeMsg
    pending: boolean
    onRead: () => void
    onDelete: () => void
    onPendingDelete: () => void
    onCancelDelete: () => void
}) {
    return (
        <button
            onClick={onRead}
            className={cn(
                'w-full text-left p-4 rounded-xl border transition-all cursor-pointer',
                msg.isRead
                    ? 'bg-[#0D1118] border-[#192030]'
                    : 'bg-green-500/5 border-green-500/30'
            )}
        >
            <div className="flex items-start gap-3">
                <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                    msg.isRead ? 'bg-[#161D2E]' : 'bg-green-500/15'
                )}>
                    {msg.isRead
                        ? <Check size={13} className="text-[#3D506A]" />
                        : <MessageSquare size={13} className="text-green-400" />
                    }
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={cn(
                            'text-[12px] font-semibold',
                            msg.isRead ? 'text-[#7A8FAA]' : 'text-green-400'
                        )}>
                            {msg.sender || 'Sin remitente'}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-[#3D506A]" title={formatFull(msg.receivedAt)}>
                                {formatRelative(msg.receivedAt)}
                            </span>
                            {!msg.isRead && (
                                <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                            )}
                            {pending ? (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={onDelete}
                                        className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 text-[10px] font-semibold cursor-pointer active:bg-red-500/30"
                                    >
                                        Eliminar
                                    </button>
                                    <button
                                        onClick={onCancelDelete}
                                        className="px-2 py-0.5 rounded-md bg-[#1E2A40] text-[#7A8FAA] text-[10px] cursor-pointer active:bg-[#263650]"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={e => { e.stopPropagation(); onPendingDelete() }}
                                    className="text-[#3D506A] active:text-red-400 cursor-pointer p-0.5"
                                >
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </div>
                    </div>
                    <p className={cn(
                        'text-[13px] leading-relaxed whitespace-pre-wrap break-words',
                        msg.isRead ? 'text-[#7A8FAA]' : 'text-[#E4ECF7]'
                    )}>
                        {msg.body}
                    </p>
                    <p className="text-[10px] text-[#3D506A] mt-1.5">{formatFull(msg.receivedAt)}</p>
                </div>
            </div>
        </button>
    )
}
