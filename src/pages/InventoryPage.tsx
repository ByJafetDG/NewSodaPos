import { useState } from 'react'
import { Package, ArrowDownToLine } from 'lucide-react'
import { ProductsTable } from '@/components/organisms/inventory/ProductsTable'
import { StockEntryPanel } from '@/components/organisms/inventory/StockEntryPanel'
import { MovementsPanel } from '@/components/organisms/inventory/MovementsPanel'
import type { MovementBatch } from '@/components/organisms/inventory/MovementsPanel'
import { ProductFormModal } from '@/components/modals/ProductFormModal'
import { ManageCategoriesModal } from '@/components/modals/ManageCategoriesModal'
import { MovementDetailModal } from '@/components/modals/MovementDetailModal'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/useProducts'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useCategories'
import { useInventoryMovements, useCreateMovementBatch, useUpdateMovement, useDeleteMovement } from '@/hooks/useInventory'
import type { InventoryMovement } from '@/types'
import { cn } from '@/lib/utils'
import type { Product, Category } from '@/types'

type MainTab = 'products' | 'entry'
type EntrySubTab = 'ingresar' | 'movimientos'

export function InventoryPage() {
    const { data: products = [] } = useProducts()
    const { data: categories = [] } = useCategories()
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

    function handleNewProduct() {
        setEditingProduct(null)
        setProductFormOpen(true)
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
        await deleteProduct.mutateAsync(deletingProduct.id)
        setDeletingProduct(null)
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
        await createMovementBatch.mutateAsync({
            entries: entries.map(e => ({ productId: e.productId, qty: e.qty })),
            batchRef,
            notes: notes || undefined,
        })
        setEntrySubTab('movimientos')
    }

    async function handleUpdateMovementQty(mv: InventoryMovement, newQty: number) {
        await updateMovement.mutateAsync({ id: mv.id, newQty, type: mv.type, productId: mv.productId, oldQty: mv.quantity })
    }

    async function handleDeleteMovement(mv: InventoryMovement) {
        await deleteMovement.mutateAsync({ id: mv.id, type: mv.type, quantity: mv.quantity, productId: mv.productId })
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
                        onNew={handleNewProduct}
                        onEdit={handleEditProduct}
                        onDelete={p => setDeletingProduct(p)}
                        onToggle={handleToggleProduct}
                        onManageCategories={() => setManageCatOpen(true)}
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
                onClose={() => { setProductFormOpen(false); setEditingProduct(null) }}
                onConfirm={handleProductFormConfirm}
                product={editingProduct}
                categories={categories}
                isPending={createProduct.isPending || updateProduct.isPending}
            />

            <ManageCategoriesModal
                isOpen={manageCatOpen}
                onClose={() => setManageCatOpen(false)}
                categories={categories}
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
                description={`¿Eliminar la categoría "${deletingCategory?.name}"? Los productos quedarán sin categoría.`}
                isPending={deleteCategory.isPending}
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
