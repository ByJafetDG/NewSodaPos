import { useState, useCallback, useEffect } from 'react'
import { sileo } from 'sileo'
import { useCartStore } from '@/store/cartStore'
import { useHeldOrdersStore } from '@/store/heldOrdersStore'
import { useKeyboardStore } from '@/store/keyboardStore'
import { usePendingSettleStore } from '@/store/pendingSettleStore'
import { usePendingSaleLoadStore } from '@/store/pendingSaleLoadStore'
import { useKeyboardInput, useSuppressKeyboard } from '@/hooks/useKeyboardInput'
import { useProducts, useCreateProduct, useUpdateProduct } from '@/hooks/useProducts'
import { useCategories } from '@/hooks/useCategories'
import { useClients, useCreateClient, useUpdateClient, useCompanies } from '@/hooks/useClients'
import { useEmployees } from '@/hooks/useEmployees'
import { useCreateSale } from '@/hooks/useSales'
import { usePOSSorteo } from '@/hooks/usePOSSorteo'
import { usePOSScanModals } from '@/hooks/usePOSScanModals'
import { useCashierSelection } from '@/hooks/useCashierSelection'
import { getEmployeePrefs } from '@/hooks/useEmployeePrefs'
import { useBusinessConfig } from '@/hooks/useConfig'
import { ModifyingSaleBanner } from '@/components/molecules/ModifyingSaleBanner'
import { POSTopBar } from '@/components/organisms/pos/POSTopBar'
import { POSSorteoModals } from '@/components/organisms/pos/POSSorteoModals'
import { MixedPaymentModal } from '@/components/modals/MixedPaymentModal'
import { usePOSCheckout } from '@/hooks/usePOSCheckout'
import { usePOSSale } from '@/hooks/usePOSSale'
import { ViewModeBar, type ViewMode } from '@/components/molecules/ViewModeBar'
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
import { ScanNotFoundModal } from '@/components/modals/ScanNotFoundModal'
import { ScanBufferModal } from '@/components/modals/ScanBufferModal'
import { QuickStockModal } from '@/components/modals/QuickStockModal'
import { ProductFormModal } from '@/components/modals/ProductFormModal'
import { InvoiceNameModal } from '@/components/modals/InvoiceNameModal'
import { Spinner } from '@/components/atoms/Spinner'
import { normalizeStr, fuzzyMatch } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import type { PaymentMethod, Product, Employee, CartItem, HeldOrder } from '@/types'

