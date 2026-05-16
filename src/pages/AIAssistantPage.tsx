import { useState, useRef, useEffect } from 'react'
import {
    Sparkles, Send, X, Check, AlertTriangle, ChevronRight,
    Database, Loader2, Settings2, Eye, EyeOff, User,
    Package, Users, RefreshCw, History, Trash2, MessageSquare, Clock,
} from 'lucide-react'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useBusinessConfig, useUpdateConfig } from '@/hooks/useConfig'
import { useUIStore } from '@/store/uiStore'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────

type DataType = 'products' | 'clients' | 'companies' | 'sales' | 'generic'

interface PendingConfirm {
    toolCallId: string
    sql: string
    params: any[]
    description: string
}

interface DisplayMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    dataResults?: any[]
    dataType?: DataType
    pending?: PendingConfirm
    confirmStatus?: 'confirmed' | 'rejected' | 'expired'
    isError?: boolean
}

interface ConvSummary {
    id: string
    title: string
    updatedAt: string
}

// ─── Groq tools definition ────────────────────────────────────────────────────

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'db_select',
            description: 'Ejecuta una consulta SELECT en la base de datos SQLite para leer datos. Usa LIMIT para grandes tablas.',
            parameters: {
                type: 'object',
                properties: {
                    sql: { type: 'string', description: 'La consulta SELECT a ejecutar' },
                    params: { type: 'array', items: { type: 'string' }, description: 'Parámetros opcionales para la consulta (usa ? en el SQL)' },
                },
                required: ['sql'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'db_write',
            description: 'Propone una operación INSERT, UPDATE o DELETE. El usuario DEBE confirmar antes de que se ejecute. Incluye siempre una descripción clara en español.',
            parameters: {
                type: 'object',
                properties: {
                    sql: { type: 'string', description: 'La consulta INSERT/UPDATE/DELETE' },
                    params: { type: 'array', description: 'Parámetros opcionales' },
                    description: { type: 'string', description: 'Descripción en español de qué cambiará exactamente' },
                },
                required: ['sql', 'description'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'ui_navigate',
            description: 'Navega a una página del sistema. Úsalo cuando el usuario quiera ir a una sección o ver algo en la app.',
            parameters: {
                type: 'object',
                properties: {
                    page: {
                        type: 'string',
                        enum: ['pos', 'inventory', 'balances', 'reports', 'cash-register', 'sorteos', 'returns', 'settings'],
                        description: 'Página destino',
                    },
                    search: {
                        type: 'string',
                        description: 'Texto de búsqueda a pre-cargar (solo funciona en inventory)',
                    },
                },
                required: ['page'],
            },
        },
    },
]

const SYSTEM_PROMPT_TEMPLATE = `Eres Soda AI, analista experto de un POS costarricense. Tienes acceso completo y en tiempo real a la base de datos. Respuestas concretas y analíticas — nunca genéricas ni inventadas.

## RAZONAMIENTO (ejecuta internamente antes de responder)
1. ¿Qué necesita REALMENTE el usuario? (no lo literal, sino el problema de fondo)
2. ¿El concepto que pide EXISTE en el schema real? Si no, dilo de inmediato y ofrece la alternativa más cercana.
3. ¿Qué query devuelve exactamente lo que necesito con el MÍNIMO de filas?
4. ¿Los datos confirman o refutan la hipótesis del usuario?
5. ¿Hay algo más relevante que debería saber aunque no lo preguntó?

## EFICIENCIA EN QUERIES (evita rate limits)
- Usa COUNT/SUM/GROUP BY/HAVING — no traigas filas individuales si un resumen basta
- DUPLICADOS: SELECT LOWER(TRIM(name)) as n, COUNT(*) c, GROUP_CONCAT(id,'|') ids FROM Product GROUP BY n HAVING c>1
- BÚSQUEDAS por nombre: WHERE name LIKE '%palabra%' LIMIT 20 — nunca igualdad exacta
- LIMIT máximo recomendado: 50. Usa 100 solo si es imprescindible.
- Si necesitas explorar: primero COUNT(*), luego detalle de lo relevante.

## ESQUEMA REAL DE LA BASE DE DATOS (leído en tiempo real de sqlite_master):
{{DB_SCHEMA}}

## CONTEXTO DEL NEGOCIO
Soda/restaurante costarricense. Montos en ₡ (Colones CR). Fechas ISO 8601. isActive/isCredit/isInfinite = 0 ó 1.
- Margen = (price-cost)/price*100. Sano: 40-70% comida, 20-40% bebidas/snacks.
- Fiado (crédito) es normal. isInfinite=1 → no controla stock (stockQty=0 es normal).
- CashRegister es una SESIÓN DE CAJA (turno), NO un cajero individual.
- El sistema NO registra qué persona operó cada venta — no hay tabla de usuarios/cajeros/operadores.

## DUPLICADOS vs VARIANTES
✓ DUPLICADO: "Casado Pollo" y "casado pollo" — capitalización distinta del mismo producto
✓ DUPLICADO: mismo nombre exacto, dos IDs distintos
✗ NO DUPLICADO: "FrostyBag de Oreo" vs "FrostyBag de Coco" — distinto sabor
✗ NO DUPLICADO: "Canada Dry 355ml" vs "Canada Dry 600ml" — distinto tamaño

## CAPACIDADES REALES (sé honesto con el usuario)
Puedes hacer:
✓ Consultar y analizar cualquier dato de la DB (db_select)
✓ Modificar datos con confirmación del usuario (db_write)
✓ Navegar a cualquier sección del sistema (ui_navigate): pos, inventory, balances, reports, cash-register, sorteos, returns, settings
✓ En inventory, pre-cargar un filtro de búsqueda al navegar

No puedes hacer:
✗ Agregar productos al carrito del POS — dile al usuario que lo haga manualmente y navégalo al POS
✗ Abrir formularios, hacer clicks, rellenar campos de la interfaz
✗ Crear productos, clientes u órdenes directamente desde UI (solo via DB si corresponde)

Si el usuario pide algo fuera de tus capacidades: explica brevemente qué no puedes hacer, ofrece lo más cercano que SÍ puedes, y si aplica navégalo a la sección correcta.

## COMUNICACIÓN
- Siempre en español. Directo y específico. Usa números concretos.
- Si el concepto NO existe en el schema: dilo inmediatamente. No hagas queries incorrectos. Ofrece la alternativa más cercana que SÍ existe.
- Si el resultado no responde la pregunta: reconócelo y corrígete. No defiendas datos incorrectos.
- Al final de análisis complejos: "💡 También noté: [insight no pedido pero relevante]"
- NUNCA ejecutes db_write sin confirmación del usuario`

function buildSystemPrompt(dbSchema: string): string {
    return SYSTEM_PROMPT_TEMPLATE.replace('{{DB_SCHEMA}}', dbSchema || '(schema cargando...)')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function detectDataType(rows: any[]): DataType {
    if (!rows.length) return 'generic'
    const keys = Object.keys(rows[0])
    if (keys.includes('price') && keys.includes('stockQty')) return 'products'
    if (keys.includes('cedula') || (keys.includes('type') && keys.includes('companyId'))) return 'clients'
    if (keys.includes('billingEmail')) return 'companies'
    if (keys.includes('saleNumber')) return 'sales'
    return 'generic'
}

function isDuplicatesResult(rows: any[]): boolean {
    if (!rows.length) return false
    const keys = Object.keys(rows[0])
    return keys.includes('n') && keys.includes('c') && keys.includes('ids')
}

function makeGreeting(businessName: string): DisplayMessage {
    return {
        id: uid(),
        role: 'assistant',
        content: `¡Hola! Soy el asistente IA de ${businessName}. Tengo acceso completo a tu base de datos y puedo ayudarte con cualquier cosa:\n\n• Detectar productos o clientes duplicados\n• Corregir nombres o datos\n• Analizar ventas y reportes\n• Hacer cualquier cambio que necesites (con tu confirmación)\n\n¿En qué te puedo ayudar?`,
    }
}

function relativeDate(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) return 'Hoy'
    if (diffDays === 1) return 'Ayer'
    if (diffDays < 7) return `Hace ${diffDays} días`
    return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })
}

