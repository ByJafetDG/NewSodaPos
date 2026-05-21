import { useState } from 'react'
import { Package, ArrowDownToLine } from 'lucide-react'
import { sileo } from 'sileo'
import { ProductsTable } from '@/components/organisms/inventory/ProductsTable'
import { StockEntryPanel } from '@/components/organisms/inventory/StockEntryPanel'
import { MovementsPanel } from '@/components/organisms/inventory/MovementsPanel'
import type { MovementBatch } from '@/components/organisms/inventory/MovementsPanel'
import { ProductFormModal } from '@/components/modals/ProductFormModal'
import { ScanBufferModal } from '@/components/modals/ScanBufferModal'
import { ManageCategoriesModal } from '@/components/modals/ManageCategoriesModal'
import { MovementDetailModal } from '@/components/modals/MovementDetailModal'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/useProducts'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useCategories'
import { useSubcategories } from '@/hooks/useSubcategories'
import { useInventoryMovements, useCreateMovementBatch, useUpdateMovement, useDeleteMovement } from '@/hooks/useInventory'
import type { InventoryMovement } from '@/types'
import { cn } from '@/lib/utils'
import type { Product, Category } from '@/types'

type MainTab = 'products' | 'entry'
type EntrySubTab = 'ingresar' | 'movimientos'

