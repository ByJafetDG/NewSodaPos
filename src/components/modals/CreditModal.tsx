import { useState, useEffect } from 'react'
import { Search, UserCircle2, Check, X } from 'lucide-react'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import { BaseModal } from './BaseModal'
import { Button } from '@/components/atoms/Button'
import { TotalsPanel } from '@/components/molecules/TotalsPanel'
import { cn, formatCurrency, normalizeStr, fuzzyMatch } from '@/lib/utils'
import type { Client, CartItem } from '@/types'

type CreditMode = 'single' | 'split'
type SplitType = 'total' | 'per-product'

export interface SplitCreditData {
    selectedCartItems: CartItem[]
    clientAssignments: {
        clientId: string
        clientName: string
        products: { productId: string; amount: number }[]
    }[]
}

const TYPE_LABEL: Record<string, string> = {
    TRABAJADOR: 'Trabajador', ASOCIACION: 'Asociación', GENERAL: 'General',
}

interface CreditModalProps {
    isOpen: boolean
    onClose: () => void
    total: number
    subtotal: number
    discount: number
    itemCount: number
    clients: Client[]
    cartItems: CartItem[]
    selectedClientId: string | null
    onSelectClient: (id: string) => void
    onConfirm: () => void
    onSplitConfirm: (data: SplitCreditData) => void
    isPending: boolean
}

