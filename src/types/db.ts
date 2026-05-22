/**
 * Raw DB row shapes as returned by SQLite IPC / Supabase REST.
 * Dates are strings, SQLite booleans are 0/1.
 * These are NOT the app domain types (src/types/index.ts) — those have Date objects and nested relations.
 */

export type SqlParam = string | number | boolean | null

export interface DbSaleRow {
    id: string
    saleNumber: number
    date: string
    subtotal: number
    discount: number
    total: number
    paymentMethod: string
    paymentMethod2: string | null
    amount2: number | null
    amountReceived: number | null
    change: number | null
    cashRegisterId: string | null
    isCredit: number | boolean
    clientId: string | null
    companyId: string | null
    consumerName: string | null
    physicalInvoiceNumber: string | null
    status: string
    notes: string | null
    syncStatus: string
    originalSaleSnapshot: string | null
    modifiedFromSaleId: string | null
    paidAt: string | null
    updatedAt: string
}

export interface DbSaleRowForUpdate extends DbSaleRow {
    origTotal: number
    origIsCredit: number | boolean
}

export interface DbSaleItemRow {
    id: string
    saleId: string
    productId: string
    quantity: number
    unitPrice: number
    subtotal: number
    notes: string | null
    productName?: string
}

export interface DbProductRow {
    id: string
    name: string
    barcode: string | null
    categoryId: string
    subcategoryId: string | null
    price: number
    cost: number
    unit: string
    stockQty: number
    minStock: number
    isActive: number | boolean
    isInfinite: number | boolean
    isDeleted: number | boolean
    imageUrl: string | null
    syncStatus: string
    updatedAt: string
}

export interface DbClientRow {
    id: string
    name: string
    phone: string | null
    email: string | null
    type: string
    company: string | null
    companyId: string | null
    notes: string | null
    code: string | null
    cedula: string | null
    isActive: number | boolean
    syncStatus: string
    updatedAt: string
}

export interface DbCompanyRow {
    id: string
    name: string
    taxId: string | null
    billingEmail: string | null
    phone: string | null
    notes: string | null
    isActive: number | boolean
    syncStatus: string
    updatedAt: string
}

export interface DbEmployeeRow {
    id: string
    name: string
    role: string
    pin: string | null
    isActive: number | boolean
    monthlySales: number
    lastResetMonth: string | null
    syncStatus: string
    updatedAt: string
}

export interface DbCashRegisterRow {
    id: string
    openedAt: string
    closedAt: string | null
    initialAmount: number
    finalAmount: number | null
    salesCash: number | null
    salesCard: number | null
    salesSinpe: number | null
    salesTransfer: number | null
    salesCredit: number | null
    expensesTotal: number | null
    notes: string | null
    status: string
    syncStatus: string
    updatedAt: string
}

export interface DbCategoryRow {
    id: string
    name: string
    type: string
    icon: string | null
    sortOrder: number
    isActive: number | boolean
    syncStatus?: string
    updatedAt: string
}

export interface DbSubcategoryRow {
    id: string
    categoryId: string
    name: string
    showDays: string | null
    sortOrder: number
    isActive: number | boolean
    syncStatus: string
    updatedAt: string
}

export interface DbPaymentRow {
    id: string
    clientId: string
    amount: number
    method: string
    reference: string | null
    notes: string | null
    date: string
    syncStatus: string
}

export interface DbInventoryMovementRow {
    id: string
    productId: string
    type: string
    quantity: number
    cost: number | null
    reference: string | null
    notes: string | null
    date: string
    syncStatus: string
}

export interface DbExpenseRow {
    id: string
    description: string
    amount: number
    categoryId: string
    supplier: string | null
    date: string
    notes: string | null
    cashRegisterId: string | null
    syncStatus: string
    updatedAt: string
}

export interface DbSinpeMessageRow {
    id: string
    sender: string
    body: string
    receivedAt: string
    isRead: number | boolean
    deletedAt: string | null
    syncStatus: string
}

export interface DbBusinessConfigRow {
    id: string
    name: string
    address: string | null
    phone: string | null
    ticketHeader: string | null
    ticketFooter: string | null
    printerPort: string | null
    printerModel: string | null
    drawerEnabled: number | boolean
    syncStatus: string
    updatedAt: string
}

export interface DbProductSubcategoryRow {
    productId: string
    subcategoryId: string
}

export interface DbEmailQueueRow {
    id: string
    recipient: string
    subject: string
    body: string
    status: string
    attempts: number
    lastError: string | null
}

export interface SaleSnapshotEntry {
    saleNumber: number
    items: { name: string; quantity: number; unitPrice: number; subtotal: number }[]
    subtotal: number
    discount: number
    total: number
    date: string | null
    cashier: string | null
    modifiedAt: string
}

export interface DbSorteoRow {
    id: string
    name: string
    type: string
    status: string
    startAt: string | null
    endAt: string | null
    minSpinsBetweenPrizes: number
    totalCards: number | null
    prizeCount: number | null
    slotsPerCard: number | null
    cardSkin: string | null
    totalNumbers: number | null
    pricePerNumber: number | null
    sellStartDate: string | null
    sellEndDate: string | null
    drawDate: string | null
    tombPrizes: string | null
    syncStatus: string
    createdAt: string
    updatedAt: string
}

export interface DbTombolaEntryRow {
    id: string
    sorteoId: string
    number: number
    participantName: string
    participantCedula: string
    participantEmail: string | null
    paymentMethod: string
    price: number
    saleRegisteredAt: string | null
    isWinner: number
    prizePosition: number | null
    syncStatus: string
    createdAt: string
    updatedAt: string
}

export interface CompanySaleView {
    id: string
    saleNumber: number
    date: string
    subtotal: number
    discount: number
    total: number
    paymentMethod: string
    isCredit: boolean
    companyId: string | null
    consumerName: string | null
    physicalInvoiceNumber: string | null
    status: string
    notes: string | null
    originalSaleSnapshot: string | null
    paidAt: string | null
    items: { productName: string; quantity: number; unitPrice: number; subtotal: number }[]
}