export function POSPage() {
    // ── Data ────────────────────────────────────────────────────────────────
    const { data: products = [], isLoading } = useProducts()
    const { data: categories = [] } = useCategories()
    const { data: subcategories = [] } = useSubcategories()
    const { data: clients = [] } = useClients()
    const { data: companies = [] } = useCompanies()
    const { data: employees = [] } = useEmployees()
    const createSale = useCreateSale()
    const createProduct = useCreateProduct()
    const updateProduct = useUpdateProduct()
    const { data: config } = useBusinessConfig()
    const createClient = useCreateClient()
    const updateClient = useUpdateClient()

    // ── Cart ────────────────────────────────────────────────────────────────
    const { items, addItem, removeItem, removeItems, updateQuantity, clearCart, loadOrder, getSubtotal, getTotal, discount, invoiceClient, setInvoiceClient } = useCartStore()
    const { orders: heldOrders, saveOrder: saveHeldOrder, updateOrder: updateHeldOrder, renameOrder: renameHeldOrder, deleteOrder: deleteHeldOrder } = useHeldOrdersStore()
    const subtotal = getSubtotal()
    const total = getTotal()
    const itemCount = items.reduce((s, i) => s + i.quantity, 0)

    function handleRemoveItem(id: string) {
        const item = items.find(i => i.id === id)
        removeItem(id)
        if (!item) return
        const name = item.product?.name ?? 'Producto'
        const qty = item.quantity
        const price = item.unitPrice
        sileo.error({
            title: 'Quitado del carrito',
            description: (
                <div style={{ marginTop: 8 }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.13) 0%, rgba(239,68,68,0.04) 100%)',
                        border: '1px solid rgba(239,68,68,0.24)',
                        borderRadius: 10,
                        padding: '11px 14px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <span style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: '#EF4444',
                                boxShadow: '0 0 7px 2px rgba(239,68,68,0.6)',
                                display: 'inline-block', flexShrink: 0,
                            }} />
                            <span style={{ fontSize: 9, color: '#EF4444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>PRODUCTO ELIMINADO</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#E4ECF7', fontWeight: 600, lineHeight: 1.3, marginBottom: 6 }}>{name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, color: '#7A8FAA' }}>
                                {qty > 1 ? `${qty} unidades` : '1 unidad'}
                            </span>
                            <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>
                                −₡{(qty * price).toLocaleString('es-CR')}
                            </span>
                        </div>
                    </div>
                </div>
            ),
            position: 'top-left',
        })
    }

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
    // (state managed by usePOSCheckout — see below after pendingDebt)

    // ── Cashier ──────────────────────────────────────────────────────────────
    const { showCashierModal, setShowCashierModal, selectedEmployee, selectEmployee } = useCashierSelection()
    const forceNoImage = selectedEmployee ? !getEmployeePrefs(selectedEmployee.id).showImagesInGrid : false

    // ── Sale success ──────────────────────────────────────────────────────────
    const [saleSuccess, setSaleSuccess] = useState<SaleSuccessData | null>(null)

    // ── Held orders ──────────────────────────────────────────────────────────
    const [heldOrdersView, setHeldOrdersView] = useState<'choice' | 'save' | null>(null)
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
    const [activeOrderName, setActiveOrderName] = useState<string | null>(null)
    const [mergeSnapshot, setMergeSnapshot] = useState<HeldOrder[] | null>(null)
    const [autoSavedFusionId, setAutoSavedFusionId] = useState<string | null>(null)
    const [showInvoiceModal, setShowInvoiceModal] = useState(false)

    // Autosave: cart changes → update linked held order in store
    useEffect(() => {
        if (activeOrderId) {
            if (items.length > 0) {
                const debtSnapshot = pendingDebt.hasDebt
                    ? { clientId: pendingDebt.clientId, clientName: pendingDebt.clientName, saleIds: pendingDebt.saleIds, debtTotal: pendingDebt.debtTotal, sales: pendingDebt.sales }
                    : undefined
                updateHeldOrder(activeOrderId, items, discount, debtSnapshot, invoiceClient)
            } else {
                // All items removed manually — delete the now-empty held order
                deleteHeldOrder(activeOrderId)
                setActiveOrderId(null)
                setActiveOrderName(null)
                toast.warning('Cuenta vaciada — se eliminó automáticamente')
            }
        }
    }, [items, discount, activeOrderId, invoiceClient])

    // ── Modals ───────────────────────────────────────────────────────────────
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
    const [editingItem, setEditingItem] = useState<CartItem | null>(null)
    const [editPriceValue, setEditPriceValue] = useState('')

    // ── Scan modals ──────────────────────────────────────────────────────────
    const { scanBuffer, setScanBuffer, scanNotFound, setScanNotFound, scanOutOfStock, setScanOutOfStock, showCreateProduct, setShowCreateProduct, createProductBarcode, setCreateProductBarcode } = usePOSScanModals()

    // ── Pending sale load (from Reports page modify flow) ────────────────────
    const pendingSaleLoad = usePendingSaleLoadStore()
    useEffect(() => {
        if (pendingSaleLoad.items && pendingSaleLoad.items.length > 0) {
            clearCart()
            loadOrder(pendingSaleLoad.items, pendingSaleLoad.discount)
            if (pendingSaleLoad.originalClientId) setSelectedClientId(pendingSaleLoad.originalClientId)
            if (pendingSaleLoad.originalConsumerName || pendingSaleLoad.originalPhysicalInvoiceNumber) {
                setInvoiceClient({
                    name: pendingSaleLoad.originalConsumerName ?? '',
                    cedula: '', email: '',
                    consumerName: pendingSaleLoad.originalConsumerName ?? undefined,
                    physicalInvoiceNumber: pendingSaleLoad.originalPhysicalInvoiceNumber ?? undefined,
                    companyId: pendingSaleLoad.originalCompanyId ?? undefined,
                })
            }
            pendingSaleLoad.clear()
            toast.info('Venta cargada — realiza los cambios y confirma')
        }
    }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    // ── Pending debt (from Balances page) ────────────────────────────────────
    const pendingDebt = usePendingSettleStore()
    const effectiveTotal = total + (pendingDebt.hasDebt ? pendingDebt.debtTotal : 0)
    const checkout = usePOSCheckout(effectiveTotal)
    const {
        paymentMethod, setPaymentMethod,
        amountReceived, setAmountReceived,
        mixedMethods, setMixedMethods,
        splitAmount, setSplitAmount,
        creditAmount, setCreditAmount,
        creditClientId, setCreditClientId,
        showMixedModal, setShowMixedModal,
        mixedModalView, setMixedModalView,
        showCreditModal, setShowCreditModal,
        received, splitAmountNum, creditAmountNum,
        isMixed, hasSinpeMixed, hasEfectivoMixed, hasCuentaMixed,
        cashPortion,
        handleOpenMixedSelect, handleOpenMixedCancel, handleMixedConfirm, handleCancelMixed,
    } = checkout

    // ── Sorteos ──────────────────────────────────────────────────────────────
    const { cartSorteo, showSorteoButton, qualifyingCount, isRaspadita, raspaditaCards, sorteoOpen, setSorteoOpen, sorteoDeclined, setSorteoDeclined, handleSorteoResult, handleRaspaditaCardScratched, handleRaspaditaClose } = usePOSSorteo(items)

    const handlePostSaleReset = () => {
        checkout.reset()
        setSelectedClientId(null)
        setActiveOrderId(null)
        setActiveOrderName(null)
        setMergeSnapshot(null)
        setAutoSavedFusionId(null)
        setSorteoDeclined(false)
    }
    const { processSale, splitCreditPending, handleSplitCreditConfirm } = usePOSSale({
        paymentMethod, isMixed, hasSinpeMixed, hasEfectivoMixed, hasCuentaMixed,
        creditAmountNum, creditClientId, received, splitAmountNum, effectiveTotal,
        mixedMethods, activeOrderId, selectedEmployee, viewMode, searchKbRef: searchKb.ref,
        cartSorteo, sorteoDeclined, qualifyingCount,
        onSaleSuccess: setSaleSuccess,
        onPostSaleReset: handlePostSaleReset,
        onCreditSplitComplete: () => { setShowCreditModal(false); setPaymentMethod('EFECTIVO') },
    })

    // ── Derived ───────────────────────────────────────────────────────────────
    const canCharge =
        (items.length > 0 || pendingDebt.hasDebt) &&
        !createSale.isPending &&
        (isMixed
            ? (
                (!hasCuentaMixed || (creditAmountNum > 0 && creditAmountNum < effectiveTotal && !!creditClientId)) &&
                (!hasSinpeMixed || splitAmountNum > 0) &&
                (!hasEfectivoMixed || received >= Math.max(0, cashPortion))
            )
            : (paymentMethod !== 'EFECTIVO' || received >= effectiveTotal)
        )

    // ── Handlers ──────────────────────────────────────────────────────────────
    const tryAddProduct = useCallback((product: Product) => {
        // Use fresh product data from query — cart snapshot can be stale after realtime stock update
        const fresh = products.find(p => p.id === product.id) ?? product
        if (!fresh.isInfinite) {
            const currentQty = items.find(i => i.id === fresh.id)?.quantity ?? 0
            if (currentQty >= (fresh.stockQty ?? 0)) {
                sileo.warning({
                    title: 'Sin stock disponible',
                    description: (
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 13, color: '#E4ECF7', fontWeight: 600, lineHeight: 1.3 }}>{fresh.name}</div>
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
                })
                return
            }
        }
        addItem(fresh)
        if (activeOrderId && activeOrderName) {
            sileo.success({
                title: 'Guardado en cuenta',
                description: (
                    <div style={{ marginTop: 6 }}>
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(79,70,229,0.05) 100%)',
                            border: '1px solid rgba(99,102,241,0.26)', borderRadius: 10, padding: '10px 12px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818CF8', boxShadow: '0 0 7px 2px rgba(129,140,248,0.65)', display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ fontSize: 9, color: '#818CF8', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cuenta activa</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#E4ECF7', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5, lineHeight: 1.3 }}>
                                {fresh.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontSize: 10, color: '#6366F1', fontWeight: 600, marginRight: 2 }}>→</span>
                                <span style={{ fontSize: 10, color: '#A5B4FC', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {activeOrderName}
                                </span>
                            </div>
                        </div>
                    </div>
                ),
                position: 'top-left',
            })
        }
        useKeyboardStore.getState().close()
    }, [items, addItem, products, activeOrderId, activeOrderName])

    // handleSearchSubmit is also called from the virtual keyboard's onEnter
    const handleSearchSubmit = (e?: React.FormEvent) => {
        e?.preventDefault()
        const trimmed = search.trim()
        if (!trimmed) return

        const product = products.find(p =>
            p.barcode === trimmed ||
            p.name.toLowerCase().includes(trimmed.toLowerCase())
        )

        // Second scan while buffer modal is open
        if (scanBuffer !== null) {
            const stored = scanBuffer
            setScanBuffer(null)
            setSearch('')
            useKeyboardStore.getState().close()
            if (product) {
                tryAddProduct(product)
            } else {
                setScanNotFound(trimmed || stored)
            }
            return
        }

        if (!product) {
            if (viewMode === 'scan') {
                setScanBuffer(trimmed)
                setTimeout(() => searchKb.ref.current?.focus(), 80)
            }
            setSearch('')
            useKeyboardStore.getState().close()
            return
        }

        if (viewMode === 'scan' && !product.isInfinite) {
            const currentQty = items.find(i => i.id === product.id)?.quantity ?? 0
            if (currentQty >= product.stockQty) {
                setScanOutOfStock(product)
                setSearch('')
                useKeyboardStore.getState().close()
                return
            }
        }

        tryAddProduct(product)
        setSearch('')
        useKeyboardStore.getState().close()
    }

    const handleClearCart = () => {
        clearCart()
        setAmountReceived('')
        setActiveOrderId(null)
        setActiveOrderName(null)
        setMergeSnapshot(null)
        setAutoSavedFusionId(null)
        setSorteoDeclined(false)
        pendingDebt.clear()
        setInvoiceClient(null)
        // Cancel modification context so a re-charge creates a NEW sale instead of updating the original
        pendingSaleLoad.clearModifying()
        setSelectedClientId(null)
    }

    const handleClearDebt = () => {
        pendingDebt.clear()
        if (activeOrderId) {
            updateHeldOrder(activeOrderId, items, discount, undefined)
        }
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
        const savedName = activeOrderId ? (activeOrderName ?? actualName) : actualName
        const savedItemCount = items.length
        const isUpdate = !!activeOrderId
        const debtSnapshot = pendingDebt.hasDebt
            ? { clientId: pendingDebt.clientId, clientName: pendingDebt.clientName, saleIds: pendingDebt.saleIds, debtTotal: pendingDebt.debtTotal, sales: pendingDebt.sales }
            : undefined
        if (activeOrderId) {
            updateHeldOrder(activeOrderId, items, discount, debtSnapshot, invoiceClient)
        } else {
            saveHeldOrder(actualName, items, discount, debtSnapshot, undefined, invoiceClient)
        }
        pendingDebt.clear()
        clearCart()
        setInvoiceClient(null)
        setAmountReceived('')
        setActiveOrderId(null)
        setActiveOrderName(null)
        setHeldOrdersView(null)
        sileo.success({
            title: isUpdate ? 'Cuenta actualizada' : 'Cuenta guardada',
            description: (
                <div style={{ marginTop: 8 }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(79,70,229,0.05) 100%)',
                        border: '1px solid rgba(99,102,241,0.26)', borderRadius: 10, padding: '12px 14px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818CF8', boxShadow: '0 0 7px 2px rgba(129,140,248,0.65)', display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 9, color: '#818CF8', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{savedItemCount} producto{savedItemCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#C7D2FE', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>{savedName}</div>
                        <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>Cambia de cuenta tranquilamente — los datos están seguros</div>
                    </div>
                </div>
            ),
            position: 'top-left',
        })
    }

    const handleInvoiceClient = async (data: { name: string; cedula: string; email: string; ccEmails?: string[]; existingId?: string; companyId?: string; consumerName?: string; physicalInvoiceNumber?: string }) => {
        if (data.companyId) {
            setInvoiceClient({ name: data.name, cedula: data.cedula, email: data.email, ccEmails: data.ccEmails, companyId: data.companyId, consumerName: data.consumerName, physicalInvoiceNumber: data.physicalInvoiceNumber })
            return
        }
        let finalId = data.existingId
        try {
            if (data.existingId) {
                const existing = clients.find(c => c.id === data.existingId)
                if (existing) {
                    const updates: Record<string, any> = {}
                    if (data.cedula && existing.cedula !== data.cedula) updates.cedula = data.cedula
                    if (data.email && existing.email !== data.email) updates.email = data.email
                    if (Object.keys(updates).length > 0) {
                        await updateClient.mutateAsync({ id: data.existingId, input: updates })
                    }
                }
            } else {
                const existingByName = clients.find(c => normalizeStr(c.name) === normalizeStr(data.name))
                if (existingByName) {
                    finalId = existingByName.id
                    const updates: Record<string, any> = {}
                    if (data.cedula && existingByName.cedula !== data.cedula) updates.cedula = data.cedula
                    if (data.email && existingByName.email !== data.email) updates.email = data.email
                    if (Object.keys(updates).length > 0) {
                        await updateClient.mutateAsync({ id: finalId, input: updates })
                    }
                } else {
                    const newClient = await createClient.mutateAsync({
                        name: data.name,
                        cedula: data.cedula.trim() || null,
                        code: null,
                        email: data.email.trim() || null,
                        type: 'GENERAL',
                        isActive: true,
                        phone: null,
                        company: null,
                        companyId: null,
                        notes: null,
                        isDeleted: false,
                        deletedAt: null,
                    })
                    finalId = newClient.id
                }
            }
            setInvoiceClient({ ...data, existingId: finalId, ccEmails: data.ccEmails })
        } catch (err) {
            console.error('Error handling invoice client:', err)
            toast.error('Error al vincular cliente')
            setInvoiceClient(data)
        }
    }

    const handleNewCustomer = (name?: string) => {
        const prevName = activeOrderName || (items.length > 0 && !activeOrderId ? (name?.trim() || 'Carrito sin cuenta') : null)
        if (items.length > 0 && !activeOrderId) {
            if (mergeSnapshot) {
                const fusionId = crypto.randomUUID()
                const saveName = mergeSnapshot.map(o => o.name).join(' + ')
                saveHeldOrder(saveName, items, discount, undefined, fusionId)
                setAutoSavedFusionId(fusionId)
            } else {
                saveHeldOrder(name || '', items, discount)
            }
        }
        setActiveOrderId(null)
        setActiveOrderName(null)
        clearCart()
        setInvoiceClient(null)
        setAmountReceived('')
        setHeldOrdersView(null)
        pendingDebt.clear()
        sileo.success({
            title: 'Nueva cuenta',
            description: (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {prevName && (
                        <div style={{ display: 'flex', alignItems: 'stretch', background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ fontSize: 9, color: '#4B5563', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Anterior</div>
                                <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prevName}</div>
                            </div>
                            <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
                            <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center', background: 'rgba(16,185,129,0.06)' }}>
                                <div style={{ fontSize: 9, color: '#10B981', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Ahora</div>
                                <div style={{ fontSize: 12, color: '#34D399', fontWeight: 700 }}>Nueva cuenta</div>
                            </div>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 8, padding: '6px 10px' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 5px 2px rgba(16,185,129,0.55)', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: '#6EE7B7', fontWeight: 600 }}>Carrito limpio · listo para el siguiente</span>
                    </div>
                </div>
            ),
            position: 'top-left',
        })
    }

    const handleLoadHeldOrder = (order: HeldOrder) => {
        const prevName = activeOrderName || (items.length > 0 && !activeOrderId ? 'Carrito sin cuenta' : null)
        if (items.length > 0 && !activeOrderId) {
            const saveName = mergeSnapshot && mergeSnapshot.length > 0
                ? mergeSnapshot.map(o => o.name).join(' + ')
                : ''
            saveHeldOrder(saveName, items, discount)
            setMergeSnapshot(null)
        }

        // Validate stock against current product data before loading
        const warnings: string[] = []
        const validItems: CartItem[] = []

        for (const item of order.items) {
            const current = products.find(p => p.id === item.id)

            if (!current || !current.isActive) {
                warnings.push(`"${item.product.name}" ya no existe o fue desactivado`)
                continue
            }

            if (!current.isInfinite && current.stockQty <= 0) {
                warnings.push(`"${current.name}" tiene stock agotado (0 disponible)`)
                continue
            }

            if (!current.isInfinite && current.stockQty < item.quantity) {
                const adjusted = { ...item, quantity: current.stockQty, subtotal: current.stockQty * item.unitPrice }
                validItems.push(adjusted)
                warnings.push(`"${current.name}": solo hay ${current.stockQty} (se pidieron ${item.quantity})`)
                continue
            }

            validItems.push(item)
        }

        if (warnings.length > 0) {
            toast.warning(`Cuenta cargada con ajustes:\n${warnings.join('\n')}`, 6000)
        }

        if (validItems.length === 0) {
            toast.error('No se pudo cargar: todos los productos están agotados o fueron eliminados')
            return
        }

        loadOrder(validItems, order.discount)
        setActiveOrderId(order.id)
        setActiveOrderName(order.name)
        setInvoiceClient(order.invoiceClient ?? null)
        setHeldOrdersView(null)
        if (order.pendingDebt) {
            const d = order.pendingDebt
            pendingDebt.set(d.clientId, d.clientName, d.saleIds, d.debtTotal, d.sales)
        } else {
            pendingDebt.clear()
        }
        sileo.success({
            title: 'Cuenta cargada',
            description: (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'stretch', background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#4B5563', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Anterior</div>
                            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prevName || '—'}</div>
                        </div>
                        <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
                        <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#10B981', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Activa</div>
                            <div style={{ fontSize: 11, color: '#10B981', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.name || 'Sin nombre'}</div>
                        </div>
                    </div>
                    <div style={{ fontSize: 10, color: '#6B7280' }}>
                        {validItems.length} producto{validItems.length !== 1 ? 's' : ''} · guardado automáticamente al cambiar
                    </div>
                </div>
            ),
            position: 'top-left',
        })
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

    const handleOpenDrawer = () => {
        const printerPort = config?.printerPort || config?.printerModel || localStorage.getItem('pos_printer_port')
        const drawerEnabled = config?.drawerEnabled ?? true
        if (drawerEnabled && printerPort && window.electronAPI?.openDrawer) {
            window.electronAPI.openDrawer(printerPort)
                .catch((err: any) => console.warn('[Drawer]', err))
        } else if (drawerEnabled && window.electronAPI && (!printerPort || !window.electronAPI.openDrawer)) {
            sileo.warning({
                title: 'Cajón no disponible',
                description: (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{
                            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                            borderRadius: 10, padding: '9px 12px',
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <span style={{ fontSize: 15 }}>🪙</span>
                            <div style={{ fontSize: 12, color: '#FCD34D', fontWeight: 600, lineHeight: 1.3 }}>
                                No se abrirá el cajón
                            </div>
                        </div>
                        <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                            No se detecta impresora. El cajón de dinero requiere una impresora conectada y encendida.
                        </div>
                    </div>
                ),
                position: 'top-right',
            })
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
        sileo.success({
            title: `${toMerge.length} cuentas fusionadas`,
            description: (
                <div style={{ marginTop: 8 }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(109,40,217,0.05) 100%)',
                        border: '1px solid rgba(139,92,246,0.26)', borderRadius: 10, padding: '10px 12px',
                        display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                        {toMerge.map((o, i) => (
                            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                    width: 16, height: 16, borderRadius: 4,
                                    background: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.4)',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 9, color: '#C4B5FD', fontWeight: 700, flexShrink: 0,
                                }}>{i + 1}</span>
                                <span style={{ fontSize: 11, color: '#DDD6FE', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name || 'Sin nombre'}</span>
                            </div>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, paddingTop: 6, borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#A78BFA', boxShadow: '0 0 5px 2px rgba(167,139,250,0.55)', display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 10, color: '#C4B5FD', fontWeight: 600 }}>Cuenta unificada lista para cobrar</span>
                        </div>
                    </div>
                </div>
            ),
            position: 'top-left',
        })
    }

    const handleUndoMerge = () => {
        if (!mergeSnapshot && !autoSavedFusionId) return
        const capturedSnapshot = mergeSnapshot
        if (autoSavedFusionId) {
            deleteHeldOrder(autoSavedFusionId)
            setAutoSavedFusionId(null)
        }
        clearCart()
        setAmountReceived('')
        if (mergeSnapshot) {
            mergeSnapshot.forEach(order => saveHeldOrder(order.name, order.items, order.discount))
            setMergeSnapshot(null)
        }
        setActiveOrderId(null)
        setActiveOrderName(null)
        sileo.success({
            title: 'Fusión deshecha',
            description: (
                <div style={{ marginTop: 8 }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.13) 0%, rgba(217,119,6,0.04) 100%)',
                        border: '1px solid rgba(245,158,11,0.24)', borderRadius: 10, padding: '10px 12px',
                        display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                        {capturedSnapshot && capturedSnapshot.map((o, i) => (
                            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                    width: 16, height: 16, borderRadius: 4,
                                    background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.38)',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 9, color: '#FCD34D', fontWeight: 700, flexShrink: 0,
                                }}>{i + 1}</span>
                                <span style={{ fontSize: 11, color: '#FDE68A', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name || 'Sin nombre'}</span>
                            </div>
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, paddingTop: 6, borderTop: '1px solid rgba(245,158,11,0.15)' }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F59E0B', boxShadow: '0 0 5px 2px rgba(245,158,11,0.55)', display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 10, color: '#FCD34D', fontWeight: 600 }}>
                                {capturedSnapshot?.length ?? 0} cuenta{(capturedSnapshot?.length ?? 0) !== 1 ? 's' : ''} restauradas al estado original
                            </span>
                        </div>
                    </div>
                </div>
            ),
            position: 'top-left',
        })
    }

    const handleConfirmPriceEdit = () => {
        if (editingItem && editPriceValue) {
            const p = parseFloat(editPriceValue)
            if (p > 0) {
                const oldPrice = editingItem.unitPrice
                useCartStore.getState().updatePrice(editingItem.id, p)
                sileo.success({
                    title: 'Precio actualizado',
                    description: (
                        <div style={{ marginTop: 6 }}>
                            <p style={{
                                fontSize: 11, color: '#7A8FAA', fontWeight: 500, marginBottom: 10,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                letterSpacing: '0.01em',
                            }}>
                                {editingItem.product.name}
                            </p>
                            <div style={{
                                display: 'flex', alignItems: 'stretch',
                                background: 'rgba(0,0,0,0.3)', borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
                            }}>
                                <div style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 9, color: '#4B5563', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Antes</div>
                                    <div style={{ fontSize: 17, color: '#6B7280', textDecoration: 'line-through', fontWeight: 700, lineHeight: 1 }}>
                                        ₡{oldPrice.toLocaleString('es-CR')}
                                    </div>
                                </div>
                                <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
                                <div style={{ flex: 1, padding: '10px 14px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 9, color: '#10B981', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>Ahora</div>
                                    <div style={{ fontSize: 17, color: '#10B981', fontWeight: 900, lineHeight: 1 }}>
                                        ₡{p.toLocaleString('es-CR')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ),
                    position: 'top-right',
                })
            }
        }
        setEditingItem(null)
        setEditPriceValue('')
    }

    const handleQuickStock = async (qty: number, makeInfinite: boolean) => {
        if (!scanOutOfStock) return
        const newStock = makeInfinite ? scanOutOfStock.stockQty : scanOutOfStock.stockQty + qty
        await updateProduct.mutateAsync({ id: scanOutOfStock.id, input: { stockQty: newStock, isInfinite: makeInfinite } })
        addItem({ ...scanOutOfStock, stockQty: newStock, isInfinite: makeInfinite })
        toast.success(makeInfinite ? `${scanOutOfStock.name} ahora tiene stock infinito` : `+${qty} unidades agregadas`)
        setScanOutOfStock(null)
    }

    const handleCreateProductConfirm = async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => {
        await createProduct.mutateAsync(data)
        setShowCreateProduct(false)
        setCreateProductBarcode('')
        toast.success(`Producto "${data.name}" creado`)
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
        if (search) {
            const q = normalizeStr(search)
            return (p.barcode ?? '').includes(search) ||
                normalizeStr(p.name).includes(q) ||
                fuzzyMatch(search, p.name) ||
                normalizeStr(categories.find(c => c.id === p.categoryId)?.name ?? '').includes(q)
        }
        if (selectedCategory && p.categoryId !== selectedCategory) return false
        if (useSegmented) {
            const ids = p.subcategoryIds ?? []
            if (ids.length > 0 && !ids.some(id => visibleSubcatIdSet.has(id))) return false
        }
        return true
    })

    if (isLoading) {
        return <Spinner size={40} label="Cargando productos..." className="h-full" />
    }

    return (
        <div className="flex flex-col h-full">

            {/* ── Top bar ──────────────────────────────────────────────────── */}
            <POSTopBar
                viewMode={viewMode}
                searchKb={searchKb}
                onSubmit={handleSearchSubmit}
                products={products}
                categories={categories}
                cartItems={items}
                onSelectProduct={(p) => { tryAddProduct(p); setSearch('') }}
                selectedEmployee={selectedEmployee}
                onOpenCashierModal={() => setShowCashierModal(true)}
            />

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

            {/* ── Modifying sale banner ────────────────────────────────────── */}
            {pendingSaleLoad.originalSaleNumber !== null && (
                <ModifyingSaleBanner
                    saleNumber={pendingSaleLoad.originalSaleNumber}
                    clientName={pendingSaleLoad.originalClientName}
                    onCancel={() => pendingSaleLoad.clearModifying()}
                />
            )}

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
                                onRemove={handleRemoveItem}
                                onEditPrice={(item) => {
                                    setEditingItem(item)
                                    setEditPriceValue(String(item.unitPrice))
                                }}
                                pendingDebtSales={pendingDebt.hasDebt ? pendingDebt.sales : undefined}
                                onClearDebt={pendingDebt.hasDebt ? handleClearDebt : undefined}
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
                                activeSorteoName={showSorteoButton ? cartSorteo?.sorteo.name : undefined}
                                onSorteo={() => setSorteoOpen(true)}
                                pendingDebt={pendingDebt.hasDebt ? { clientName: pendingDebt.clientName, total: pendingDebt.debtTotal } : undefined}
                                onClearDebt={pendingDebt.hasDebt ? handleClearDebt : undefined}
                                mixedMethods={mixedMethods}
                                onOpenMixedSelect={handleOpenMixedSelect}
                                onOpenMixedCancel={handleOpenMixedCancel}
                                splitAmount={splitAmount}
                                onChangeSplitAmount={setSplitAmount}
                                creditAmount={creditAmount}
                                onChangeCreditAmount={setCreditAmount}
                                creditClientId={creditClientId}
                                onSelectCreditClient={setCreditClientId}
                                clients={clients.filter((c: any) => c.isActive).map((c: any) => ({ id: c.id, name: c.name, code: c.code ?? null }))}
                                invoiceClient={invoiceClient}
                                onOpenInvoiceModal={() => setShowInvoiceModal(true)}
                                onClearInvoiceClient={() => setInvoiceClient(null)}
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
                                    forceNoImage={forceNoImage}
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
                                    forceNoImage={forceNoImage}
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
                                    onRemove={handleRemoveItem}
                                    onClear={handleClearCart}
                                    onEditPrice={(item) => {
                                        setEditingItem(item)
                                        setEditPriceValue(String(item.unitPrice))
                                    }}
                                    pendingDebtSales={pendingDebt.hasDebt ? pendingDebt.sales : undefined}
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
                                    pendingDebt={pendingDebt.hasDebt ? { clientName: pendingDebt.clientName, total: pendingDebt.debtTotal } : undefined}
                                    onClearDebt={pendingDebt.hasDebt ? handleClearDebt : undefined}
                                    mixedMethods={mixedMethods}
                                    onOpenMixedSelect={handleOpenMixedSelect}
                                    onOpenMixedCancel={handleOpenMixedCancel}
                                    splitAmount={splitAmount}
                                    onChangeSplitAmount={setSplitAmount}
                                    creditAmount={creditAmount}
                                    onChangeCreditAmount={setCreditAmount}
                                    creditClientId={creditClientId}
                                    onSelectCreditClient={setCreditClientId}
                                    clients={clients.filter((c: any) => c.isActive).map((c: any) => ({ id: c.id, name: c.name, code: c.code ?? null }))}
                                    invoiceClient={invoiceClient}
                                    onOpenInvoiceModal={() => setShowInvoiceModal(true)}
                                    onClearInvoiceClient={() => setInvoiceClient(null)}
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
                onSelect={selectEmployee}
            />

            <CreditModal
                isOpen={showCreditModal}
                onClose={() => { setShowCreditModal(false); setPaymentMethod('EFECTIVO') }}
                total={total}
                subtotal={subtotal}
                discount={discount}
                itemCount={itemCount}
                clients={clients}
                companies={companies}
                cartItems={items}
                selectedClientId={selectedClientId}
                onSelectClient={setSelectedClientId}
                onConfirm={() => processSale({ isCredit: true, clientId: selectedClientId })}
                onConfirmCompany={(cid) => processSale({ isCredit: true, clientId: null, companyId: cid })}
                onSplitConfirm={handleSplitCreditConfirm}
                isPending={createSale.isPending || splitCreditPending}
                defaultCompanyId={pendingSaleLoad.originalCompanyId ?? null}
                defaultClientId={pendingSaleLoad.originalClientId ?? null}
            />

            <MixedPaymentModal
                isOpen={showMixedModal}
                onClose={() => setShowMixedModal(false)}
                initialView={mixedModalView}
                currentMethods={mixedMethods}
                onConfirm={handleMixedConfirm}
                onCancelMixed={handleCancelMixed}
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

            <POSSorteoModals
                isRaspadita={isRaspadita}
                sorteoOpen={sorteoOpen}
                setSorteoOpen={setSorteoOpen}
                cartSorteo={cartSorteo}
                raspaditaCards={raspaditaCards}
                qualifyingCount={qualifyingCount}
                handleSorteoResult={handleSorteoResult}
                handleRaspaditaCardScratched={handleRaspaditaCardScratched}
                handleRaspaditaClose={handleRaspaditaClose}
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
                    if (id === autoSavedFusionId) {
                        setAutoSavedFusionId(null)
                        setMergeSnapshot(null)
                    }
                }}
                onRename={renameHeldOrder}
                onMerge={handleMergeOrders}
                hasMergeSnapshot={mergeSnapshot !== null || (autoSavedFusionId !== null && (activeOrderId === null || activeOrderId === autoSavedFusionId))}
                mergeSnapshotNames={mergeSnapshot?.map(o => o.name) ?? []}
                onUndoMerge={handleUndoMerge}
            />

            <ScanBufferModal
                isOpen={scanBuffer !== null}
                barcode={scanBuffer ?? ''}
                onClose={() => setScanBuffer(null)}
                onExpire={() => {
                    const barcode = scanBuffer
                    setScanBuffer(null)
                    if (barcode) setScanNotFound(barcode)
                }}
            />

            <ScanNotFoundModal
                isOpen={scanNotFound !== null}
                onClose={() => setScanNotFound(null)}
                barcode={scanNotFound ?? ''}
                onCreateProduct={() => {
                    setCreateProductBarcode(scanNotFound ?? '')
                    setScanNotFound(null)
                    setShowCreateProduct(true)
                }}
            />

            <QuickStockModal
                isOpen={scanOutOfStock !== null}
                onClose={() => setScanOutOfStock(null)}
                product={scanOutOfStock}
                onConfirm={handleQuickStock}
                isPending={updateProduct.isPending}
            />

            <ProductFormModal
                isOpen={showCreateProduct}
                onClose={() => { setShowCreateProduct(false); setCreateProductBarcode('') }}
                onConfirm={handleCreateProductConfirm}
                categories={categories}
                isPending={createProduct.isPending}
                initialBarcode={createProductBarcode}
            />

            <InvoiceNameModal
                isOpen={showInvoiceModal}
                onClose={() => setShowInvoiceModal(false)}
                onAccept={handleInvoiceClient}
                clients={clients.filter(c => c.isActive)}
                companies={companies}
                initialData={invoiceClient}
            />
        </div>
    )
}