export function CreditModal({
    isOpen, onClose, total, subtotal, discount, itemCount,
    clients, cartItems, selectedClientId, onSelectClient, onConfirm, onSplitConfirm, isPending
}: CreditModalProps) {
    // Single mode
    const [search, setSearch] = useState('')
    const searchKb = useKeyboardInput(search, setSearch)

    // Split mode
    const [mode, setMode] = useState<CreditMode>('single')
    const [splitType, setSplitType] = useState<SplitType>('per-product')
    const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
    const [splitClients, setSplitClients] = useState<Client[]>([])
    const [splitSearch, setSplitSearch] = useState('')
    const splitSearchKb = useKeyboardInput(splitSearch, setSplitSearch)
    const [totalAmounts, setTotalAmounts] = useState<Record<string, string>>({})
    const [perProductAmounts, setPerProductAmounts] = useState<Record<string, Record<string, string>>>({})

    useEffect(() => {
        if (!isOpen) {
            setMode('single')
            setSearch('')
            setSplitType('per-product')
            setSelectedProductIds(new Set())
            setSplitClients([])
            setSplitSearch('')
            setTotalAmounts({})
            setPerProductAmounts({})
        }
    }, [isOpen])

    // Single mode derived
    const filtered = clients.filter(c =>
        c.isActive && (!search || normalizeStr(c.name).includes(normalizeStr(search)) || fuzzyMatch(search, c.name))
    )
    const selected = clients.find(c => c.id === selectedClientId)

    // Split mode derived
    const selectedProducts = cartItems.filter(i => selectedProductIds.has(i.id))
    const totalSelectedPrice = selectedProducts.reduce((s, p) => s + p.subtotal, 0)
    const filteredSplitClients = clients.filter(c =>
        c.isActive &&
        !splitClients.find(sc => sc.id === c.id) &&
        splitSearch.length > 0 &&
        (normalizeStr(c.name).includes(normalizeStr(splitSearch)) || fuzzyMatch(splitSearch, c.name))
    )

    const addSplitClient = (client: Client) => {
        setSplitClients(prev => [...prev, client])
        setSplitSearch('')
        useKeyboardStore.getState().close()
    }

    const removeSplitClient = (clientId: string) => {
        setSplitClients(prev => prev.filter(c => c.id !== clientId))
        setTotalAmounts(prev => { const n = { ...prev }; delete n[clientId]; return n })
        setPerProductAmounts(prev => {
            const n = { ...prev }
            Object.keys(n).forEach(pid => { const pc = { ...n[pid] }; delete pc[clientId]; n[pid] = pc })
            return n
        })
    }

    const toggleProduct = (id: string) => {
        setSelectedProductIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // Validation
    const totalModeSum = splitClients.reduce((s, c) => s + (parseFloat(totalAmounts[c.id]) || 0), 0)
    const totalModeDiff = Math.round((totalModeSum - totalSelectedPrice) * 100) / 100

    const getPerProductDiff = (productId: string, productPrice: number) => {
        const sum = splitClients.reduce((s, c) => s + (parseFloat(perProductAmounts[productId]?.[c.id]) || 0), 0)
        return Math.round((sum - productPrice) * 100) / 100
    }

    const splitValid = (() => {
        if (selectedProducts.length === 0 || splitClients.length < 2) return false
        if (splitType === 'total') {
            return totalModeDiff === 0 && splitClients.every(c => (parseFloat(totalAmounts[c.id]) || 0) > 0)
        }
        return selectedProducts.every(p =>
            getPerProductDiff(p.id, p.subtotal) === 0 &&
            splitClients.every(c => (parseFloat(perProductAmounts[p.id]?.[c.id]) || 0) > 0)
        )
    })()

    const handleSplitConfirm = () => {
        if (!splitValid) return
        const clientAssignments = splitClients.map(client => {
            if (splitType === 'total') {
                const clientAmount = parseFloat(totalAmounts[client.id]) || 0
                let remaining = clientAmount
                const products = selectedProducts.map((p, i) => {
                    if (i === selectedProducts.length - 1) return { productId: p.id, amount: remaining }
                    const share = Math.round(clientAmount * (p.subtotal / totalSelectedPrice))
                    remaining -= share
                    return { productId: p.id, amount: share }
                })
                return { clientId: client.id, clientName: client.name, products }
            }
            return {
                clientId: client.id,
                clientName: client.name,
                products: selectedProducts.map(p => ({
                    productId: p.id,
                    amount: parseFloat(perProductAmounts[p.id]?.[client.id]) || 0
                }))
            }
        })
        onSplitConfirm({ selectedCartItems: selectedProducts, clientAssignments })
    }

    const openNumKb = (el: HTMLInputElement, value: string, onChange: (v: string) => void) => {
        useKeyboardStore.getState().open({ mode: 'numeric', value, onChange, inputRef: { current: el } })
    }
    const syncNumKb = (v: string, onChange: (v: string) => void) => {
        onChange(v)
        const kb = useKeyboardStore.getState()
        if (kb.isOpen) kb.syncValue(v)
    }

    const showSplitTypeToggle = selectedProducts.length > 1

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'split' ? 'Crédito dividido' : 'Venta a crédito'}
            description={mode === 'split' ? 'Divide productos entre varias cuentas' : 'Selecciona el cliente'}
            width={mode === 'split' ? 'max-w-2xl' : 'max-w-lg'}
        >
            {/* Mode tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-[#101520] border border-[#192030] mb-4">
                <button
                    onClick={() => setMode('single')}
                    className={cn(
                        'flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all cursor-pointer',
                        mode === 'single' ? 'bg-[#1E2A40] text-[#E4ECF7]' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                    )}
                >
                    Cuenta única
                </button>
                <button
                    onClick={() => setMode('split')}
                    disabled={cartItems.length === 0}
                    className={cn(
                        'flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
                        mode === 'split' ? 'bg-[#1E2A40] text-[#E4ECF7]' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                    )}
                >
                    Dividir entre cuentas
                </button>
            </div>

            {/* ── SINGLE MODE ─────────────────────────────────────────── */}
            {mode === 'single' && (
                <div className="space-y-4">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A]" />
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            {...searchKb}
                            className="w-full h-10 pl-9 pr-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/50"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {filtered.map(client => {
                            const isSelected = selectedClientId === client.id
                            return (
                                <button
                                    key={client.id}
                                    onClick={() => { useKeyboardStore.getState().close(); onSelectClient(client.id) }}
                                    className={cn(
                                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left',
                                        isSelected
                                            ? 'bg-violet-500/10 border-violet-500/30'
                                            : 'bg-[#101520] border-[#192030] hover:bg-[#161D2E]'
                                    )}
                                >
                                    <UserCircle2 size={16} className={isSelected ? 'text-violet-400' : 'text-[#3D506A]'} />
                                    <div className="flex-1 min-w-0">
                                        <p className={cn('text-[13px] font-medium truncate', isSelected ? 'text-[#E4ECF7]' : 'text-[#7A8FAA]')}>{client.name}</p>
                                        <p className="text-[11px] text-[#3D506A]">{TYPE_LABEL[client.type]}{client.notes ? ` · ${client.notes}` : ''}</p>
                                    </div>
                                    {isSelected && <Check size={14} className="text-violet-400 shrink-0" />}
                                </button>
                            )
                        })}
                    </div>

                    <div className="bg-[#101520] rounded-xl border border-[#192030] p-4">
                        <TotalsPanel itemCount={itemCount} subtotal={subtotal} discount={discount} total={total} />
                    </div>

                    <Button
                        variant="primary"
                        size="lg"
                        className="w-full"
                        disabled={!selectedClientId || isPending}
                        loading={isPending}
                        onClick={onConfirm}
                    >
                        {selected ? `Cargar a ${selected.name} — ${formatCurrency(total)}` : 'Selecciona un cliente'}
                    </Button>
                </div>
            )}

            {/* ── SPLIT MODE ──────────────────────────────────────────── */}
            {mode === 'split' && (
                <div className="space-y-4">

                    {/* Products */}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D506A] mb-2">Productos a dividir</p>
                        <div className="space-y-1 max-h-36 overflow-y-auto">
                            {cartItems.map(item => {
                                const isChecked = selectedProductIds.has(item.id)
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => toggleProduct(item.id)}
                                        className={cn(
                                            'w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-all cursor-pointer text-left',
                                            isChecked
                                                ? 'bg-orange-500/8 border-orange-500/25'
                                                : 'bg-[#101520] border-[#192030] hover:bg-[#161D2E]'
                                        )}
                                    >
                                        <div className={cn(
                                            'w-4 h-4 rounded flex items-center justify-center shrink-0 border',
                                            isChecked ? 'bg-orange-500 border-orange-500' : 'border-[#3D506A]'
                                        )}>
                                            {isChecked && <Check size={10} className="text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className={cn('text-[13px] font-medium truncate', isChecked ? 'text-[#E4ECF7]' : 'text-[#7A8FAA]')}>
                                                {item.product.name}
                                            </span>
                                            {item.quantity > 1 && (
                                                <span className="text-[11px] text-[#3D506A] ml-1.5">×{item.quantity}</span>
                                            )}
                                        </div>
                                        <span className={cn('text-[13px] font-mono shrink-0', isChecked ? 'text-orange-400' : 'text-[#3D506A]')}>
                                            {formatCurrency(item.subtotal)}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Split type toggle — only relevant with multiple products */}
                    {showSplitTypeToggle && selectedProducts.length > 1 && (
                        <div className="flex gap-1 p-1 rounded-lg bg-[#101520] border border-[#192030]">
                            <button
                                onClick={() => setSplitType('per-product')}
                                className={cn(
                                    'flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer',
                                    splitType === 'per-product' ? 'bg-[#1E2A40] text-[#E4ECF7]' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                                )}
                            >
                                Por producto
                            </button>
                            <button
                                onClick={() => setSplitType('total')}
                                className={cn(
                                    'flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer',
                                    splitType === 'total' ? 'bg-[#1E2A40] text-[#E4ECF7]' : 'text-[#3D506A] hover:text-[#7A8FAA]'
                                )}
                            >
                                Monto total
                            </button>
                        </div>
                    )}

                    {/* Client search + chips */}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D506A] mb-2">
                            Cuentas ({splitClients.length})
                            {splitClients.length < 2 && (
                                <span className="ml-2 text-orange-400/70 normal-case tracking-normal">mínimo 2</span>
                            )}
                        </p>

                        {/* Chips */}
                        {splitClients.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {splitClients.map(c => (
                                    <div key={c.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/10 border border-violet-500/25">
                                        <span className="text-[12px] text-violet-300">{c.name}</span>
                                        <button onClick={() => removeSplitClient(c.id)} className="text-violet-400/50 hover:text-red-400 transition-colors cursor-pointer">
                                            <X size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Search */}
                        <div className="relative">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A]" />
                            <input
                                type="text"
                                placeholder="Buscar cliente para agregar..."
                                {...splitSearchKb}
                                className="w-full h-9 pl-8 pr-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[12px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/50"
                            />
                        </div>

                        {filteredSplitClients.length > 0 && (
                            <div className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                                {filteredSplitClients.slice(0, 6).map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => addSplitClient(c)}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#101520] border border-[#192030] hover:bg-[#161D2E] text-left cursor-pointer transition-colors"
                                    >
                                        <UserCircle2 size={13} className="text-[#3D506A] shrink-0" />
                                        <span className="flex-1 text-[12px] text-[#7A8FAA] truncate">{c.name}</span>
                                        <span className="text-[10px] text-[#3D506A]">{TYPE_LABEL[c.type]}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Amount inputs — only when products + clients selected */}
                    {selectedProducts.length > 0 && splitClients.length >= 2 && (
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D506A] mb-2">Montos</p>

                            {/* Per-product mode */}
                            {(splitType === 'per-product' || selectedProducts.length === 1) && (
                                <div className="overflow-x-auto">
                                    {/* Header row */}
                                    <div className="flex gap-2 mb-1 min-w-max">
                                        <div className="w-40 shrink-0" />
                                        {splitClients.map(c => (
                                            <div key={c.id} className="w-24 text-center text-[10px] text-[#7A8FAA] font-semibold truncate">{c.name}</div>
                                        ))}
                                        <div className="w-20 text-right text-[10px] text-[#3D506A]">Estado</div>
                                    </div>
                                    {/* Product rows */}
                                    {selectedProducts.map(p => {
                                        const diff = getPerProductDiff(p.id, p.subtotal)
                                        return (
                                            <div key={p.id} className="flex gap-2 items-center mb-2 min-w-max">
                                                <div className="w-40 shrink-0">
                                                    <p className="text-[12px] text-[#7A8FAA] truncate">{p.product.name}</p>
                                                    <p className="text-[10px] text-[#3D506A] font-mono">{formatCurrency(p.subtotal)}</p>
                                                </div>
                                                {splitClients.map(c => {
                                                    const ppVal = perProductAmounts[p.id]?.[c.id] ?? ''
                                                    const ppHandler = (v: string) => setPerProductAmounts(prev => ({ ...prev, [p.id]: { ...prev[p.id], [c.id]: v } }))
                                                    return (
                                                        <input
                                                            key={c.id}
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={ppVal}
                                                            onFocus={e => openNumKb(e.target as HTMLInputElement, ppVal, ppHandler)}
                                                            onChange={e => syncNumKb(e.target.value, ppHandler)}
                                                            placeholder="0"
                                                            className="w-24 h-8 text-center text-[13px] font-mono rounded-lg bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] outline-none focus:border-orange-500/50"
                                                        />
                                                    )
                                                })}
                                                <div className="w-20 text-right text-[11px] font-mono">
                                                    {diff === 0
                                                        ? <span className="text-emerald-400">✓</span>
                                                        : diff > 0
                                                            ? <span className="text-red-400">+{formatCurrency(diff)}</span>
                                                            : <span className="text-orange-400">{formatCurrency(diff)}</span>
                                                    }
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Total mode */}
                            {splitType === 'total' && selectedProducts.length > 1 && (
                                <div className="space-y-2">
                                    {splitClients.map(c => {
                                        const tVal = totalAmounts[c.id] ?? ''
                                        const tHandler = (v: string) => setTotalAmounts(prev => ({ ...prev, [c.id]: v }))
                                        return (
                                            <div key={c.id} className="flex items-center gap-3">
                                                <div className="flex items-center gap-2 w-32 shrink-0">
                                                    <UserCircle2 size={13} className="text-[#3D506A] shrink-0" />
                                                    <span className="text-[12px] text-[#7A8FAA] truncate">{c.name}</span>
                                                </div>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={tVal}
                                                    onFocus={e => openNumKb(e.target as HTMLInputElement, tVal, tHandler)}
                                                    onChange={e => syncNumKb(e.target.value, tHandler)}
                                                    placeholder="₡ 0"
                                                    className="flex-1 h-9 px-3 text-right text-[14px] font-mono rounded-lg bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] outline-none focus:border-orange-500/50"
                                                />
                                            </div>
                                        )
                                    })}
                                    <div className="flex justify-between items-center pt-1 border-t border-[#192030]">
                                        <span className="text-[11px] text-[#3D506A]">
                                            Total: <span className="font-mono text-[#7A8FAA]">{formatCurrency(totalModeSum)}</span>
                                            {' / '}
                                            <span className="font-mono">{formatCurrency(totalSelectedPrice)}</span>
                                        </span>
                                        {totalModeDiff === 0
                                            ? <span className="text-[11px] text-emerald-400">✓ Completo</span>
                                            : totalModeDiff > 0
                                                ? <span className="text-[11px] text-red-400">Sobra {formatCurrency(totalModeDiff)}</span>
                                                : <span className="text-[11px] text-orange-400">Falta {formatCurrency(-totalModeDiff)}</span>
                                        }
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <Button
                        variant="primary"
                        size="lg"
                        className="w-full"
                        disabled={!splitValid || isPending}
                        loading={isPending}
                        onClick={handleSplitConfirm}
                    >
                        {selectedProducts.length === 0
                            ? 'Selecciona productos'
                            : splitClients.length < 2
                                ? 'Agrega al menos 2 cuentas'
                                : !splitValid
                                    ? 'Los montos no cuadran'
                                    : `Cargar a ${splitClients.length} cuentas — ${formatCurrency(totalSelectedPrice)}`
                        }
                    </Button>
                </div>
            )}
        </BaseModal>
    )
}