function expirePending(msgs: DisplayMessage[]): DisplayMessage[] {
    return msgs.map(m =>
        m.pending && !m.confirmStatus
            ? { ...m, confirmStatus: 'expired' as const }
            : m
    )
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function dbLoadConversations(): Promise<ConvSummary[]> {
    return window.electronAPI.dbQuery(
        'SELECT id, title, updatedAt FROM AiConversation ORDER BY updatedAt DESC LIMIT 50'
    )
}

async function dbLoadConversation(id: string): Promise<{ messages: DisplayMessage[]; groqHistory: any[] } | null> {
    const row = await window.electronAPI.dbGet(
        'SELECT messages, groqHistory FROM AiConversation WHERE id = ?', [id]
    )
    if (!row) return null
    try {
        return {
            messages: expirePending(JSON.parse(row.messages)),
            groqHistory: JSON.parse(row.groqHistory),
        }
    } catch { return null }
}

async function dbSaveConversation(
    id: string, title: string, messages: DisplayMessage[], groqHistory: any[]
): Promise<void> {
    const now = new Date().toISOString()
    await window.electronAPI.dbExecute(
        `INSERT INTO AiConversation (id, title, messages, groqHistory, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, messages=excluded.messages, groqHistory=excluded.groqHistory, updatedAt=excluded.updatedAt`,
        [id, title, JSON.stringify(messages), JSON.stringify(groqHistory.slice(-40)), now, now]
    )
}

async function dbDeleteConversation(id: string): Promise<void> {
    await window.electronAPI.dbExecute('DELETE FROM AiConversation WHERE id = ?', [id])
}

// ─── Data result renderers ────────────────────────────────────────────────────

function ProductRows({ rows }: { rows: any[] }) {
    return (
        <div className="space-y-1.5">
            {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0F1623] border border-[#192030]">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Package size={13} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-[#E4ECF7] truncate">{r.name}</p>
                        {r.unit && <p className="text-[10px] text-[#3D506A]">{r.unit}</p>}
                    </div>
                    {r.price != null && (
                        <span className="text-[12px] font-bold text-blue-400 shrink-0">{formatCurrency(r.price)}</span>
                    )}
                    {r.stockQty != null && (
                        <span className="text-[11px] text-[#3D506A] shrink-0">Stock: {r.stockQty}</span>
                    )}
                </div>
            ))}
        </div>
    )
}

