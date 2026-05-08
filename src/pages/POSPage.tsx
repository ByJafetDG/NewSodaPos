import { useState, useCallback, useEffect } from 'react'
import { Search, UserCircle2, ChevronDown } from 'lucide-react'
import { useCartStore } from '@/store/cartStore'
import { useHeldOrdersStore } from '@/store/heldOrdersStore'
import { useKeyboardStore } from '@/store/keyboardStore'
import { useKeyboardInput, useSuppressKeyboard } from '@/hooks/useKeyboardInput'
import { useProducts } from '@/hooks/useProducts'
import { useCategories } from '@/hooks/useCategories'
import { useClients } from '@/hooks/useClients'
import { useEmployees } from '@/hooks/useEmployees'
import { useCreateSale } from '@/hooks/useSales'
import { useActiveRegister } from '@/hooks/useCashRegister'
import { useBusinessConfig } from '@/hooks/useConfig'
import { sendReceiptEmail } from '@/services/emailReceipt'
import { ViewModeBar, type ViewMode } from '@/components/molecules/ViewModeBar'
import { SearchDropdown } from '@/components/molecules/SearchDropdown'
import { ProductCatalog } from '@/components/organisms/pos/ProductCatalog'
import { SegmentedCatalog } from '@/components/organisms/pos/SegmentedCatalog'
import { useSubcategories } from '@/hooks/useSubcategories'
import { CartTable } from '@/components/organisms/pos/CartTable'
import { CartPanel } from '@/components/organisms/pos/CartPanel'
import { PaymentPanel } from '@/components/organisms/pos/PaymentPanel'
import { CashierModal } from '@/components/modals/CashierModal'
import { CreditModal } from '@/components/modals/CreditModal'
import { PriceEditModal } from '@/components/modals/PriceEditModal'
import { SaleSuccessModal, type SaleSuccessData } from '@/components/modals/SaleSuccessModal'
import { HeldOrdersModal } from '@/components/modals/HeldOrdersModal'
import { Spinner } from '@/components/atoms/Spinner'
import { cn, formatCurrency, normalizeStr } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import type { PaymentMethod, Product, Employee, CartItem, HeldOrder } from '@/types'

