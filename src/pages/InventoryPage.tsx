import { useState } from 'react'
import { Package, ArrowDownToLine, ScanBarcode, PackageSearch, Plus } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { ProductsTable } from '@/components/organisms/inventory/ProductsTable'
import { StockEntryPanel } from '@/components/organisms/inventory/StockEntryPanel'
import { MovementsPanel } from '@/components/organisms/inventory/MovementsPanel'
import type { MovementBatch } from '@/components/organisms/inventory/MovementsPanel'
import { BaseModal } from '@/components/modals/BaseModal'
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
    const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null)
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
            toast.info(`"${name}" fue archivado porque tiene ventas registradas`)
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
                                onProductNotFound={b => setNotFoundBarcode(b)}
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

            <BaseModal isOpen={notFoundBarcode !== null} onClose={() => setNotFoundBarcode(null)} title="" width="max-w-sm">
                <div className="flex flex-col items-center text-center gap-4 py-2">
                    <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                        <PackageSearch size={28} className="text-orange-400" />
                    </div>
                    <div>
                        <p className="text-[15px] font-semibold text-[#E4ECF7] mb-1">Producto no encontrado</p>
                        {notFoundBarcode && (
                            <div className="flex items-center justify-center gap-1.5 mb-2">
                                <ScanBarcode size={13} className="text-[#3D506A]" />
                                <span className="text-[12px] font-mono text-[#7A8FAA]">{notFoundBarcode}</span>
                            </div>
                        )}
                        <p className="text-[13px] text-[#3D506A] leading-relaxed">
                            Ningún producto activo tiene ese código.<br />
                            Intenta escanearlo una vez más, o agrégalo al sistema.
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 w-full">
                        <button
                            onClick={() => setNotFoundBarcode(null)}
                            className="w-full h-10 rounded-xl bg-[#1C2438] border border-[#283A56] text-[#E4ECF7] text-[13px] font-medium hover:bg-[#243050] transition-colors cursor-pointer"
                        >
                            Escanear de nuevo
                        </button>
                        <button
                            onClick={() => { setNotFoundBarcode(null); handleNewProduct() }}
                            className="w-full h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[13px] font-medium flex items-center justify-center gap-2 hover:bg-orange-500/25 transition-colors cursor-pointer"
                        >
                            <Plus size={14} />
                            Agregar producto
                        </button>
                    </div>
                </div>
            </BaseModal>
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
