export type AppPage =
    | 'pos'
    | 'inventory'
    | 'balances'
    | 'reports'
    | 'cash-register'
    | 'settings'

export interface SyncInfo {
    isOnline: boolean
    pendingCount: number
    lastSync: Date | null
    isSyncing: boolean
}

export type CategoryType = 'PRODUCTO' | 'MENU' | 'BUFFET' | 'INGREDIENTE'
export interface Category {
    id: string; name: string; type: CategoryType; icon: string | null
    sortOrder: number; isActive: boolean; createdAt: Date; updatedAt: Date
}

export type ProductUnit = 'UNIDAD' | 'KG' | 'LITRO' | 'PORCION'
export type SyncStatus = 'PENDING' | 'SYNCED' | 'ERROR'
export interface Product {
    id: string; name: string; barcode: string | null; categoryId: string
    category?: Category; price: number; cost: number; unit: ProductUnit
    stockQty: number; minStock: number; isActive: boolean; isInfinite: boolean
    imageUrl: string | null; syncStatus: SyncStatus; createdAt: Date; updatedAt: Date
}

export type ClientType = 'TRABAJADOR' | 'ASOCIACION' | 'GENERAL'
export interface Client {
    id: string; name: string; phone: string | null; email: string | null
    type: ClientType; company: string | null; notes: string | null; code: string | null
    isActive: boolean; syncStatus: SyncStatus; createdAt: Date; updatedAt: Date
}

export type PaymentMethod = 'EFECTIVO' | 'TARJETA' | 'SINPE' | 'TRANSFERENCIA' | 'CREDITO'
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
}

export interface CartItem {
    id: string; product: Product; quantity: number; unitPrice: number
    subtotal: number; notes: string | null
}

export interface HeldOrder {
    id: string
    name: string
    items: CartItem[]
    discount: number
    savedAt: string
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