export function POSPage() {
    // ── Data ────────────────────────────────────────────────────────────────
    const { data: products = [], isLoading } = useProducts()
    const { data: categories = [] } = useCategories()
    const { data: subcategories = [] } = useSubcategories()
    const { data: clients = [] } = useClients()
    const { data: employees = [] } = useEmployees()
    const createSale = useCreateSale()
    const { data: activeRegister } = useActiveRegister()
    const { data: config } = useBusinessConfig()

    // ── Cart ────────────────────────────────────────────────────────────────
    const { items, addItem, removeItem, updateQuantity, clearCart, loadOrder, getSubtotal, getTotal, discount } = useCartStore()
    const { orders: heldOrders, saveOrder: saveHeldOrder, updateOrder: updateHeldOrder, deleteOrder: deleteHeldOrder } = useHeldOrdersStore()
    const subtotal = getSubtotal()
    const total = getTotal()
    const itemCount = items.reduce((s, i) => s + i.quantity, 0)

    // ── View mode ────────────────────────────────────────────────────────────
    const [viewMode, setViewMode] = useState<ViewMode>('scan')
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

    // ── Search (scan mode) ───────────────────────────────────────────────────
    const [search, setSearch] = useState('')
    const suppressKb = useSuppressKeyboard()
    const searchKb = useKeyboardInput(search, setSearch, {
        onEnter: () => handleSearchSubmit(),
        suppressRef: suppressKb,
    })

    // Refocus silently when items are added (barcode scanner flow)
    useEffect(() => {
        if (viewMode === 'scan') {
            suppressKb.current = true
            setTimeout(() => searchKb.ref.current?.focus(), 50)
        }
    }, [items, viewMode])

    // ── Payment ──────────────────────────────────────────────────────────────
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO')
    const [amountReceived, setAmountReceived] = useState(() => localStorage.getItem('pos_amount_received') ?? '')

    useEffect(() => {
        localStorage.setItem('pos_amount_received', amountReceived)
    }, [amountReceived])

    // ── Cashier ──────────────────────────────────────────────────────────────
    const [showCashierModal, setShowCashierModal] = useState(false)
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(() => {
        try { return JSON.parse(localStorage.getItem('pos_cashier_v2') ?? 'null') }
        catch { return null }
    })

    // ── Sale success ──────────────────────────────────────────────────────────
    const [saleSuccess, setSaleSuccess] = useState<SaleSuccessData | null>(null)

    // ── Held orders ──────────────────────────────────────────────────────────
    const [heldOrdersView, setHeldOrdersView] = useState<'choice' | 'save' | null>(null)
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
    const [activeOrderName, setActiveOrderName] = useState<string | null>(null)
    const [mergeSnapshot, setMergeSnapshot] = useState<HeldOrder[] | null>(null)

    // Autosave: cart changes → update linked held order in store
    useEffect(() => {
        if (activeOrderId && items.length > 0) {
            updateHeldOrder(activeOrderId, items, discount)
        }
    }, [items, discount, activeOrderId])

    // ── Modals ───────────────────────────────────────────────────────────────
    const [showCreditModal, setShowCreditModal] = useState(false)
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
    const [editingItem, setEditingItem] = useState<CartItem | null>(null)
    const [editPriceValue, setEditPriceValue] = useState('')

    // ── Derived ───────────────────────────────────────────────────────────────
    const received = parseFloat(amountReceived) || 0
    const canCharge =
        items.length > 0 &&
        !createSale.isPending &&
        (paymentMethod !== 'EFECTIVO' || received >= total)

    // ── Handlers ──────────────────────────────────────────────────────────────
    const tryAddProduct = useCallback((product: Product) => {
        if (!product.isInfinite) {
            const currentQty = items.find(i => i.id === product.id)?.quantity ?? 0
            if (currentQty >= product.stockQty) return
        }
        addItem(product)
        useKeyboardStore.getState().close()
    }, [items, addItem])

    // handleSearchSubmit is also called from the virtual keyboard's onEnter
    const handleSearchSubmit = (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!search.trim()) return
        const product = products.find(p =>
            p.barcode === search.trim() ||
            p.name.toLowerCase().includes(search.toLowerCase())
        )
        if (product) tryAddProduct(product)
        setSearch('')
        useKeyboardStore.getState().close()
    }

    const handleClearCart = () => {
        clearCart()
        setAmountReceived('')
        setActiveOrderId(null)
        setActiveOrderName(null)
        setMergeSnapshot(null)
    }

    const handleSaveHeldOrder = (name: string) => {
        for (const item of items) {
            const product = products.find(p => p.id === item.id)
            if (!product || product.isInfinite) continue
            const committed = heldOrders.reduce((sum, o) => sum + (o.items.find(i => i.id === item.id)?.quantity ?? 0), 0)
            if (committed + item.quantity > product.stockQty) {
                toast.error(`Stock insuficiente para guardar: ${product.name} (disponible: ${product.stockQty - committed})`)
                return
            }
        }
        const actualName = name.trim() || `Cuenta pendiente ${heldOrders.length + 1}`
        saveHeldOrder(actualName, items, discount)
        clearCart()
        setAmountReceived('')
        setActiveOrderId(null)
        setActiveOrderName(null)
        setHeldOrdersView(null)
    }

    const handleNewCustomer = () => {
        setActiveOrderId(null)
        setActiveOrderName(null)
        clearCart()
        setAmountReceived('')
        setHeldOrdersView(null)
    }

    const handleLoadHeldOrder = (order: HeldOrder) => {
        loadOrder(order.items, order.discount)
        setActiveOrderId(order.id)
        setActiveOrderName(order.name)
        setHeldOrdersView(null)
    }

    const handlePaymentMethodChange = (method: PaymentMethod) => {
        setPaymentMethod(method)
        if (method !== 'EFECTIVO') setAmountReceived('')
        if (method === 'CREDITO' && items.length > 0) setShowCreditModal(true)
    }

    const handleCharge = async () => {
        if (paymentMethod === 'CREDITO') { setShowCreditModal(true); return }
        await processSale({ method: paymentMethod })
    }

    const processSale = async ({ isCredit = false, clientId = null as string | null, method = paymentMethod }) => {
        try {
            // Capture before clearCart — closures over Zustand state can become stale after async points
            const saleItems = items
            const saleTotal = total
            const saleSubtotal = subtotal
            const saleDiscount = discount
            const saleReceived = received
            const saleCashier = selectedEmployee?.name ?? null

            const sale = await createSale.mutateAsync({
                items: saleItems, subtotal: saleSubtotal, discount: saleDiscount, total: saleTotal,
                paymentMethod: isCredit ? 'CREDITO' : method,
                amountReceived: method === 'EFECTIVO' && !isCredit ? saleReceived : (isCredit ? null : saleTotal),
                change: method === 'EFECTIVO' && !isCredit ? Math.max(0, saleReceived - saleTotal) : 0,
                isCredit, clientId,
                cashRegisterId: activeRegister?.id ?? null,
                notes: `Cajero: ${saleCashier ?? 'Sin cajero'}`,
            })
            setSaleSuccess({
                total: saleTotal,
                itemCount: saleItems.reduce((s, i) => s + i.quantity, 0),
                items: saleItems.map(i => ({ name: i.product.name, quantity: i.quantity })),
                cashier: saleCashier ?? 'Sin cajero',
                paymentMethod: isCredit ? 'CREDITO' : method,
            })
            if (activeOrderId) deleteHeldOrder(activeOrderId)
            clearCart()
            setAmountReceived('')
            setPaymentMethod('EFECTIVO')
            setSelectedClientId(null)
            setShowCreditModal(false)
            setActiveOrderId(null)
            setActiveOrderName(null)
            setMergeSnapshot(null)
            if (viewMode === 'scan') setTimeout(() => searchKb.ref.current?.focus(), 50)

            const printerPort = config?.printerPort || config?.printerModel || localStorage.getItem('pos_printer_port')

            // --- AUTOMATIC PRINTING — await before drawer to avoid COM port conflict ---
            if (printerPort && window.electronAPI?.printReceipt) {
                const tOpts = (() => { try { return JSON.parse(localStorage.getItem('pos_ticket_options') ?? '{}') } catch { return {} } })()
                await window.electronAPI.printReceipt(printerPort, {
                    businessName: config?.name || 'Soda El Pelón',
                    address: config?.address,
                    phone: config?.phone,
                    header: config?.ticketHeader || null,
                    saleNumber: sale.saleNumber,
                    date: sale.date,
                    cashier: saleCashier,
                    items: saleItems.map(i => ({
                        name: i.product.name,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                        subtotal: i.subtotal,
                    })),
                    total: saleTotal,
                    paymentMethod: isCredit ? 'CREDITO' : method,
                    amountReceived: method === 'EFECTIVO' && !isCredit ? saleReceived : null,
                    change: method === 'EFECTIVO' && !isCredit ? Math.max(0, saleReceived - saleTotal) : 0,
                    footer: config?.ticketFooter || '¡Gracias por su compra!',
                    showCashier: tOpts.showCashier ?? true,
                    showChange: tOpts.showChange ?? true,
                    showHeader: tOpts.showHeader ?? true,
                    showUnitPrice: tOpts.showUnitPrice ?? false,
                    currencySymbol: tOpts.currencySymbol ?? '₡',
                }).catch(err => console.error('[POS] Auto-print error:', err))
            }

            if (isCredit && clientId) {
                const client = clients.find(c => c.id === clientId)
                if (client?.email) {
                    sendReceiptEmail({
                        to: client.email,
                        clientName: client.name,
                        businessName: config?.name ?? 'Mi Soda',
                        saleNumber: sale.saleNumber,
                        date: sale.date,
                        items: saleItems.map(i => ({
                            name: i.product.name,
                            quantity: i.quantity,
                            unitPrice: i.unitPrice,
                            subtotal: i.subtotal,
                        })),
                        subtotal: saleSubtotal, discount: saleDiscount, total: saleTotal,
                    }).then(result => {
                        if (result.success) {
                            toast.success(`Recibo enviado a ${client.email}`)
                        } else if (result.isVerificationError) {
                            toast.error('Dominio de correo no verificado. Configura el dominio en Resend.')
                        } else {
                            toast.error(`Error al enviar recibo: ${result.error}`)
                        }
                    })
                }
            }
        } catch (err) { console.error(err) }
    }

    const handleOpenDrawer = () => {
        const printerPort = config?.printerPort || config?.printerModel || localStorage.getItem('pos_printer_port')
        const drawerEnabled = config?.drawerEnabled ?? true
        if (drawerEnabled && printerPort && window.electronAPI?.openDrawer) {
            window.electronAPI.openDrawer(printerPort)
                .catch((err: any) => console.warn('[Drawer]', err))
        }
    }

    const handleMergeOrders = (ids: string[]) => {
        const toMerge = heldOrders.filter(o => ids.includes(o.id))
        setMergeSnapshot(toMerge)
        const itemMap = new Map<string, CartItem>()
        for (const order of toMerge) {
            for (const item of order.items) {
                const existing = itemMap.get(item.id)
                if (existing) {
                    const newQty = existing.quantity + item.quantity
                    itemMap.set(item.id, { ...existing, quantity: newQty, subtotal: newQty * existing.unitPrice })
                } else {
                    itemMap.set(item.id, { ...item })
                }
            }
        }
        const mergedDiscount = toMerge.reduce((s, o) => s + o.discount, 0)
        loadOrder(Array.from(itemMap.values()), mergedDiscount)
        ids.forEach(id => deleteHeldOrder(id))
        setActiveOrderId(null)
        setActiveOrderName(null)
        setHeldOrdersView(null)
    }

    const handleUndoMerge = () => {
        if (!mergeSnapshot) return
        clearCart()
        setAmountReceived('')
        mergeSnapshot.forEach(order => saveHeldOrder(order.name, order.items, order.discount))
        setMergeSnapshot(null)
        setActiveOrderId(null)
        setActiveOrderName(null)
    }

    const handleConfirmPriceEdit = () => {
        if (editingItem && editPriceValue) {
            const p = parseFloat(editPriceValue)
            if (p > 0) useCartStore.getState().updatePrice(editingItem.id, p)
        }
        setEditingItem(null)
        setEditPriceValue('')
    }

    // ── Segmented grid: subcategories of selected category visible today ─────
    const today = new Date().getDay()
    const visibleSubcats = selectedCategory
        ? subcategories
            .filter(s =>
                s.categoryId === selectedCategory &&
                s.isActive &&
                (!s.showDays || s.showDays.includes(today))
            )
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : []
    const visibleSubcatIdSet = new Set(visibleSubcats.map(s => s.id))
    const useSegmented = viewMode === 'grid' && selectedCategory !== null && visibleSubcats.length > 0

    // ── Active products in grid (filtered by category + search text) ─────────
    const activeProducts = products.filter(p => p.isActive)
    const gridProducts = activeProducts.filter(p => {
        if (!p.isInfinite && p.stockQty <= 0) return false
        if (selectedCategory && p.categoryId !== selectedCategory) return false
        if (useSegmented) {
            const ids = p.subcategoryIds ?? []
            if (ids.length > 0 && !ids.some(id => visibleSubcatIdSet.has(id))) return false
        }
        if (!search) return true
        const q = normalizeStr(search)
        return normalizeStr(p.name).includes(q) ||
            (p.barcode ?? '').includes(search) ||
            normalizeStr(categories.find(c => c.id === p.categoryId)?.name ?? '').includes(q)
    })

    if (isLoading) {
        return <Spinner size={40} label="Cargando productos..." className="h-full" />
    }

    return (
        <div className="flex flex-col h-full">

            {/* ── Top bar ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#192030] shrink-0">
                {/* Search — barcode / product name */}
                <form onSubmit={handleSearchSubmit} className="flex-1 relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A] pointer-events-none z-10" />
                    <input
                        type="text"
                        {...searchKb}
                        placeholder={viewMode === 'scan'
                            ? 'Escanea código de barras o busca por nombre...'
                            : 'Filtrar productos en la grilla...'
                        }
                        className="w-full h-10 pl-10 pr-4 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                    />
                    {/* Autocomplete dropdown — scan mode only */}
                    {viewMode === 'scan' && (
                        <SearchDropdown
                            products={products}
                            categories={categories}
                            search={search}
                            cartItems={items}
                            onSelect={(product) => {
                                tryAddProduct(product)
                                setSearch('')
                            }}
                        />
                    )}
                </form>

                {/* Cashier selector */}
                <button
                    onClick={() => setShowCashierModal(true)}
                    className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer shrink-0',
                        selectedEmployee
                            ? 'bg-orange-500/8 border-orange-500/20 text-orange-400 hover:bg-orange-500/12'
                            : 'bg-[#101520] border-[#1E2A40] text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#161D2E]'
                    )}
                >
                    <UserCircle2 size={16} />
                    <div className="text-left hidden sm:block">
                        <p className="text-[9px] uppercase tracking-widest opacity-60 leading-none">Cajero</p>
                        <p className="text-[12px] font-semibold leading-tight mt-0.5 max-w-[90px] truncate">
                            {selectedEmployee?.name ?? 'Sin cajero'}
                        </p>
                    </div>
                    <ChevronDown size={11} className="opacity-40" />
                </button>
            </div>

            {/* ── View mode bar (scan/grid toggle + category pills) ─────────── */}
            <ViewModeBar
                mode={viewMode}
                onModeChange={(m) => {
                    setViewMode(m)
                    setSearch('')
                    setSelectedCategory(null)
                    // Focus search silently when switching to scan — barcode scanner ready
                    if (m === 'scan') {
                        suppressKb.current = true
                        setTimeout(() => searchKb.ref.current?.focus(), 50)
                    }
                }}
                categories={categories}
                products={activeProducts}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                heldOrdersCount={heldOrders.length}
                onOpenHeldOrders={() => setHeldOrdersView((heldOrders.length === 0 && !mergeSnapshot) ? 'save' : 'choice')}
                activeOrderName={activeOrderName}
            />

            {/* ── Main content ─────────────────────────────────────────────── */}
            <div className="flex flex-1 min-h-0">

                {/* ═══ SCAN MODE: cart table left, payment right ═══ */}
                {viewMode === 'scan' && (
                    <>
                        {/* Left: cart table (full remaining width) */}
                        <div className="flex-1 min-w-0 overflow-hidden border-r border-[#192030]">
                            <CartTable
                                items={items}
                                onIncrease={tryAddProduct}
                                onDecrease={(id) => {
                                    const item = items.find(i => i.id === id)
                                    if (item) updateQuantity(id, item.quantity - 1)
                                }}
                                onRemove={removeItem}
                                onEditPrice={(item) => {
                                    setEditingItem(item)
                                    setEditPriceValue(String(item.unitPrice))
                                }}
                            />
                        </div>

                        {/* Right: payment panel */}
                        <div className="w-[340px] shrink-0 flex flex-col overflow-hidden">
                            <PaymentPanel
                                paymentMethod={paymentMethod}
                                onChangeMethod={handlePaymentMethodChange}
                                amountReceived={amountReceived}
                                onChangeAmount={setAmountReceived}
                                itemCount={itemCount}
                                subtotal={subtotal}
                                discount={discount}
                                total={total}
                                canCharge={canCharge}
                                isPending={createSale.isPending}
                                onCharge={handleCharge}
                                onClear={handleClearCart}
                                hasItems={items.length > 0}
                                onOpenDrawer={handleOpenDrawer}
                            />
                        </div>
                    </>
                )}

                {/* ═══ GRID MODE: product catalog left, cart+payment right ═══ */}
                {viewMode === 'grid' && (
                    <>
                        {/* Left: product catalog (segmented or flat) */}
                        <div className="flex-1 min-w-0 overflow-hidden border-r border-[#192030] flex flex-col">
                            {useSegmented ? (
                                <SegmentedCatalog
                                    products={gridProducts}
                                    subcategories={visibleSubcats}
                                    cartItems={items}
                                    onAddProduct={tryAddProduct}
                                />
                            ) : (
                                <ProductCatalog
                                    products={gridProducts}
                                    categories={categories}
                                    cartItems={items}
                                    selectedCategory={selectedCategory}
                                    onSelectCategory={setSelectedCategory}
                                    onAddProduct={tryAddProduct}
                                    hideCategoryBar
                                />
                            )}
                        </div>

                        {/* Right: cart (fixed height) + payment (remaining) */}
                        <div className="w-[340px] shrink-0 flex flex-col overflow-hidden">
                            {/* Cart — fixed height shows ~4 items */}
                            <div className="h-[200px] shrink-0 border-b border-[#192030] overflow-hidden">
                                <CartPanel
                                    items={items}
                                    onIncrease={tryAddProduct}
                                    onDecrease={(id) => {
                                        const item = items.find(i => i.id === id)
                                        if (item) updateQuantity(id, item.quantity - 1)
                                    }}
                                    onRemove={removeItem}
                                    onClear={handleClearCart}
                                    onEditPrice={(item) => {
                                        setEditingItem(item)
                                        setEditPriceValue(String(item.unitPrice))
                                    }}
                                />
                            </div>

                            {/* Payment — takes remaining space */}
                            <div className="flex-1 min-h-0 overflow-hidden">
                                <PaymentPanel
                                    paymentMethod={paymentMethod}
                                    onChangeMethod={handlePaymentMethodChange}
                                    amountReceived={amountReceived}
                                    onChangeAmount={setAmountReceived}
                                    itemCount={itemCount}
                                    subtotal={subtotal}
                                    discount={discount}
                                    total={total}
                                    canCharge={canCharge}
                                    isPending={createSale.isPending}
                                    onCharge={handleCharge}
                                    onClear={handleClearCart}
                                    hasItems={items.length > 0}
                                    onOpenDrawer={handleOpenDrawer}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Modals ───────────────────────────────────────────────────── */}
            <CashierModal
                isOpen={showCashierModal}
                onClose={() => setShowCashierModal(false)}
                employees={employees}
                selected={selectedEmployee}
                onSelect={(emp) => {
                    setSelectedEmployee(emp)
                    try { localStorage.setItem('pos_cashier_v2', JSON.stringify(emp)) } catch { }
                }}
            />

            <CreditModal
                isOpen={showCreditModal}
                onClose={() => { setShowCreditModal(false); setPaymentMethod('EFECTIVO') }}
                total={total}
                subtotal={subtotal}
                discount={discount}
                itemCount={itemCount}
                clients={clients}
                selectedClientId={selectedClientId}
                onSelectClient={setSelectedClientId}
                onConfirm={() => processSale({ isCredit: true, clientId: selectedClientId })}
                isPending={createSale.isPending}
            />

            <PriceEditModal
                isOpen={editingItem !== null}
                onClose={() => { setEditingItem(null); setEditPriceValue('') }}
                editingId={editingItem?.id ?? null}
                value={editPriceValue}
                onChange={setEditPriceValue}
                onConfirm={handleConfirmPriceEdit}
                items={items}
            />

            <SaleSuccessModal
                data={saleSuccess}
                onClose={() => setSaleSuccess(null)}
            />

            <HeldOrdersModal
                isOpen={heldOrdersView !== null}
                onClose={() => setHeldOrdersView(null)}
                initialView={heldOrdersView ?? 'save'}
                currentItems={items}
                currentDiscount={discount}
                orders={heldOrders}
                hasLinkedAccount={activeOrderId !== null}
                activeOrderId={activeOrderId}
                onSave={handleSaveHeldOrder}
                onNewCustomer={handleNewCustomer}
                onLoad={handleLoadHeldOrder}
                onDelete={(id) => {
                    deleteHeldOrder(id)
                    if (id === activeOrderId) {
                        setActiveOrderId(null)
                        setActiveOrderName(null)
                        clearCart()
                        setAmountReceived('')
                    }
                }}
                onMerge={handleMergeOrders}
                hasMergeSnapshot={mergeSnapshot !== null}
                onUndoMerge={handleUndoMerge}
            />
        </div>
    )
}
