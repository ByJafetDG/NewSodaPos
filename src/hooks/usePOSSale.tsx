import { useState, useRef } from 'react'
import { sileo } from 'sileo'
import { useCartStore } from '@/store/cartStore'
import { useHeldOrdersStore } from '@/store/heldOrdersStore'
import { usePendingSettleStore } from '@/store/pendingSettleStore'
import { usePendingSaleLoadStore } from '@/store/pendingSaleLoadStore'
import { useQueryClient } from '@tanstack/react-query'
import { useClients } from '@/hooks/useClients'
import { useBusinessConfig } from '@/hooks/useConfig'
import { useActiveRegister } from '@/hooks/useCashRegister'
import { useCreateSale } from '@/hooks/useSales'
import { createSplitCreditSales, updateSaleInPlace } from '@/services/sales'
import { settleSaleDirect } from '@/services/clients'
import { logSorteoEntry } from '@/services/sorteos'
import { sendReceiptEmail, sendSettledEmail, sendMixedCreditEmail, sendSplitCreditEmail, sendInvoiceReceiptEmail } from '@/services/emailReceipt'
import { toast } from '@/components/ui/Toast'
import type { PaymentMethod, Employee } from '@/types'
import type { SaleSuccessData } from '@/components/modals/SaleSuccessModal'
import type { SplitCreditData } from '@/components/modals/CreditModal'
import type { ViewMode } from '@/components/molecules/ViewModeBar'
import type { CartSorteoResult } from '@/hooks/useSorteos'

interface UsePOSSaleParams {
    paymentMethod: PaymentMethod
    isMixed: boolean
    hasSinpeMixed: boolean
    hasEfectivoMixed: boolean
    hasCuentaMixed: boolean
    creditAmountNum: number
    creditClientId: string | null
    received: number
    splitAmountNum: number
    effectiveTotal: number
    mixedMethods: string[]
    activeOrderId: string | null
    selectedEmployee: Employee | null
    viewMode: ViewMode
    searchKbRef: React.RefObject<HTMLInputElement | null>
    cartSorteo: CartSorteoResult | null | undefined
    sorteoDeclined: boolean
    qualifyingCount: number
    onSaleSuccess: (data: SaleSuccessData) => void
    onPostSaleReset: () => void
    onCreditSplitComplete: () => void
}

