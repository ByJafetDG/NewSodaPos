export type AppPage =
    | 'pos'
    | 'inventory'
    | 'balances'
    | 'reports'
    | 'cash-register'
    | 'sorteos'
    | 'returns'
    | 'settings'
    | 'ai-assistant'

export interface SyncInfo {
    isOnline: boolean
    pendingCount: number
    lastSync: Date | null
    isSyncing: boolean
}

export type CategoryType = 'PRODUCTO' | 'MENU' | 'BUFFET' | 'INGREDIENTE'
export interface Category {
    id: string; name: string; type: CategoryType; icon: string | null
    sortOrder: number; isActive: boolean; isDeleted?: boolean; createdAt: Date; updatedAt: Date
}

export interface Subcategory {
    id: string; categoryId: string; name: string
    showDays: number[] | null  // 0=Dom,1=Lun..6=Sab; null=siempre
    sortOrder: number; isActive: boolean; syncStatus: SyncStatus; createdAt: Date; updatedAt: Date
}

export type ProductUnit = 'UNIDAD' | 'KG' | 'LITRO' | 'PORCION'
export type SyncStatus = 'PENDING' | 'SYNCED' | 'ERROR'
export interface Product {
    id: string; name: string; barcode: string | null; categoryId: string
    subcategoryIds?: string[]; category?: Category; price: number; cost: number; unit: ProductUnit
    stockQty: number; minStock: number; isActive: boolean; isInfinite: boolean
    isDeleted?: boolean; imageUrl: string | null; syncStatus: SyncStatus; createdAt: Date; updatedAt: Date
}

export interface Company {
    id: string; name: string; billingEmail: string | null; phone: string | null
    notes: string | null; isActive: boolean; syncStatus: SyncStatus
    createdAt: Date; updatedAt: Date
}

export type ClientType = 'TRABAJADOR' | 'ASOCIACION' | 'GENERAL'
export interface Client {
    id: string; name: string; phone: string | null; email: string | null
    type: ClientType; company: string | null; companyId: string | null
    notes: string | null; code: string | null; cedula: string | null
    isActive: boolean; syncStatus: SyncStatus; createdAt: Date; updatedAt: Date
}

export type PaymentMethod = 'EFECTIVO' | 'TARJETA' | 'SINPE' | 'TRANSFERENCIA' | 'CREDITO' | 'DEPOSITO'
export type SaleStatus = 'COMPLETADA' | 'ANULADA'
export interface SaleItem {
    id: string; saleId: string; productId: string; product?: Product
    quantity: number; unitPrice: number; subtotal: number; notes: string | null; createdAt: Date
}
export interface Sale {
    id: string; saleNumber: number; date: Date; subtotal: number; discount: number
    total: number; paymentMethod: PaymentMethod; amountReceived: number | null
    change: number | null; cashRegisterId: string | null; isCredit: boolean
    clientId: string | null; client?: Client; items: SaleItem[]; status: SaleStatus
    notes: string | null; syncStatus: SyncStatus; createdAt: Date; updatedAt: Date
    paymentMethod2?: PaymentMethod | null; amount2?: number | null
    paidAt?: string | null; companyId?: string | null; consumerName?: string | null
}

export interface CartItem {
    id: string; product: Product; quantity: number; unitPrice: number
    subtotal: number; notes: string | null
}

export interface HeldOrderDebt {
    clientId: string
    clientName: string
    saleIds: string[]
    debtTotal: number
    sales: Sale[]
}

export interface HeldOrderInvoiceClient {
    name: string; cedula: string; email: string
    ccEmails?: string[]; existingId?: string; companyId?: string; consumerName?: string
    physicalInvoiceNumber?: string
}

export interface HeldOrder {
    id: string
    name: string
    items: CartItem[]
    discount: number
    savedAt: string
    pendingDebt?: HeldOrderDebt
    invoiceClient?: HeldOrderInvoiceClient | null
}

export type EmployeeRole = 'CAJERO' | 'DUEÑO' | 'COCINERO' | 'TEMPORAL'
export interface Employee {
    id: string; name: string; role: EmployeeRole; pin: string | null
    monthlySales?: number; lastResetMonth?: string | null
    activeFrom?: string | null; activeTo?: string | null
    isActive: boolean; createdAt: Date; updatedAt: Date
}

export type MovementType = 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'VENTA'
export interface InventoryMovement {
    id: string; productId: string; product?: Product; type: MovementType
    quantity: number; cost: number | null; reference: string | null
    notes: string | null; date: Date; syncStatus: SyncStatus; createdAt: Date
}

export type CashRegisterStatus = 'OPEN' | 'CLOSED'
export interface CashRegister {
    id: string; openedAt: Date; closedAt: Date | null; initialAmount: number
    finalAmount: number | null; salesCash: number | null; salesCard: number | null
    salesSinpe: number | null; salesTransfer: number | null; salesCredit: number | null
    expensesTotal: number | null; notes: string | null; status: CashRegisterStatus
    syncStatus: SyncStatus; createdAt: Date; updatedAt: Date
}

export interface BusinessConfig {
    id: string; name: string; address: string | null; phone: string | null
    ticketHeader: string | null; ticketFooter: string | null; printerPort: string | null
    printerModel: string | null; drawerEnabled: boolean; modalsKeyboardEnabled: boolean
    createdAt: Date; updatedAt: Date
}

export type ReturnType = 'DEVOLUCION' | 'CAMBIO'
export type ReturnDirection = 'IN' | 'OUT'
export interface ReturnItem {
    id: string; returnId: string; direction: ReturnDirection
    productId: string; productName: string
    quantity: number; unitPrice: number; subtotal: number
}
export interface ReturnRecord {
    id: string; returnNumber: number
    originalSaleId: string | null; originalSaleNumber: number | null
    type: ReturnType; cashRegisterId: string | null
    netCash: number; employeeName: string | null; notes: string | null
    items: ReturnItem[]; date: Date; syncStatus: string
}

export type SorteoType = 'RULETA'
export type SorteoStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED'
export interface Sorteo {
    id: string; name: string; type: SorteoType; status: SorteoStatus
    startAt: Date | null; endAt: Date | null
    minSpinsBetweenPrizes: number
    syncStatus: SyncStatus; createdAt: Date; updatedAt: Date
}

export interface SorteoOption {
    id: string; sorteoId: string; label: string; description: string | null
    quantity: number | null; quantityRemaining: number | null
    baseProbability: number; isFiller: boolean; color: string | null
    sortOrder: number; syncStatus: SyncStatus
}

export type SorteoParticipantType = 'PRODUCT' | 'CATEGORY'
export interface SorteoParticipant {
    id: string; sorteoId: string; type: SorteoParticipantType; refId: string
    syncStatus: SyncStatus
}

export interface SorteoEntry {
    id: string; sorteoId: string; saleId: string | null
    participatedAt: Date; didParticipate: boolean; unitCount: number
    resultOptionId: string | null; syncStatus: SyncStatus
}

export interface SorteoStats {
    total: number; participated: number; declined: number
    optionCounts: { optionId: string; label: string; count: number }[]
}

export interface SorteoWinner {
    id: string; sorteoId: string; optionId: string
    optionLabel: string; optionColor: string | null
    wonAt: Date; syncStatus: SyncStatus
}
