import { useState, useCallback, useEffect } from 'react'
import { useCartStore } from '@/store/cartStore'
import { useHeldOrdersStore } from '@/store/heldOrdersStore'
import { useKeyboardStore } from '@/store/keyboardStore'
import { usePendingSettleStore } from '@/store/pendingSettleStore'
import { usePendingSaleLoadStore } from '@/store/pendingSaleLoadStore'
import { settleSaleDirect } from '@/services/clients'
import { createCreditNote, createSplitCreditSales, updateSaleInPlace } from '@/services/sales'
import { logSorteoEntry } from '@/services/sorteos'
import type { SplitCreditData } from '@/components/modals/CreditModal'
import { useKeyboardInput, useSuppressKeyboard } from '@/hooks/useKeyboardInput'
import { useProducts, useCreateProduct, useUpdateProduct } from '@/hooks/useProducts'
import { useCategories } from '@/hooks/useCategories'
import { useClients, useCreateClient, useUpdateClient, useCompanies } from '@/hooks/useClients'
import { useEmployees } from '@/hooks/useEmployees'
import { useCreateSale } from '@/hooks/useSales'
import { useActiveRegister } from '@/hooks/useCashRegister'
import { usePOSSorteo } from '@/hooks/usePOSSorteo'
import { usePOSScanModals } from '@/hooks/usePOSScanModals'
import { useCashierSelection } from '@/hooks/useCashierSelection'
import { useQueryClient } from '@tanstack/react-query'
import { useBusinessConfig } from '@/hooks/useConfig'
import { ModifyingSaleBanner } from '@/components/molecules/ModifyingSaleBanner'
import { POSTopBar } from '@/components/organisms/pos/POSTopBar'
import { POSSorteoModals } from '@/components/organisms/pos/POSSorteoModals'
import { sendReceiptEmail, sendSettledEmail, sendMixedCreditEmail, sendSplitCreditEmail, sendInvoiceReceiptEmail } from '@/services/emailReceipt'
import { MixedPaymentModal, type MixedModalView } from '@/components/modals/MixedPaymentModal'
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
    const { data: activeRegister } = useActiveRegister()
    const { data: config } = useBusinessConfig()
    const createClient = useCreateClient()
    const updateClient = useUpdateClient()

    // ── Cart ────────────────────────────────────────────────────────────────
    const { items, addItem, removeItem, removeItems, updateQuantity, clearCart, loadOrder, getSubtotal, getTotal, discount, invoiceClient, setInvoiceClient } = useCartStore()
    const { orders: heldOrders, saveOrder: saveHeldOrder, updateOrder: updateHeldOrder, renameOrder: renameHeldOrder, deleteOrder: deleteHeldOrder } = useHeldOrdersStore()
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
    const [mixedMethods, setMixedMethods] = useState<string[]>([])
    const [splitAmount, setSplitAmount] = useState('')
    const [creditAmount, setCreditAmount] = useState('')
    const [creditClientId, setCreditClientId] = useState<string | null>(null)
    const [showMixedModal, setShowMixedModal] = useState(false)
    const [mixedModalView, setMixedModalView] = useState<MixedModalView>('select')

    useEffect(() => {
        localStorage.setItem('pos_amount_received', amountReceived)
    }, [amountReceived])

    // ── Cashier ──────────────────────────────────────────────────────────────
    const { showCashierModal, setShowCashierModal, selectedEmployee, selectEmployee } = useCashierSelection()

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
    const [showCreditModal, setShowCreditModal] = useState(false)
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

    // ── Sorteos ──────────────────────────────────────────────────────────────
    const qc = useQueryClient()
    const { cartSorteo, showSorteoButton, qualifyingCount, isRaspadita, raspaditaCards, sorteoOpen, setSorteoOpen, sorteoDeclined, setSorteoDeclined, handleSorteoResult, handleRaspaditaCardScratched, handleRaspaditaClose } = usePOSSorteo(items)

    // ── Derived ───────────────────────────────────────────────────────────────
    const received = parseFloat(amountReceived) || 0
    const effectiveTotal = total + (pendingDebt.hasDebt ? pendingDebt.debtTotal : 0)
    const splitAmountNum = parseFloat(splitAmount) || 0
    const creditAmountNum = parseFloat(creditAmount) || 0
    const isMixed = mixedMethods.length >= 2
    const hasSinpeMixed = isMixed && mixedMethods.includes('SINPE')
    const hasEfectivoMixed = isMixed && mixedMethods.includes('EFECTIVO')
    const hasCuentaMixed = isMixed && mixedMethods.includes('CUENTA')
    const cashPortion = effectiveTotal - (hasSinpeMixed ? splitAmountNum : 0) - (hasCuentaMixed ? creditAmountNum : 0)
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
        const debtSnapshot = pendingDebt.hasDebt
            ? { clientId: pendingDebt.clientId, clientName: pendingDebt.clientName, saleIds: pendingDebt.saleIds, debtTotal: pendingDebt.debtTotal, sales: pendingDebt.sales }
            : undefined
        if (activeOrderId) {
            updateHeldOrder(activeOrderId, items, discount, debtSnapshot, invoiceClient)
        } else {
            const actualName = name.trim() || `Cuenta pendiente ${heldOrders.length + 1}`
            saveHeldOrder(actualName, items, discount, debtSnapshot, undefined, invoiceClient)
        }
        pendingDebt.clear()
        clearCart()
        setInvoiceClient(null)
        setAmountReceived('')
        setActiveOrderId(null)
        setActiveOrderName(null)
        setHeldOrdersView(null)
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
                        notes: null
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
    }

    const handleLoadHeldOrder = (order: HeldOrder) => {
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
    }

    const handlePaymentMethodChange = (method: PaymentMethod) => {
        setPaymentMethod(method)
        if (method !== 'EFECTIVO') setAmountReceived('')
        if (method === 'CREDITO' && items.length > 0) setShowCreditModal(true)
    }

    const handleOpenMixedSelect = () => { setMixedModalView('select'); setShowMixedModal(true) }
    const handleOpenMixedCancel = () => { setMixedModalView('cancel'); setShowMixedModal(true) }
    const handleMixedConfirm = (methods: string[]) => { setMixedMethods(methods); setShowMixedModal(false) }
    const handleCancelMixed = () => { setMixedMethods([]); setShowMixedModal(false) }

    const [splitCreditPending, setSplitCreditPending] = useState(false)

    const handleSplitCreditConfirm = async (data: SplitCreditData) => {
        setSplitCreditPending(true)
        try {
            const sales = await createSplitCreditSales({
                clientAssignments: data.clientAssignments,
                cartItems: data.selectedCartItems,
                cashRegisterId: activeRegister?.id ?? null,
                cashierName: selectedEmployee?.name ?? null,
            })
            removeItems(data.selectedCartItems.map(i => i.id))
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['active-register'] })
            setShowCreditModal(false)
            setPaymentMethod('EFECTIVO')
            toast.success(`Crédito dividido entre ${data.clientAssignments.length} cuentas`)

            const printerPort = config?.printerPort || config?.printerModel || localStorage.getItem('pos_printer_port')
            if (printerPort && window.electronAPI?.printReceipt) {
                const tOpts = (() => { try { return JSON.parse(localStorage.getItem('pos_ticket_options') ?? '{}') } catch { return {} } })()
                const splitTotal = data.selectedCartItems.reduce((s, i) => s + i.subtotal, 0)
                window.electronAPI.printReceipt(printerPort, {
                    businessName: config?.name || 'Soda El Pelón',
                    address: config?.address,
                    phone: config?.phone,
                    header: config?.ticketHeader || null,
                    saleNumber: sales.baseSaleNumber,
                    date: new Date().toISOString(),
                    cashier: selectedEmployee?.name ?? null,
                    items: data.selectedCartItems.map(i => ({
                        name: i.product.name,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                        subtotal: i.subtotal,
                    })),
                    total: splitTotal,
                    paymentMethod: 'CREDITO DIVIDIDO',
                    footer: config?.ticketFooter || '¡Gracias por su compra!',
                    ticketLogoUrl: config?.ticketLogoUrl || null,
                    showCashier: tOpts.showCashier ?? true,
                    showChange: false,
                    showHeader: tOpts.showHeader ?? true,
                    showUnitPrice: tOpts.showUnitPrice ?? false,
                    showDecimals: tOpts.showDecimals ?? true,
                    currencySymbol: tOpts.currencySymbol ?? '₡',
                    splitClients: data.clientAssignments.map(a => ({
                        name: a.clientName,
                        amount: a.products.reduce((s, p) => s + p.amount, 0),
                    })),
                }).catch((err: any) => console.error('[POS] Split credit print error:', err))
            }

            const allClientNames = data.clientAssignments.map(a => a.clientName)
            const now = new Date().toISOString()
            data.clientAssignments.forEach((assignment, idx) => {
                const client = clients.find((c: any) => c.id === assignment.clientId)
                if (!client?.email) return
                const clientTotal = assignment.products.reduce((s, p) => s + p.amount, 0)
                sendSplitCreditEmail({
                    to: client.email,
                    clientName: client.name,
                    businessName: config?.name ?? '',
                    logoUrl: config?.emailLogoUrl,
                    saleNumber: (sales?.baseSaleNumber ?? 0) + idx,
                    date: now,
                    products: assignment.products.map(p => {
                        const cartItem = data.selectedCartItems.find(i => i.id === p.productId)
                        return {
                            name: cartItem?.product.name ?? 'Producto',
                            totalPrice: cartItem?.subtotal ?? p.amount,
                            clientAmount: p.amount,
                        }
                    }),
                    allClientNames,
                    totalCharged: clientTotal,
                }).catch(() => { })
            })
        } catch (err) {
            console.error(err)
            toast.error('Error al procesar crédito dividido')
        } finally {
            setSplitCreditPending(false)
        }
    }

    const handleCharge = async () => {
        if (paymentMethod === 'CREDITO') { setShowCreditModal(true); return }
        await processSale({ method: paymentMethod })
    }

    const processSale = async ({ isCredit = false, clientId = null as string | null, method = paymentMethod, companyId = null as string | null }) => {
        try {
            // Capture before clearCart — closures over Zustand state can become stale after async points
            const saleItems = items
            const cartOnlyTotal = total        // only cart items — for the Sale record
            const saleTotal = effectiveTotal   // cart + debt — for change calculation & UI
            const capturedSorteo = cartSorteo
            const capturedDeclined = sorteoDeclined
            const capturedQtyCount = qualifyingCount
            const saleSubtotal = subtotal
            const saleDiscount = discount
            const saleReceived = received
            const saleCashier = selectedEmployee?.name ?? null
            const capturedDebt = pendingDebt.hasDebt ? { ...pendingDebt } : null
            const capturedIsMixed = isMixed && !isCredit
            const capturedHasSinpe = capturedIsMixed && mixedMethods.includes('SINPE')
            const capturedHasEfectivo = capturedIsMixed && mixedMethods.includes('EFECTIVO')
            const capturedHasCuenta = capturedIsMixed && mixedMethods.includes('CUENTA')
            const capturedCreditAmt = capturedHasCuenta ? creditAmountNum : 0
            const capturedCreditClientId = capturedHasCuenta ? creditClientId : null
            const capturedInvoiceClient = invoiceClient
            const capturedCreditCompanyId = companyId

            // Cart empty + debt only: settle original sales (no new sale, avoids empty-items record)
            if (saleItems.length === 0 && capturedDebt && !isCredit) {
                const debtItems = capturedDebt.sales.flatMap((s: any) =>
                    (s.items ?? []).map((item: any) => ({
                        name: item.product?.name ?? 'Producto',
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        subtotal: item.subtotal,
                    }))
                )
                const debtItemCount = debtItems.reduce((n: number, i: any) => n + i.quantity, 0)
                const changeGiven = method === 'EFECTIVO' ? Math.max(0, saleReceived - capturedDebt.debtTotal) : 0
                const firstSale = capturedDebt.sales[0] as any

                const failedSettles: string[] = []
                for (let idx = 0; idx < capturedDebt.saleIds.length; idx++) {
                    const id = capturedDebt.saleIds[idx]
                    try {
                        await settleSaleDirect(id, {
                            paymentMethod: method,
                            cashRegisterId: activeRegister?.id ?? null,
                            amountReceived: idx === 0 ? (method === 'EFECTIVO' ? saleReceived : capturedDebt.debtTotal) : null,
                            change: idx === 0 ? changeGiven : null,
                        })
                    } catch (err) {
                        console.error(`[POS] Failed to settle sale ${id}:`, err)
                        failedSettles.push(id)
                    }
                }
                if (failedSettles.length > 0) {
                    toast.error(`${failedSettles.length} de ${capturedDebt.saleIds.length} deuda(s) no se pudieron liquidar. Revisa Cuentas.`, 8000)
                    if (failedSettles.length === capturedDebt.saleIds.length) return // all failed — abort
                }
                pendingDebt.clear()
                qc.invalidateQueries({ queryKey: ['credit-sales'] })
                qc.invalidateQueries({ queryKey: ['active-register'] })

                const settledClient = clients.find((c: any) => c.id === capturedDebt.clientId)
                if (settledClient?.email) {
                    sendSettledEmail({
                        to: settledClient.email,
                        clientName: settledClient.name,
                        businessName: config?.name ?? '',
                        logoUrl: config?.emailLogoUrl,
                        sales: capturedDebt.sales.map((s: any) => ({
                            saleNumber: s.saleNumber,
                            date: s.date instanceof Date ? s.date.toISOString() : String(s.date),
                            items: (s.items ?? []).map((item: any) => ({
                                name: item.product?.name ?? item.name ?? 'Producto',
                                quantity: item.quantity,
                                unitPrice: item.unitPrice,
                                subtotal: item.subtotal,
                            })),
                            subtotal: s.subtotal,
                            discount: s.discount,
                            total: s.total,
                        })),
                    }).catch(() => { })
                }

                setSaleSuccess({
                    total: capturedDebt.debtTotal,
                    itemCount: debtItemCount,
                    items: debtItems,
                    cashier: saleCashier ?? 'Sin cajero',
                    paymentMethod: method,
                })
                if (activeOrderId) deleteHeldOrder(activeOrderId)
                clearCart()
                setAmountReceived('')
                setPaymentMethod('EFECTIVO')
                setMixedMethods([])
                setCreditAmount('')
                setCreditClientId(null)
                setSelectedClientId(null)
                setShowCreditModal(false)
                setActiveOrderId(null)
                setActiveOrderName(null)
                setMergeSnapshot(null)
                setAutoSavedFusionId(null)
                setSorteoDeclined(false)
                setInvoiceClient(null)
                if (viewMode === 'scan') setTimeout(() => searchKb.ref.current?.focus(), 50)

                const printerPort2 = config?.printerPort || config?.printerModel || localStorage.getItem('pos_printer_port')
                if (printerPort2 && window.electronAPI?.printReceipt && firstSale) {
                    const tOpts2 = (() => { try { return JSON.parse(localStorage.getItem('pos_ticket_options') ?? '{}') } catch { return {} } })()
                    await window.electronAPI.printReceipt(printerPort2, {
                        businessName: config?.name || 'Soda El Pelón',
                        address: config?.address,
                        phone: config?.phone,
                        header: config?.ticketHeader || null,
                        saleNumber: firstSale.saleNumber,
                        date: new Date().toISOString(),
                        cashier: saleCashier,
                        clientName: settledClient?.name,
                        clientCode: settledClient?.code,
                        items: debtItems,
                        total: capturedDebt.debtTotal,
                        paymentMethod: method,
                        amountReceived: method === 'EFECTIVO' ? saleReceived : null,
                        change: changeGiven,
                        footer: config?.ticketFooter || '¡Gracias por su compra!',
                        ticketLogoUrl: config?.ticketLogoUrl || null,
                        showCashier: tOpts2.showCashier ?? true,
                        showChange: tOpts2.showChange ?? true,
                        showHeader: tOpts2.showHeader ?? true,
                        showUnitPrice: tOpts2.showUnitPrice ?? false,
                        showDecimals: tOpts2.showDecimals ?? true,
                        currencySymbol: tOpts2.currencySymbol ?? '₡',
                    }).catch((err: any) => console.error('[POS] Auto-print error:', err))
                }
                return
            }

            const mainTotal = isCredit ? cartOnlyTotal : cartOnlyTotal - capturedCreditAmt
            const mainPaymentMethod = isCredit ? 'CREDITO' : capturedIsMixed
                ? (capturedHasEfectivo ? 'EFECTIVO' : 'SINPE')
                : method
            const mainPaymentMethod2 = capturedHasEfectivo && capturedHasSinpe ? 'SINPE' : null
            const mainAmount2 = capturedHasEfectivo && capturedHasSinpe ? splitAmountNum : null
            const paymentTotal = capturedDebt ? saleTotal - capturedCreditAmt : mainTotal // full amount cashier must cover
            const mainAmountReceived = isCredit ? null
                : capturedHasEfectivo ? saleReceived
                    : capturedHasSinpe ? paymentTotal
                        : (method === 'EFECTIVO' ? saleReceived : paymentTotal)
            const cashNeeded = paymentTotal - (capturedHasSinpe ? splitAmountNum : 0)
            const mainChange = isCredit ? 0
                : capturedHasEfectivo ? Math.max(0, saleReceived - cashNeeded)
                    : (method === 'EFECTIVO' ? Math.max(0, saleReceived - paymentTotal) : 0)
            const saleInput = {
                items: saleItems, subtotal: saleSubtotal, discount: saleDiscount, total: mainTotal,
                paymentMethod: mainPaymentMethod as any,
                amountReceived: mainAmountReceived,
                change: mainChange,
                isCredit, clientId: clientId || capturedInvoiceClient?.existingId || null,
                cashRegisterId: activeRegister?.id ?? null,
                notes: `Cajero: ${saleCashier ?? 'Sin cajero'}`,
                paymentMethod2: mainPaymentMethod2 as any,
                amount2: mainAmount2,
                creditPart: (capturedHasCuenta && capturedCreditAmt > 0 && capturedCreditClientId)
                    ? { clientId: capturedCreditClientId, amount: capturedCreditAmt }
                    : null,
                modifiedFromSaleId: pendingSaleLoad.originalSaleId ?? null,
                companyId: capturedCreditCompanyId ?? capturedInvoiceClient?.companyId ?? pendingSaleLoad.originalCompanyId ?? null,
                consumerName: capturedInvoiceClient?.consumerName ?? pendingSaleLoad.originalConsumerName ?? null,
                originalSaleSnapshot: pendingSaleLoad.originalSaleSnapshot ?? null,
                physicalInvoiceNumber: capturedInvoiceClient?.physicalInvoiceNumber ?? pendingSaleLoad.originalPhysicalInvoiceNumber ?? null,
            }

            // When modifying any sale (including company credit), update in place
            const capturedOriginalId = pendingSaleLoad.originalSaleId
            let sale: any
            if (capturedOriginalId) {
                const updated = await updateSaleInPlace(capturedOriginalId, saleInput)
                if (updated) {
                    sale = { ...updated, ...saleInput }
                    qc.invalidateQueries({ queryKey: ['products'] })
                    qc.invalidateQueries({ queryKey: ['sales'] })
                } else {
                    // Original no longer exists (was a deleted credit sale) — create new
                    sale = await createSale.mutateAsync(saleInput)
                }
            } else {
                sale = await createSale.mutateAsync(saleInput)
            }

            const resolvedCompanyId = capturedCreditCompanyId ?? capturedInvoiceClient?.companyId ?? pendingSaleLoad.originalCompanyId ?? null
            if (resolvedCompanyId) {
                qc.invalidateQueries({ queryKey: ['company-sales', resolvedCompanyId] })
                qc.invalidateQueries({ queryKey: ['all-company-sales'] })
            }

            if (capturedHasCuenta && capturedCreditAmt > 0 && capturedCreditClientId) {
                qc.invalidateQueries({ queryKey: ['credit-sales'] })
                qc.invalidateQueries({ queryKey: ['clients'] })

                const creditClient = clients.find((c: any) => c.id === capturedCreditClientId)
                if (creditClient?.email) {
                    const mixedPayCtx = {
                        ...(capturedHasEfectivo ? { ef: Math.max(0, mainTotal - (capturedHasSinpe ? splitAmountNum : 0)) } : {}),
                        ...(capturedHasSinpe ? { sinpe: splitAmountNum } : {}),
                        cuenta: capturedCreditAmt,
                    }
                    sendMixedCreditEmail({
                        to: creditClient.email,
                        clientName: creditClient.name,
                        businessName: config?.name ?? '',
                        logoUrl: config?.emailLogoUrl,
                        saleNumber: sale.saleNumber,
                        creditNoteNumber: sale.saleNumber + 1,
                        date: sale.date,
                        items: saleItems.map(i => ({
                            name: i.product.name,
                            quantity: i.quantity,
                            unitPrice: i.unitPrice,
                            subtotal: i.subtotal,
                        })),
                        subtotal: saleSubtotal,
                        discount: saleDiscount,
                        fullTotal: saleTotal,
                        payment: {
                            ...(capturedHasEfectivo ? { efectivo: mixedPayCtx.ef } : {}),
                            ...(capturedHasSinpe ? { sinpe: mixedPayCtx.sinpe } : {}),
                            cuenta: capturedCreditAmt,
                        },
                    }).catch(() => { })
                }
            }

            setSaleSuccess({
                total: saleTotal,
                itemCount: saleItems.reduce((s, i) => s + i.quantity, 0),
                items: [
                    ...saleItems.map(i => ({ name: i.product.name, quantity: i.quantity })),
                    ...(capturedDebt ? [{ name: `Abono deuda (${capturedDebt.clientName})`, quantity: 1 }] : []),
                ],
                cashier: saleCashier ?? 'Sin cajero',
                paymentMethod: isCredit ? 'CREDITO' : method,
            })
            if (activeOrderId) deleteHeldOrder(activeOrderId)
            clearCart()
            pendingSaleLoad.clearModifying()
            setAmountReceived('')
            setPaymentMethod('EFECTIVO')
            setMixedMethods([])
            setCreditAmount('')
            setCreditClientId(null)
            setSelectedClientId(null)
            setShowCreditModal(false)
            setActiveOrderId(null)
            setActiveOrderName(null)
            setMergeSnapshot(null)
            setAutoSavedFusionId(null)
            setSorteoDeclined(false)
            setInvoiceClient(null)
            if (viewMode === 'scan') setTimeout(() => searchKb.ref.current?.focus(), 50)

            // Settle pending debt sales if navigated from Balances
            if (capturedDebt && capturedDebt.saleIds.length > 0) {
                const settleFailures: string[] = []
                for (const id of capturedDebt.saleIds) {
                    try {
                        await settleSaleDirect(id, {
                            paymentMethod: method,
                            cashRegisterId: activeRegister?.id ?? null,
                        })
                    } catch (err) {
                        console.error(`[POS] Failed to settle debt ${id}:`, err)
                        settleFailures.push(id)
                    }
                }
                if (settleFailures.length > 0) {
                    toast.error(`${settleFailures.length} deuda(s) no se liquidaron correctamente. Revisa Cuentas.`)
                }
                pendingDebt.clear()
                qc.invalidateQueries({ queryKey: ['credit-sales'] })
                qc.invalidateQueries({ queryKey: ['active-register'] })
            }

            // Auto-record non-participation if sorteo was eligible but never used
            if (capturedSorteo && !capturedDeclined) {
                await logSorteoEntry({ sorteoId: capturedSorteo.sorteo.id, didParticipate: false, unitCount: capturedQtyCount })
                qc.invalidateQueries({ queryKey: ['sorteoStats', capturedSorteo.sorteo.id] })
            }

            const printerPort = config?.printerPort || config?.printerModel || localStorage.getItem('pos_printer_port')

            // --- AUTOMATIC PRINTING — await before drawer to avoid COM port conflict ---
            if (printerPort && window.electronAPI?.printReceipt) {
                const tOpts = (() => { try { return JSON.parse(localStorage.getItem('pos_ticket_options') ?? '{}') } catch { return {} } })()
                const selClient = capturedInvoiceClient
                    ? { name: capturedInvoiceClient.name, code: capturedInvoiceClient.cedula || null }
                    : (clientId ? clients.find((c: any) => c.id === clientId) : null)
                await window.electronAPI.printReceipt(printerPort, {
                    businessName: config?.name || 'Soda El Pelón',
                    address: config?.address,
                    phone: config?.phone,
                    header: config?.ticketHeader || null,
                    saleNumber: sale.saleNumber,
                    date: sale.date,
                    cashier: saleCashier,
                    clientName: selClient?.name,
                    clientCode: selClient?.code,
                    items: [
                        ...saleItems.map(i => ({
                            name: i.product.name,
                            quantity: i.quantity,
                            unitPrice: i.unitPrice,
                            subtotal: i.subtotal,
                        })),
                        ...(capturedDebt ? [{
                            name: `Abono deuda (${capturedDebt.clientName})`,
                            quantity: 1,
                            unitPrice: capturedDebt.debtTotal,
                            subtotal: capturedDebt.debtTotal,
                        }] : []),
                    ],
                    total: saleTotal,
                    paymentMethod: isCredit ? 'CREDITO' : method,
                    amountReceived: method === 'EFECTIVO' && !isCredit ? saleReceived : null,
                    change: method === 'EFECTIVO' && !isCredit ? Math.max(0, saleReceived - saleTotal) : 0,
                    footer: config?.ticketFooter || '¡Gracias por su compra!',
                    showCashier: tOpts.showCashier ?? true,
                    showChange: tOpts.showChange ?? true,
                    showHeader: tOpts.showHeader ?? true,
                    showUnitPrice: tOpts.showUnitPrice ?? false,
                    showDecimals: tOpts.showDecimals ?? true,
                    ticketLogoUrl: config?.ticketLogoUrl || null,
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
                        logoUrl: config?.emailLogoUrl,
                        saleNumber: sale.saleNumber,
                        date: sale.date,
                        items: saleItems.map(i => ({
                            name: i.product.name,
                            quantity: i.quantity,
                            unitPrice: i.unitPrice,
                            subtotal: i.subtotal,
                        })),
                        subtotal: saleSubtotal, discount: saleDiscount, total: cartOnlyTotal,
                        modifiedFromSaleNumber: pendingSaleLoad.originalSaleNumber ?? undefined,
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

            if (!isCredit && capturedInvoiceClient) {
                const invoiceFull = capturedInvoiceClient.existingId
                    ? clients.find(c => c.id === capturedInvoiceClient.existingId)
                    : null
                const recipientEmail = capturedInvoiceClient.email.trim() || invoiceFull?.email || null
                const recipientName = capturedInvoiceClient.name
                const invoicePayload = {
                    clientName: recipientName,
                    businessName: config?.name ?? 'Mi Soda',
                    saleNumber: sale.saleNumber,
                    date: sale.date,
                    items: saleItems.map(i => ({
                        name: i.product.name,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                        subtotal: i.subtotal,
                    })),
                    subtotal: saleSubtotal, discount: saleDiscount, total: cartOnlyTotal,
                    paymentMethod: method,
                    logoUrl: config?.emailLogoUrl,
                }
                if (recipientEmail) {
                    sendInvoiceReceiptEmail({ to: recipientEmail, ...invoicePayload }).then(result => {
                        if (result.success) {
                            toast.success(`Recibo enviado a ${recipientEmail}`)
                        } else if (result.isVerificationError) {
                            toast.error('Dominio de correo no verificado. Configura el dominio en Resend.')
                        } else {
                            toast.error(`Error al enviar recibo: ${result.error}`)
                        }
                    }).catch(() => {})
                }
                for (const ccAddr of capturedInvoiceClient.ccEmails ?? []) {
                    const trimmed = ccAddr.trim()
                    if (trimmed) sendInvoiceReceiptEmail({ to: trimmed, ...invoicePayload }).catch(() => {})
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
        if (!mergeSnapshot && !autoSavedFusionId) return
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
    }

    const handleConfirmPriceEdit = () => {
        if (editingItem && editPriceValue) {
            const p = parseFloat(editPriceValue)
            if (p > 0) useCartStore.getState().updatePrice(editingItem.id, p)
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
                                onRemove={removeItem}
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