function ClientRows({ rows }: { rows: any[] }) {
    const TYPE_COLOR: Record<string, string> = {
        TRABAJADOR: 'text-blue-400 bg-blue-500/10',
        ASOCIACION: 'text-amber-400 bg-amber-500/10',
        GENERAL: 'text-[#7A8FAA] bg-[#1C2438]',
    }
    return (
        <div className="space-y-1.5">
            {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0F1623] border border-[#192030]">
                    <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                        <Users size={13} className="text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-[#E4ECF7] truncate">{r.name}</p>
                        <p className="text-[10px] text-[#3D506A]">{r.phone ?? r.email ?? r.cedula ?? ''}</p>
                    </div>
                    {r.type && (
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', TYPE_COLOR[r.type] ?? TYPE_COLOR.GENERAL)}>
                            {r.type}
                        </span>
                    )}
                </div>
            ))}
        </div>
    )
}

function DuplicatesTable({ rows, onSendMessage, onNavigate }: {
    rows: any[]
    onSendMessage: (text: string) => void
    onNavigate: (name: string) => void
}) {
    return (
        <div className="space-y-2">
            {rows.map((r, i) => {
                const name = String(r.n ?? '')
                const count = Number(r.c) || 0
                const ids = String(r.ids ?? '').split('|').map((s: string) => s.trim()).filter(Boolean)
                return (
                    <div key={i} className="p-3.5 rounded-xl bg-[#080D16] border border-[#1E2A40] space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold text-[#E4ECF7] capitalize leading-tight">{name}</span>
                            <span className={cn(
                                'shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full',
                                count >= 3 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                            )}>
                                {count} registros
                            </span>
                        </div>
                        <p className="text-[10px] text-[#3D506A] font-mono leading-relaxed break-all">
                            {ids.join(' · ')}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onSendMessage(
                                    `Analiza en detalle los ${count} registros duplicados de "${name}" (IDs: ${ids.join(', ')}). Muéstrame sus diferencias: precio, stock, ventas históricas y barcode. Luego recomiéndame cuál conservar y cuál eliminar con tu justificación.`
                                )}
                                className="flex-1 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-semibold hover:bg-indigo-500/20 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <Sparkles size={11} />
                                Analizar y resolver
                            </button>
                            <button
                                onClick={() => onNavigate(name)}
                                className="h-8 px-3 rounded-lg bg-[#1C2438] border border-[#283A56] text-[#7A8FAA] text-[11px] font-semibold hover:text-[#E4ECF7] transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                            >
                                <Package size={11} />
                                Ver →
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function GenericTable({ rows }: { rows: any[] }) {
    if (!rows.length) return <p className="text-[11px] text-[#3D506A] italic">Sin resultados.</p>
    const cols = Object.keys(rows[0])
    return (
        <div className="overflow-x-auto rounded-xl border border-[#192030]">
            <table className="w-full text-[11px]">
                <thead>
                    <tr className="border-b border-[#192030]">
                        {cols.map(c => (
                            <th key={c} className="px-3 py-2 text-left text-[#3D506A] font-semibold uppercase tracking-wider whitespace-nowrap">{c}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                        <tr key={i} className={cn('border-b border-[#192030]', i % 2 === 1 && 'bg-[#0A0F1A]')}>
                            {cols.map(c => (
                                <td key={c} className="px-3 py-2 text-[#E4ECF7] max-w-[200px] truncate">{String(r[c] ?? '')}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {rows.length > 50 && (
                <p className="px-3 py-2 text-[11px] text-[#3D506A]">... y {rows.length - 50} registros más</p>
            )}
        </div>
    )
}

function DataResults({ rows, type, onSendMessage, onNavigate }: {
    rows: any[]
    type: DataType
    onSendMessage?: (text: string) => void
    onNavigate?: (name: string) => void
}) {
    if (!rows.length) return (
        <div className="px-3 py-2 rounded-lg bg-[#0F1623] border border-[#192030] text-[11px] text-[#3D506A]">
            Consulta ejecutada — sin resultados.
        </div>
    )
    const label = `${rows.length} resultado${rows.length !== 1 ? 's' : ''}`
    const dupes = isDuplicatesResult(rows)
    return (
        <div className="space-y-2">
            <p className="text-[10px] text-[#3D506A] uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <Database size={10} />
                {label}
                {dupes && <span className="normal-case text-amber-400">· duplicados detectados</span>}
            </p>
            {dupes && onSendMessage && onNavigate
                ? <DuplicatesTable rows={rows} onSendMessage={onSendMessage} onNavigate={onNavigate} />
                : dupes
                    ? <DuplicatesTable rows={rows} onSendMessage={() => {}} onNavigate={() => {}} />
                    : null
            }
            {!dupes && type === 'products' && <ProductRows rows={rows} />}
            {!dupes && type === 'clients' && <ClientRows rows={rows} />}
            {!dupes && (type === 'generic' || type === 'companies' || type === 'sales') && <GenericTable rows={rows} />}
        </div>
    )
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({ conversations, currentId, onLoad, onDelete, onClose }: {
    conversations: ConvSummary[]
    currentId: string | null
    onLoad: (id: string) => void
    onDelete: (id: string) => void
    onClose: () => void
}) {
    return (
        <div className="absolute inset-0 z-20 flex">
            <div className="w-72 h-full bg-[#080D16] border-r border-[#192030] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#192030] shrink-0">
                    <div className="flex items-center gap-2">
                        <History size={14} className="text-indigo-400" />
                        <span className="text-[14px] font-semibold text-[#E4ECF7]">Historial</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg bg-[#1C2438] border border-[#283A56] text-[#7A8FAA] hover:text-[#E4ECF7] flex items-center justify-center transition-colors cursor-pointer"
                    >
                        <X size={13} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto py-2 min-h-0">
                    {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
                            <MessageSquare size={24} className="text-[#1E2A40]" />
                            <p className="text-[12px] text-[#3D506A]">Sin conversaciones guardadas</p>
                        </div>
                    ) : (
                        <div className="space-y-0.5 px-2">
                            {conversations.map(c => (
                                <div
                                    key={c.id}
                                    onClick={() => onLoad(c.id)}
                                    className={cn(
                                        'flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors',
                                        currentId === c.id
                                            ? 'bg-indigo-500/10 border border-indigo-500/15'
                                            : 'hover:bg-[#0F1623]'
                                    )}
                                >
                                    <MessageSquare size={12} className={cn('shrink-0', currentId === c.id ? 'text-indigo-400' : 'text-[#3D506A]')} />
                                    <div className="flex-1 min-w-0">
                                        <p className={cn('text-[12px] truncate leading-tight', currentId === c.id ? 'text-[#E4ECF7]' : 'text-[#B0BDD0]')}>{c.title}</p>
                                        <p className="text-[10px] text-[#3D506A] mt-0.5">{relativeDate(c.updatedAt)}</p>
                                    </div>
                                    <button
                                        onClick={e => { e.stopPropagation(); onDelete(c.id) }}
                                        className="shrink-0 text-[#3D506A] hover:text-red-400 transition-colors cursor-pointer p-1 rounded"
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex-1 bg-black/50" onClick={onClose} />
        </div>
    )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, onConfirm, onSendMessage, onNavigate }: {
    msg: DisplayMessage
    onConfirm?: (confirmed: boolean) => void
    onSendMessage?: (text: string) => void
    onNavigate?: (name: string) => void
}) {
    const isUser = msg.role === 'user'
    const isExpired = msg.confirmStatus === 'expired'

    return (
        <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
            <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                isUser ? 'bg-[#1C2438]' : 'bg-indigo-500/15 border border-indigo-500/20'
            )}>
                {isUser
                    ? <User size={15} className="text-[#7A8FAA]" />
                    : <Sparkles size={15} className="text-indigo-400" />}
            </div>

            <div className={cn('flex flex-col gap-2 max-w-[80%]', isUser ? 'items-end' : 'items-start')}>
                {msg.content && (
                    <div className={cn(
                        'px-4 py-3 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap',
                        isUser
                            ? 'bg-indigo-500/15 border border-indigo-500/20 text-[#E4ECF7] rounded-tr-sm'
                            : msg.isError
                                ? 'bg-red-500/8 border border-red-500/20 text-red-400 rounded-tl-sm'
                                : 'bg-[#0F1623] border border-[#192030] text-[#E4ECF7] rounded-tl-sm'
                    )}>
                        {msg.content}
                    </div>
                )}

                {msg.dataResults && msg.dataType && (
                    <div className="w-full">
                        <DataResults
                            rows={msg.dataResults}
                            type={msg.dataType}
                            onSendMessage={onSendMessage}
                            onNavigate={onNavigate}
                        />
                    </div>
                )}

                {/* Pending confirmation card */}
                {msg.pending && (
                    <div className={cn(
                        'w-full p-4 rounded-2xl space-y-3 rounded-tl-sm',
                        isExpired
                            ? 'bg-[#0F1623]/60 border border-[#1E2A40]'
                            : 'bg-amber-500/5 border border-amber-500/25'
                    )}>
                        <div className="flex items-center gap-2">
                            {isExpired
                                ? <Clock size={14} className="text-[#3D506A] shrink-0" />
                                : <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                            }
                            <p className={cn('text-[12px] font-semibold', isExpired ? 'text-[#3D506A]' : 'text-amber-400')}>
                                {isExpired ? 'Acción expirada' : 'Acción pendiente de confirmación'}
                            </p>
                        </div>
                        <p className={cn('text-[13px] leading-relaxed', isExpired ? 'text-[#3D506A]' : 'text-[#E4ECF7]')}>
                            {msg.pending.description}
                        </p>
                        {isExpired ? (
                            <p className="text-[11px] text-[#3D506A]">Navegaste a otra página antes de responder. Puedes pedir esta acción de nuevo.</p>
                        ) : (
                            <>
                                <details className="group">
                                    <summary className="text-[10px] text-[#3D506A] cursor-pointer hover:text-[#7A8FAA] flex items-center gap-1 transition-colors">
                                        <ChevronRight size={10} className="group-open:rotate-90 transition-transform" />
                                        Ver SQL
                                    </summary>
                                    <pre className="mt-2 text-[10px] text-[#7A8FAA] bg-[#080D16] rounded-lg p-3 overflow-x-auto font-mono leading-relaxed">{msg.pending.sql}</pre>
                                </details>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onConfirm?.(true)}
                                        className="flex-1 h-9 rounded-xl bg-emerald-500 text-white text-[12px] font-bold hover:bg-emerald-600 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <Check size={13} />
                                        Confirmar
                                    </button>
                                    <button
                                        onClick={() => onConfirm?.(false)}
                                        className="flex-1 h-9 rounded-xl bg-[#1C2438] border border-[#283A56] text-[#7A8FAA] text-[12px] font-semibold hover:text-[#E4ECF7] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <X size={13} />
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Result badge (confirmed / rejected only) */}
                {(msg.confirmStatus === 'confirmed' || msg.confirmStatus === 'rejected') && (
                    <div className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold',
                        msg.confirmStatus === 'confirmed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400'
                    )}>
                        {msg.confirmStatus === 'confirmed' ? <Check size={11} /> : <X size={11} />}
                        {msg.confirmStatus === 'confirmed' ? 'Ejecutado' : 'Cancelado'}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

function SetupScreen() {
    const [key, setKey] = useState('')
    const [show, setShow] = useState(false)
    const updateConfig = useUpdateConfig()
    const keyKb = useKeyboardInput(key, setKey, { mode: 'alpha' })

    async function handleSave() {
        if (!key.trim()) return
        try {
            await updateConfig.mutateAsync({ groqApiKey: key.trim() })
            toast.success('API Key guardada')
        } catch {
            toast.error('Error al guardar')
        }
    }

    return (
        <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Sparkles size={32} className="text-indigo-400" />
            </div>
            <div className="text-center space-y-2">
                <h1 className="text-[22px] font-bold text-[#E4ECF7]">Asistente IA</h1>
                <p className="text-[14px] text-[#7A8FAA] max-w-sm leading-relaxed">
                    Ingresa tu API Key de Groq para activar el agente inteligente. Puedes obtenerla gratis en <span className="text-indigo-400">console.groq.com</span>.
                </p>
            </div>
            <div className="w-full max-w-sm space-y-3">
                <div className="relative">
                    <input
                        {...keyKb}
                        type={show ? 'text' : 'password'}
                        placeholder="gsk_..."
                        className="w-full h-11 px-4 pr-11 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-indigo-500/40 transition-colors font-mono"
                    />
                    <button
                        onClick={() => setShow(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3D506A] hover:text-[#7A8FAA] transition-colors cursor-pointer"
                    >
                        {show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                </div>
                <button
                    onClick={handleSave}
                    disabled={!key.trim() || updateConfig.isPending}
                    className="w-full h-11 rounded-xl bg-indigo-500 text-white text-[13px] font-bold hover:bg-indigo-600 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                    {updateConfig.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    Activar Asistente
                </button>
            </div>
        </div>
    )
}

// ─── Chat interface ───────────────────────────────────────────────────────────

function ChatInterface({ apiKey, businessName }: { apiKey: string; businessName: string }) {
    const { setCurrentPage, setInventorySearch } = useUIStore()
    const initialGreeting = makeGreeting(businessName)

    const [messages, setMessages] = useState<DisplayMessage[]>([initialGreeting])
    const messagesRef = useRef<DisplayMessage[]>([initialGreeting])

    const [inputText, setInputText] = useState('')
    const [isThinking, setIsThinking] = useState(false)
    const [showKeySettings, setShowKeySettings] = useState(false)
    const [newKey, setNewKey] = useState('')
    const [conversations, setConversations] = useState<ConvSummary[]>([])
    const [convId, setConvId] = useState<string | null>(null)
    const [showHistory, setShowHistory] = useState(false)
    const [initLoading, setInitLoading] = useState(true)

    const updateConfig = useUpdateConfig()
    const groqHistoryRef = useRef<any[]>([])
    const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null)
    const activePendingIdRef = useRef<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const convIdRef = useRef<string | null>(null)
    const dbSchemaRef = useRef<string>('(schema cargando...)')

    const inputKb = useKeyboardInput(inputText, setInputText, { mode: 'alpha' })
    const newKeyKb = useKeyboardInput(newKey, setNewKey, { mode: 'alpha' })

    useEffect(() => {
        async function init() {
            try {
                // Load real DB schema from sqlite_master
                const tables = await window.electronAPI.dbQuery(
                    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
                )
                dbSchemaRef.current = tables
                    .filter((t: any) => t.sql)
                    .map((t: any) => t.sql as string)
                    .join(';\n\n') + ';'

                // Restore most recent conversation
                const convs = await dbLoadConversations()
                setConversations(convs)
                if (convs.length > 0) {
                    const loaded = await dbLoadConversation(convs[0].id)
                    if (loaded && loaded.messages.length > 0) {
                        convIdRef.current = convs[0].id
                        setConvId(convs[0].id)
                        messagesRef.current = loaded.messages
                        setMessages(loaded.messages)
                        groqHistoryRef.current = loaded.groqHistory
                    }
                }
            } finally {
                setInitLoading(false)
            }
        }
        init()
    }, [])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    function addMsg(msg: Omit<DisplayMessage, 'id'>) {
        const full = { ...msg, id: uid() }
        const next = [...messagesRef.current, full]
        messagesRef.current = next
        setMessages(next)
        return full.id
    }

    function updateMsg(id: string, patch: Partial<DisplayMessage>) {
        const next = messagesRef.current.map(m => m.id === id ? { ...m, ...patch } : m)
        messagesRef.current = next
        setMessages(next)
    }

    async function autoSave() {
        try {
            if (messagesRef.current.length <= 1) return
            const firstUser = groqHistoryRef.current.find(m => m.role === 'user')
            const title = firstUser ? String(firstUser.content).slice(0, 60) : 'Conversación'
            let sid = convIdRef.current
            if (!sid) {
                sid = uid()
                convIdRef.current = sid
                setConvId(sid)
            }
            await dbSaveConversation(sid, title, messagesRef.current, groqHistoryRef.current)
            const convs = await dbLoadConversations()
            setConversations(convs)
        } catch {}
    }

    async function waitForConfirm(confirm: PendingConfirm): Promise<boolean> {
        return new Promise((resolve) => {
            confirmResolverRef.current = resolve
            const msgId = addMsg({ role: 'assistant', content: '', pending: confirm })
            activePendingIdRef.current = msgId
            // Save immediately so pending message survives navigation
            autoSave().catch(() => {})
        })
    }

    function handleConfirm(confirmed: boolean) {
        const resolver = confirmResolverRef.current
        const msgId = activePendingIdRef.current
        confirmResolverRef.current = null
        activePendingIdRef.current = null
        if (msgId) updateMsg(msgId, { confirmStatus: confirmed ? 'confirmed' : 'rejected' })
        resolver?.(confirmed)
    }

    async function runAgent(userText: string) {
        groqHistoryRef.current.push({ role: 'user', content: userText })
        setIsThinking(true)

        try {
            let iterations = 0
            while (iterations < 12) {
                iterations++

                const MAX_HISTORY = 14
                const result = await window.electronAPI.groqChat({
                    messages: [
                        { role: 'system', content: buildSystemPrompt(dbSchemaRef.current) },
                        ...groqHistoryRef.current.slice(-MAX_HISTORY),
                    ],
                    tools: TOOLS,
                    apiKey,
                })

                if (!result.success) {
                    addMsg({ role: 'assistant', content: `Error al contactar el asistente: ${result.error}`, isError: true })
                    break
                }

                const assistantMsg = result.data.choices[0].message
                groqHistoryRef.current.push(assistantMsg)

                const toolCalls: any[] = assistantMsg.tool_calls ?? []

                if (toolCalls.length === 0) {
                    if (assistantMsg.content) addMsg({ role: 'assistant', content: assistantMsg.content })
                    break
                }

                if (assistantMsg.content) addMsg({ role: 'assistant', content: assistantMsg.content })

                for (const tc of toolCalls) {
                    let args: any = {}
                    try { args = JSON.parse(tc.function.arguments) } catch { args = {} }

                    if (tc.function.name === 'db_select') {
                        let rows: any[] = []
                        let toolResult = ''
                        try {
                            rows = await window.electronAPI.dbQuery(args.sql, args.params ?? [])
                            const dtype = detectDataType(rows)
                            if (rows.length > 0) {
                                addMsg({ role: 'assistant', content: '', dataResults: rows, dataType: dtype })
                                // Save so results survive navigation
                                autoSave().catch(() => {})
                            }
                            const full = JSON.stringify(rows)
                            const MAX_CHARS = 3500
                            toolResult = full.length > MAX_CHARS
                                ? JSON.stringify(rows.slice(0, 40)) + `\n[truncado — total: ${rows.length} filas]`
                                : full
                        } catch (err: any) {
                            toolResult = `ERROR: ${err.message}`
                        }
                        groqHistoryRef.current.push({ role: 'tool', tool_call_id: tc.id, content: toolResult })

                    } else if (tc.function.name === 'db_write') {
                        setIsThinking(false)
                        const confirmed = await waitForConfirm({
                            toolCallId: tc.id,
                            sql: args.sql,
                            params: args.params ?? [],
                            description: args.description,
                        })
                        setIsThinking(true)

                        if (confirmed) {
                            try {
                                await window.electronAPI.dbExecute(args.sql, args.params ?? [])
                                groqHistoryRef.current.push({ role: 'tool', tool_call_id: tc.id, content: 'Ejecutado exitosamente.' })
                            } catch (err: any) {
                                groqHistoryRef.current.push({ role: 'tool', tool_call_id: tc.id, content: `ERROR: ${err.message}` })
                            }
                        } else {
                            groqHistoryRef.current.push({ role: 'tool', tool_call_id: tc.id, content: 'El usuario canceló esta acción.' })
                        }

                    } else if (tc.function.name === 'ui_navigate') {
                        const page = args.page as string
                        const search = args.search as string | undefined
                        if (search && page === 'inventory') setInventorySearch(search)
                        setCurrentPage(page as any)
                        groqHistoryRef.current.push({
                            role: 'tool',
                            tool_call_id: tc.id,
                            content: `Navegado a "${page}"${search ? ` con búsqueda "${search}"` : ''}.`,
                        })
                    }
                }
            }
        } catch (err: any) {
            addMsg({ role: 'assistant', content: `Error inesperado: ${err.message}`, isError: true })
        } finally {
            setIsThinking(false)
            await autoSave()
        }
    }

    async function sendToAgent(text: string) {
        if (isThinking) return
        addMsg({ role: 'user', content: text })
        await runAgent(text)
    }

    async function handleSend() {
        const text = inputText.trim()
        if (!text || isThinking) return
        setInputText('')
        await sendToAgent(text)
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    function handleNewConv() {
        const g = makeGreeting(businessName)
        messagesRef.current = [g]
        setMessages([g])
        groqHistoryRef.current = []
        convIdRef.current = null
        setConvId(null)
        setShowHistory(false)
    }

    async function handleLoadConv(id: string) {
        const loaded = await dbLoadConversation(id)
        if (!loaded) return
        convIdRef.current = id
        setConvId(id)
        messagesRef.current = loaded.messages
        setMessages(loaded.messages)
        groqHistoryRef.current = loaded.groqHistory
        setShowHistory(false)
    }

    async function handleDeleteConv(id: string) {
        await dbDeleteConversation(id)
        const convs = await dbLoadConversations()
        setConversations(convs)
        if (convIdRef.current === id) handleNewConv()
    }

    async function handleSaveKey() {
        if (!newKey.trim()) return
        try {
            await updateConfig.mutateAsync({ groqApiKey: newKey.trim() })
            toast.success('API Key actualizada')
            setShowKeySettings(false)
            setNewKey('')
        } catch { toast.error('Error al guardar') }
    }

    function handleNavigateInventory(name: string) {
        setInventorySearch(name)
        setCurrentPage('inventory')
    }

    if (initLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 size={22} className="text-indigo-400 animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full relative">
            {showHistory && (
                <HistoryPanel
                    conversations={conversations}
                    currentId={convId}
                    onLoad={handleLoadConv}
                    onDelete={handleDeleteConv}
                    onClose={() => setShowHistory(false)}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowHistory(s => !s)}
                        className={cn(
                            'w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer',
                            showHistory
                                ? 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400'
                                : 'bg-[#101828] border-[#1E2A40] text-[#7A8FAA] hover:text-[#E4ECF7]'
                        )}
                    >
                        <History size={15} />
                    </button>
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <Sparkles size={18} className="text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E4ECF7]">Asistente IA</h1>
                        <p className="text-[11px] text-[#3D506A]">Powered by Groq · llama-3.3-70b</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleNewConv}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] text-[12px] hover:text-[#E4ECF7] transition-all cursor-pointer"
                    >
                        <RefreshCw size={13} />
                        Nueva
                    </button>
                    <button
                        onClick={() => setShowKeySettings(s => !s)}
                        className="w-8 h-8 rounded-lg bg-[#101828] border border-[#1E2A40] text-[#7A8FAA] hover:text-[#E4ECF7] flex items-center justify-center transition-all cursor-pointer"
                    >
                        <Settings2 size={14} />
                    </button>
                </div>
            </div>

            {showKeySettings && (
                <div className="px-6 py-3 border-b border-[#192030] bg-[#080D16] shrink-0 flex items-center gap-3">
                    <input
                        {...newKeyKb}
                        type="password"
                        placeholder="Nueva API Key de Groq..."
                        className="flex-1 h-9 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-indigo-500/40 transition-colors font-mono"
                    />
                    <button
                        onClick={handleSaveKey}
                        disabled={!newKey.trim() || updateConfig.isPending}
                        className="px-3 h-9 rounded-xl bg-indigo-500 text-white text-[12px] font-bold hover:bg-indigo-600 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                        Guardar
                    </button>
                    <button
                        onClick={() => { setShowKeySettings(false); setNewKey('') }}
                        className="w-9 h-9 rounded-xl bg-[#1C2438] border border-[#283A56] text-[#7A8FAA] flex items-center justify-center hover:text-[#E4ECF7] transition-colors cursor-pointer"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
                {messages.map(msg => (
                    <MessageBubble
                        key={msg.id}
                        msg={msg}
                        onConfirm={msg.pending && !msg.confirmStatus ? handleConfirm : undefined}
                        onSendMessage={isThinking ? undefined : sendToAgent}
                        onNavigate={handleNavigateInventory}
                    />
                ))}

                {isThinking && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
                            <Sparkles size={15} className="text-indigo-400" />
                        </div>
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[#0F1623] border border-[#192030] flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="px-6 py-4 border-t border-[#192030] shrink-0">
                <div className="flex items-end gap-3">
                    <div className="flex-1 relative">
                        <textarea
                            {...inputKb}
                            onKeyDown={handleKeyDown}
                            placeholder="Escribe lo que necesitas... (Enter para enviar)"
                            rows={1}
                            disabled={isThinking}
                            className="w-full px-4 py-3 rounded-2xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-indigo-500/40 transition-colors resize-none leading-relaxed disabled:opacity-50"
                            style={{ minHeight: '48px', maxHeight: '140px' }}
                        />
                    </div>
                    <button
                        onClick={handleSend}
                        disabled={!inputText.trim() || isThinking}
                        className="w-12 h-12 rounded-2xl bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer flex items-center justify-center shrink-0"
                    >
                        {isThinking
                            ? <Loader2 size={18} className="animate-spin" />
                            : <Send size={18} />}
                    </button>
                </div>
                <p className="text-[10px] text-[#3D506A] mt-2 text-center">
                    El asistente tiene acceso completo a la base de datos. Los cambios requieren tu confirmación.
                </p>
            </div>
        </div>
    )
}

// ─── Page entry ───────────────────────────────────────────────────────────────

export function AIAssistantPage() {
    const { data: config, isLoading } = useBusinessConfig()

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 size={24} className="text-indigo-400 animate-spin" />
            </div>
        )
    }

    if (!config?.groqApiKey) {
        return <SetupScreen />
    }

    return <ChatInterface apiKey={config.groqApiKey} businessName={config.name ?? 'tu negocio'} />
}