export function usePOSSale(params: UsePOSSaleParams) {
    const { items, discount, invoiceClient, getSubtotal, getTotal, clearCart, setInvoiceClient, removeItems } = useCartStore()
    const { deleteOrder: deleteHeldOrder } = useHeldOrdersStore()
    const pendingDebt = usePendingSettleStore()
    const pendingSaleLoad = usePendingSaleLoadStore()
    const qc = useQueryClient()
    const { data: clients = [] } = useClients()
    const { data: config } = useBusinessConfig()
    const { data: activeRegister } = useActiveRegister()
    const createSale = useCreateSale()

    const [splitCreditPending, setSplitCreditPending] = useState(false)
    const processingRef = useRef(false)

    const handleSplitCreditConfirm = async (data: SplitCreditData) => {
        if (processingRef.current) return
        processingRef.current = true
        setSplitCreditPending(true)
        try {
            const sales = await createSplitCreditSales({
                clientAssignments: data.clientAssignments,
                cartItems: data.selectedCartItems,
                cashRegisterId: activeRegister?.id ?? null,
                cashierName: params.selectedEmployee?.name ?? null,
            })
            removeItems(data.selectedCartItems.map(i => i.id))
            qc.invalidateQueries({ queryKey: ['credit-sales'] })
            qc.invalidateQueries({ queryKey: ['active-register'] })
            pendingSaleLoad.clearModifying()
            params.onCreditSplitComplete()
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
                    cashier: params.selectedEmployee?.name ?? null,
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
                    cutType: tOpts.cutType ?? 'partial',
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
            processingRef.current = false
        }
    }

    const processSale = async ({ isCredit = false, clientId = null as string | null, method = params.paymentMethod, companyId = null as string | null } = {}) => {
        if (processingRef.current) return
        processingRef.current = true
        try {
            const saleItems = items
            const cartOnlyTotal = getTotal()
            const saleTotal = params.effectiveTotal
            const capturedSorteo = params.cartSorteo
            const capturedDeclined = params.sorteoDeclined
            const capturedQtyCount = params.qualifyingCount
            const saleSubtotal = getSubtotal()
            const saleDiscount = discount
            const saleReceived = params.received
            const saleCashier = params.selectedEmployee?.name ?? null
            const capturedDebt = pendingDebt.hasDebt ? { ...pendingDebt } : null
            const capturedIsMixed = params.isMixed && !isCredit
            const capturedHasSinpe = capturedIsMixed && params.mixedMethods.includes('SINPE')
            const capturedHasEfectivo = capturedIsMixed && params.mixedMethods.includes('EFECTIVO')
            const capturedHasCuenta = capturedIsMixed && params.mixedMethods.includes('CUENTA')
            const capturedCreditAmt = capturedHasCuenta ? params.creditAmountNum : 0
            const capturedCreditClientId = capturedHasCuenta ? params.creditClientId : null
            const capturedInvoiceClient = invoiceClient
            const capturedCreditCompanyId = companyId

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
                    if (failedSettles.length === capturedDebt.saleIds.length) return
                }
                pendingDebt.clear()
                qc.invalidateQueries({ queryKey: ['credit-sales'] })
                qc.invalidateQueries({ queryKey: ['active-register'] })

                if (capturedDebt.saleIds.length > 1 && window.electronAPI) {
                    try {
                        await window.electronAPI.dbExecute(
                            `UPDATE Sale SET settledSaleIds = ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?`,
                            [JSON.stringify(capturedDebt.saleIds), new Date().toISOString(), capturedDebt.saleIds[0]]
                        )
                    } catch {}
                }

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

                params.onSaleSuccess({
                    total: capturedDebt.debtTotal,
                    itemCount: debtItemCount,
                    items: debtItems,
                    cashier: saleCashier ?? 'Sin cajero',
                    paymentMethod: method,
                })
                if (params.activeOrderId) deleteHeldOrder(params.activeOrderId)
                clearCart()
                setInvoiceClient(null)
                params.onPostSaleReset()
                if (params.viewMode === 'scan') setTimeout(() => params.searchKbRef.current?.focus(), 50)

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
                        items: [],
                        debtSections: capturedDebt.sales.map((s: any) => ({
                            saleNumber: s.saleNumber,
                            date: s.date instanceof Date ? s.date.toISOString() : String(s.date),
                            items: (s.items ?? []).map((item: any) => ({
                                name: item.product?.name ?? item.name ?? 'Producto',
                                quantity: item.quantity,
                                unitPrice: item.unitPrice,
                                subtotal: item.subtotal,
                            })),
                            total: s.total,
                        })),
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
                        cutType: tOpts2.cutType ?? 'partial',
                    }).catch((err: any) => console.error('[POS] Auto-print error:', err))
                }
                return
            }

            const mainTotal = isCredit ? cartOnlyTotal : cartOnlyTotal - capturedCreditAmt
            const mainPaymentMethod = isCredit ? 'CREDITO' : capturedIsMixed
                ? (capturedHasEfectivo ? 'EFECTIVO' : 'SINPE')
                : method
            const mainPaymentMethod2 = capturedHasEfectivo && capturedHasSinpe ? 'SINPE' : null
            const mainAmount2 = capturedHasEfectivo && capturedHasSinpe ? params.splitAmountNum : null
            const paymentTotal = capturedDebt ? saleTotal - capturedCreditAmt : mainTotal
            const mainAmountReceived = isCredit ? null
                : capturedDebt ? null
                : capturedHasEfectivo ? saleReceived
                    : capturedHasSinpe ? paymentTotal
                        : (method === 'EFECTIVO' ? saleReceived : paymentTotal)
            const cashNeeded = paymentTotal - (capturedHasSinpe ? params.splitAmountNum : 0)
            const mainChange = isCredit ? 0
                : capturedDebt ? 0
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
                settledSaleIds: capturedDebt ? JSON.stringify(capturedDebt.saleIds) : null,
            }

            const capturedOriginalId = pendingSaleLoad.originalSaleId
            let sale: any
            if (capturedOriginalId) {
                const updated = await updateSaleInPlace(capturedOriginalId, saleInput)
                if (updated) {
                    sale = { ...updated, ...saleInput }
                    qc.invalidateQueries({ queryKey: ['products'] })
                    qc.invalidateQueries({ queryKey: ['sales'] })
                } else {
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
                        ...(capturedHasEfectivo ? { ef: Math.max(0, mainTotal - (capturedHasSinpe ? params.splitAmountNum : 0)) } : {}),
                        ...(capturedHasSinpe ? { sinpe: params.splitAmountNum } : {}),
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

            params.onSaleSuccess({
                total: saleTotal,
                itemCount: saleItems.reduce((s, i) => s + i.quantity, 0),
                items: [
                    ...saleItems.map(i => ({ name: i.product.name, quantity: i.quantity })),
                    ...(capturedDebt ? [{ name: `Abono deuda (${capturedDebt.clientName})`, quantity: 1 }] : []),
                ],
                cashier: saleCashier ?? 'Sin cajero',
                paymentMethod: isCredit ? 'CREDITO' : method,
            })
            if (params.activeOrderId) deleteHeldOrder(params.activeOrderId)
            const depleted = saleItems.filter(i => !i.product.isInfinite && i.product.stockQty - i.quantity <= 0)
            if (depleted.length > 0)
                sileo.warning({
                    title: depleted.length === 1 ? 'Producto agotado' : `${depleted.length} productos agotados`,
                    description: (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {depleted.slice(0, 3).map(i => (
                                <div key={i.product.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                    padding: '5px 10px', borderRadius: 8,
                                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.14)',
                                }}>
                                    <span style={{ fontSize: 11, color: '#CBD5E1', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {i.product.name}
                                    </span>
                                    <span style={{
                                        fontSize: 9, background: 'rgba(239,68,68,0.18)', color: '#FCA5A5',
                                        padding: '2px 8px', borderRadius: 99, fontWeight: 800, letterSpacing: '0.1em',
                                        border: '1px solid rgba(239,68,68,0.28)', flexShrink: 0,
                                    }}>AGOTADO</span>
                                </div>
                            ))}
                            {depleted.length > 3 && (
                                <div style={{ fontSize: 10, color: '#6B7280', paddingLeft: 4 }}>+{depleted.length - 3} producto{depleted.length - 3 > 1 ? 's' : ''} más</div>
                            )}
                        </div>
                    ),
                    position: 'top-right',
                })
            clearCart()
            pendingSaleLoad.clearModifying()
            setInvoiceClient(null)
            params.onPostSaleReset()
            if (params.viewMode === 'scan') setTimeout(() => params.searchKbRef.current?.focus(), 50)

            if (capturedDebt && capturedDebt.saleIds.length > 0) {
                const settleFailures: string[] = []
                for (const id of capturedDebt.saleIds) {
                    try {
                        await settleSaleDirect(id, {
                            paymentMethod: method,
                            cashRegisterId: activeRegister?.id ?? null,
                            amountReceived: null,
                            change: null,
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

            if (capturedSorteo && !capturedDeclined) {
                await logSorteoEntry({ sorteoId: capturedSorteo.sorteo.id, didParticipate: false, unitCount: capturedQtyCount })
                qc.invalidateQueries({ queryKey: ['sorteoStats', capturedSorteo.sorteo.id] })
            }

            const printerPort = config?.printerPort || config?.printerModel || localStorage.getItem('pos_printer_port')
            if (!printerPort && window.electronAPI) {
                sileo.warning({
                    title: 'Sin impresora',
                    description: (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{
                                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                                borderRadius: 10, padding: '9px 12px',
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                <span style={{ fontSize: 15 }}>🖨️</span>
                                <div style={{ fontSize: 12, color: '#FCD34D', fontWeight: 600, lineHeight: 1.3 }}>
                                    No se imprimirá ticket
                                </div>
                            </div>
                            <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                                No se detecta impresora. Ve a Ajustes → Impresora para configurarla.
                            </div>
                        </div>
                    ),
                    position: 'top-right',
                })
            }
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
                    items: saleItems.map(i => ({
                        name: i.product.name,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                        subtotal: i.subtotal,
                    })),
                    debtSections: capturedDebt ? capturedDebt.sales.map((s: any) => ({
                        saleNumber: s.saleNumber,
                        date: s.date instanceof Date ? s.date.toISOString() : String(s.date),
                        items: (s.items ?? []).map((item: any) => ({
                            name: item.product?.name ?? item.name ?? 'Producto',
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            subtotal: item.subtotal,
                        })),
                        total: s.total,
                    })) : undefined,
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
                    cutType: tOpts.cutType ?? 'partial',
                }).then(r => {
                    if (!r.success) sileo.error({
                        title: 'Error de impresora',
                        description: (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{
                                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                    borderRadius: 10, padding: '8px 12px',
                                }}>
                                    <div style={{ fontSize: 9, color: '#EF4444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Detalles del error</div>
                                    <div style={{ fontSize: 11, color: '#FCA5A5', lineHeight: 1.4 }}>{r.error || 'Error desconocido'}</div>
                                </div>
                                <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                                    Verifica que la impresora esté encendida y conectada por USB
                                </div>
                            </div>
                        ),
                        position: 'top-right',
                    })
                }).catch(() => sileo.error({
                    title: 'Error de impresora',
                    description: (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{
                                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                borderRadius: 10, padding: '8px 12px',
                            }}>
                                <div style={{ fontSize: 9, color: '#EF4444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Sin conexión</div>
                                <div style={{ fontSize: 11, color: '#FCA5A5', lineHeight: 1.4 }}>No se pudo comunicar con la impresora</div>
                            </div>
                            <div style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5 }}>
                                Verifica que esté encendida y conectada por USB
                            </div>
                        </div>
                    ),
                    position: 'top-right',
                }))
            }

            if (isCredit && clientId) {
                const client = clients.find(c => c.id === clientId)
                if (client?.email) {
                    sileo.promise(
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
                        }).then(r => { if (!r.success) throw r; return r }),
                        {
                            loading: { title: 'Enviando recibo...', description: client.email, position: 'top-right' },
                            success: {
                                title: 'Recibo enviado',
                                description: (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 2 }}>
                                        <span style={{ color: '#10B981' }}>✓</span>
                                        <span style={{ color: '#7A8FAA' }}>{client.email}</span>
                                    </span>
                                ),
                                position: 'top-right' as const,
                            },
                            error: (err: any) => ({
                                title: err?.isVerificationError ? 'Dominio no verificado' : 'Error al enviar recibo',
                                description: err?.isVerificationError ? 'Configura el dominio en Resend' : (err?.error ?? ''),
                                position: 'top-right' as const,
                            }),
                        }
                    )
                }
            }

            if (!isCredit && capturedInvoiceClient) {
                const invoiceFull = capturedInvoiceClient.existingId
                    ? clients.find(c => c.id === capturedInvoiceClient.existingId)
                    : null
                const recipientEmail = capturedInvoiceClient.email.trim() || invoiceFull?.email || null
                const recipientName = capturedInvoiceClient.name
                const debtSalesPayload = capturedDebt ? capturedDebt.sales.map((s: any) => ({
                    saleNumber: s.saleNumber,
                    date: s.date instanceof Date ? s.date.toISOString() : String(s.date),
                    items: (s.items ?? []).map((item: any) => ({
                        name: item.product?.name ?? item.name ?? 'Producto',
                        quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal,
                    })),
                    subtotal: s.subtotal, discount: s.discount ?? 0, total: s.total,
                })) : null
                if (recipientEmail) {
                    if (capturedDebt && debtSalesPayload) {
                        sendSettledEmail({
                            to: recipientEmail,
                            clientName: recipientName,
                            businessName: config?.name ?? 'Mi Soda',
                            logoUrl: config?.emailLogoUrl,
                            sales: debtSalesPayload,
                            newSale: {
                                saleNumber: sale.saleNumber,
                                items: saleItems.map(i => ({ name: i.product.name, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
                                subtotal: saleSubtotal, discount: saleDiscount, total: cartOnlyTotal,
                                paymentMethod: method,
                            },
                        }).then(result => {
                            if (result.success) toast.success(`Recibo enviado a ${recipientEmail}`)
                            else if (result.isVerificationError) toast.error('Dominio de correo no verificado.')
                            else toast.error(`Error al enviar recibo: ${result.error}`)
                        }).catch(() => {})
                    } else {
                        const invoicePayload = {
                            clientName: recipientName,
                            businessName: config?.name ?? 'Mi Soda',
                            saleNumber: sale.saleNumber,
                            date: sale.date,
                            items: saleItems.map(i => ({ name: i.product.name, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal })),
                            subtotal: saleSubtotal, discount: saleDiscount, total: cartOnlyTotal,
                            paymentMethod: method,
                            logoUrl: config?.emailLogoUrl,
                        }
                        sendInvoiceReceiptEmail({ to: recipientEmail, ...invoicePayload }).then(result => {
                            if (result.success) toast.success(`Recibo enviado a ${recipientEmail}`)
                            else if (result.isVerificationError) toast.error('Dominio de correo no verificado. Configura el dominio en Resend.')
                            else toast.error(`Error al enviar recibo: ${result.error}`)
                        }).catch(() => {})
                        for (const ccAddr of capturedInvoiceClient.ccEmails ?? []) {
                            const trimmed = ccAddr.trim()
                            if (trimmed) sendInvoiceReceiptEmail({ to: trimmed, ...invoicePayload }).catch(() => {})
                        }
                    }
                }
            }
        } catch (err) { console.error(err) }
        finally { processingRef.current = false }
    }

    return { processSale, splitCreditPending, handleSplitCreditConfirm }
}