export function InventoryPage() {
    const { data: products = [] } = useProducts(false)
    const { data: categories = [] } = useCategories()
    const { data: allCategories = [] } = useCategories(false)
    const { data: subcategories = [] } = useSubcategories()
    const { data: movements = [] } = useInventoryMovements()

    const createProduct = useCreateProduct()
    const updateProduct = useUpdateProduct()
    const deleteProduct = useDeleteProduct()
    const createCategory = useCreateCategory()
    const updateCategory = useUpdateCategory()
    const deleteCategory = useDeleteCategory()
    const createMovementBatch = useCreateMovementBatch()
    const updateMovement = useUpdateMovement()
    const deleteMovement = useDeleteMovement()

    const [mainTab, setMainTab] = useState<MainTab>('products')
    const [entrySubTab, setEntrySubTab] = useState<EntrySubTab>('ingresar')

    const [productFormOpen, setProductFormOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [manageCatOpen, setManageCatOpen] = useState(false)
    const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)
    const [deletingCategory, setDeletingCategory] = useState<Category | null>(null)
    const [selectedBatch, setSelectedBatch] = useState<MovementBatch | null>(null)
    const [inventoryScanBuffer, setInventoryScanBuffer] = useState<string | null>(null)
    const [createBarcode, setCreateBarcode] = useState('')

    function handleNewProduct() {
        setEditingProduct(null)
        setCreateBarcode('')
        setProductFormOpen(true)
    }

    function handleSearchEnter(barcode: string, found: boolean) {
        if (inventoryScanBuffer !== null) {
            setInventoryScanBuffer(null)
            if (!found) {
                setEditingProduct(null)
                setCreateBarcode(barcode)
                setProductFormOpen(true)
            }
        } else if (!found) {
            setInventoryScanBuffer(barcode)
        }
    }

    function handleEditProduct(p: Product) {
        setEditingProduct(p)
        setProductFormOpen(true)
    }

    async function handleProductFormConfirm(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) {
        if (editingProduct) {
            await updateProduct.mutateAsync({ id: editingProduct.id, input: data })
        } else {
            await createProduct.mutateAsync(data)
        }
        setProductFormOpen(false)
        setEditingProduct(null)
    }

    async function handleToggleProduct(p: Product) {
        await updateProduct.mutateAsync({ id: p.id, input: { isActive: !p.isActive } })
    }

    async function handleDeleteProductConfirm() {
        if (!deletingProduct) return
        const name = deletingProduct.name
        const result = await deleteProduct.mutateAsync(deletingProduct.id)
        setDeletingProduct(null)
        if (result?.soft) {
            sileo.success({ title: `"${name}" fue archivado porque tiene ventas registradas`, position: 'top-right' })
        }
    }

    async function handleDeleteCategoryConfirm() {
        if (!deletingCategory) return
        await deleteCategory.mutateAsync(deletingCategory.id)
        setDeletingCategory(null)
    }

    async function handleConfirmEntry(
        entries: Array<{ productId: string; product: Product; qty: number }>,
        notes: string
    ) {
        const batchRef = crypto.randomUUID()
        const totalUnits = entries.reduce((s, e) => s + e.qty, 0)
        await createMovementBatch.mutateAsync({
            entries: entries.map(e => ({ productId: e.productId, qty: e.qty })),
            batchRef,
            notes: notes || undefined,
        })
        setEntrySubTab('movimientos')
        sileo.success({
            title: 'Ingreso confirmado',
            description: (
                <div style={{ marginTop: 8 }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.05) 100%)',
                        border: '1px solid rgba(16,185,129,0.26)', borderRadius: 10, padding: '12px 14px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 7px 2px rgba(16,185,129,0.65)', display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 9, color: '#10B981', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Inventario actualizado</span>
                        </div>
                        <div style={{ display: 'flex', gap: 20, marginBottom: notes ? 10 : 0 }}>
                            <div>
                                <div style={{ fontSize: 9, color: '#6B7280', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 2 }}>Productos</div>
                                <div style={{ fontSize: 20, color: '#34D399', fontWeight: 800, fontFamily: 'monospace' }}>{entries.length}</div>
                            </div>
                            <div style={{ width: 1, background: 'rgba(16,185,129,0.15)' }} />
                            <div>
                                <div style={{ fontSize: 9, color: '#6B7280', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 2 }}>Unidades</div>
                                <div style={{ fontSize: 20, color: '#34D399', fontWeight: 800, fontFamily: 'monospace' }}>+{totalUnits}</div>
                            </div>
                        </div>
                        {notes && (
                            <div style={{ fontSize: 10, color: '#6B7280', borderTop: '1px solid rgba(16,185,129,0.12)', paddingTop: 6 }}>"{notes}"</div>
                        )}
                    </div>
                </div>
            ),
            position: 'top-right',
        })
    }

    async function handleUpdateMovementQty(mv: InventoryMovement, newQty: number) {
        const oldQty = mv.quantity
        await updateMovement.mutateAsync({ id: mv.id, newQty, type: mv.type, productId: mv.productId, oldQty })
        const productName = products.find(p => p.id === mv.productId)?.name ?? 'Producto'
        sileo.success({
            title: 'Cantidad actualizada',
            description: (
                <div style={{ marginTop: 8 }}>
                    <div style={{
                        display: 'flex', alignItems: 'stretch',
                        background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
                    }}>
                        <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#4B5563', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 4 }}>Antes</div>
                            <div style={{ fontSize: 20, color: '#6B7280', fontWeight: 800, fontFamily: 'monospace' }}>+{oldQty}</div>
                        </div>
                        <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
                        <div style={{ flex: 1, padding: '10px 12px', textAlign: 'center', background: 'rgba(16,185,129,0.06)' }}>
                            <div style={{ fontSize: 9, color: '#10B981', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 4 }}>Ahora</div>
                            <div style={{ fontSize: 20, color: '#34D399', fontWeight: 800, fontFamily: 'monospace' }}>+{newQty}</div>
                        </div>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 10, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {productName}
                    </div>
                </div>
            ),
            position: 'top-right',
        })
    }

    async function handleDeleteMovement(mv: InventoryMovement) {
        const productName = products.find(p => p.id === mv.productId)?.name ?? 'Producto'
        await deleteMovement.mutateAsync({ id: mv.id, type: mv.type, quantity: mv.quantity, productId: mv.productId })
        setSelectedBatch(prev => {
            if (!prev) return null
            const remaining = prev.movements.filter(m => m.id !== mv.id)
            return remaining.length === 0 ? null : { ...prev, movements: remaining }
        })
        sileo.success({
            title: 'Movimiento eliminado',
            description: (
                <div style={{ marginTop: 6 }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(220,38,38,0.03) 100%)',
                        border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 12px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 7px 2px rgba(239,68,68,0.55)', display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ fontSize: 9, color: '#EF4444', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Stock revertido</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#D1D5DB', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginBottom: 3 }}>
                            {productName}
                        </div>
                        <div style={{ fontSize: 10, color: '#6B7280' }}>−{mv.quantity} unidades revertidas del stock</div>
                    </div>
                </div>
            ),
            position: 'top-right',
        })
    }

    return (
        <div className="flex flex-col h-full">
            {/* ── Main tabs ───────────────────────────────────────────────── */}
            <div className="flex items-center border-b border-[#192030] shrink-0 bg-[#0B0E19]/60 px-3 pt-1">
                <TabBtn
                    active={mainTab === 'products'}
                    icon={<Package size={14} />}
                    label="Productos"
                    onClick={() => setMainTab('products')}
                />
                <TabBtn
                    active={mainTab === 'entry'}
                    icon={<ArrowDownToLine size={14} />}
                    label="Ingresar Mercadería"
                    onClick={() => setMainTab('entry')}
                />
            </div>

            {/* ── Tab: Productos ───────────────────────────────────────────── */}
            {mainTab === 'products' && (
                <div className="flex-1 min-h-0 overflow-hidden">
                    <ProductsTable
                        products={products}
                        categories={categories}
                        subcategories={subcategories}
                        onNew={handleNewProduct}
                        onEdit={handleEditProduct}
                        onDelete={p => setDeletingProduct(p)}
                        onToggle={handleToggleProduct}
                        onManageCategories={() => setManageCatOpen(true)}
                        onSearchEnter={handleSearchEnter}
                    />
                </div>
            )}

            {/* ── Tab: Ingresar Mercadería ─────────────────────────────────── */}
            {mainTab === 'entry' && (
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex items-center gap-1 px-4 py-2 border-b border-[#192030] shrink-0">
                        <SubTabBtn
                            active={entrySubTab === 'ingresar'}
                            label="Ingresar"
                            onClick={() => setEntrySubTab('ingresar')}
                        />
                        <SubTabBtn
                            active={entrySubTab === 'movimientos'}
                            label="Movimientos"
                            onClick={() => setEntrySubTab('movimientos')}
                        />
                    </div>

                    <div className="flex-1 min-h-0 overflow-hidden">
                        {entrySubTab === 'ingresar' ? (
                            <StockEntryPanel
                                products={products}
                                onConfirm={handleConfirmEntry}
                                isPending={createMovementBatch.isPending}
                                onProductNotFound={b => { setEditingProduct(null); setCreateBarcode(b); setProductFormOpen(true) }}
                            />
                        ) : (
                            <MovementsPanel
                                movements={movements}
                                products={products}
                                onOpenBatch={setSelectedBatch}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* ── Modals ──────────────────────────────────────────────────── */}
            <ProductFormModal
                isOpen={productFormOpen}
                onClose={() => { setProductFormOpen(false); setEditingProduct(null); setCreateBarcode('') }}
                onConfirm={handleProductFormConfirm}
                product={editingProduct}
                categories={categories}
                isPending={createProduct.isPending || updateProduct.isPending}
                initialBarcode={editingProduct ? undefined : createBarcode}
            />

            <ManageCategoriesModal
                isOpen={manageCatOpen}
                onClose={() => setManageCatOpen(false)}
                categories={allCategories}
                onCreate={data => createCategory.mutateAsync(data)}
                onUpdate={(id, data) => updateCategory.mutateAsync({ id, ...data })}
                onDelete={cat => { setManageCatOpen(false); setDeletingCategory(cat) }}
            />

            <MovementDetailModal
                isOpen={selectedBatch !== null}
                onClose={() => setSelectedBatch(null)}
                batch={selectedBatch}
                products={products}
                onUpdateQty={handleUpdateMovementQty}
                onDelete={handleDeleteMovement}
            />

            <DeleteConfirmModal
                isOpen={deletingProduct !== null}
                onClose={() => setDeletingProduct(null)}
                onConfirm={handleDeleteProductConfirm}
                title="Eliminar producto"
                description={`¿Eliminar "${deletingProduct?.name}"? Esta acción no se puede deshacer.`}
                isPending={deleteProduct.isPending}
            />

            <DeleteConfirmModal
                isOpen={deletingCategory !== null}
                onClose={() => setDeletingCategory(null)}
                onConfirm={handleDeleteCategoryConfirm}
                title="Eliminar categoría"
                description={`¿Eliminar la categoría "${deletingCategory?.name}"? La categoría quedará oculta del sistema pero los productos existentes no se verán afectados.`}
                isPending={deleteCategory.isPending}
            />

            <ScanBufferModal
                isOpen={inventoryScanBuffer !== null}
                barcode={inventoryScanBuffer ?? ''}
                onClose={() => setInventoryScanBuffer(null)}
                onExpire={() => {
                    const barcode = inventoryScanBuffer
                    setInventoryScanBuffer(null)
                    if (barcode) {
                        setEditingProduct(null)
                        setCreateBarcode(barcode)
                        setProductFormOpen(true)
                    }
                }}
            />

        </div>
    )
}

function TabBtn({ active, icon, label, onClick }: {
    active: boolean
    icon: React.ReactNode
    label: string
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all cursor-pointer',
                active
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-[#3D506A] hover:text-[#7A8FAA]'
            )}
        >
            {icon}
            {label}
        </button>
    )
}

function SubTabBtn({ active, label, onClick }: {
    active: boolean
    label: string
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'px-3 h-7 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
                active
                    ? 'bg-orange-500/15 text-orange-400'
                    : 'text-[#3D506A] hover:text-[#7A8FAA] hover:bg-[#1C2438]'
            )}
        >
            {label}
        </button>
    )
}
