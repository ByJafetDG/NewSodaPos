import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

const now = new Date().toISOString()

async function main() {
    console.log('🌱 Seeding database via Supabase...')

    // ===== Categorías =====
    const categories = [
        { id: 'cat-buffet', name: 'Buffet', type: 'BUFFET', icon: '🍛', sortOrder: 1, isActive: true, updatedAt: now },
        { id: 'cat-menu', name: 'Menú', type: 'MENU', icon: '🍽️', sortOrder: 2, isActive: true, updatedAt: now },
        { id: 'cat-bebidas', name: 'Bebidas', type: 'PRODUCTO', icon: '🥤', sortOrder: 3, isActive: true, updatedAt: now },
        { id: 'cat-snacks', name: 'Snacks', type: 'PRODUCTO', icon: '🍪', sortOrder: 4, isActive: true, updatedAt: now },
        { id: 'cat-ingredientes', name: 'Ingredientes', type: 'INGREDIENTE', icon: '🧂', sortOrder: 5, isActive: true, updatedAt: now },
    ]

    const { error: catError } = await supabase.from('Category').upsert(categories, { onConflict: 'id' })
    if (catError) throw new Error(`Error categories: ${catError.message}`)
    console.log(`✅ ${categories.length} categorías creadas`)

    // ===== Productos =====
    const products = [
        { id: 'prod-casado-pollo', name: 'Casado con Pollo', categoryId: 'cat-menu', price: 3500, cost: 1500, unit: 'UNIDAD', stockQty: 50, minStock: 5, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-casado-carne', name: 'Casado con Carne', categoryId: 'cat-menu', price: 4000, cost: 1800, unit: 'UNIDAD', stockQty: 50, minStock: 5, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-arroz-pollo', name: 'Arroz con Pollo', categoryId: 'cat-menu', price: 3000, cost: 1200, unit: 'PORCION', stockQty: 30, minStock: 5, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-empanada', name: 'Empanada de Carne', categoryId: 'cat-menu', price: 1500, cost: 600, unit: 'UNIDAD', stockQty: 20, minStock: 5, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-gallo-pinto', name: 'Gallo Pinto', categoryId: 'cat-buffet', price: 2000, cost: 600, unit: 'PORCION', stockQty: 100, minStock: 10, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-desayuno-buffet', name: 'Desayuno Buffet', categoryId: 'cat-buffet', price: 2500, cost: 800, unit: 'PORCION', stockQty: 100, minStock: 10, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-coca-cola', name: 'Coca Cola 600ml', barcode: '7702032111220', categoryId: 'cat-bebidas', price: 1000, cost: 550, unit: 'UNIDAD', stockQty: 48, minStock: 12, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-fanta', name: 'Fanta 600ml', barcode: '7702032111237', categoryId: 'cat-bebidas', price: 1000, cost: 550, unit: 'UNIDAD', stockQty: 36, minStock: 12, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-agua', name: 'Agua 600ml', barcode: '7702032111244', categoryId: 'cat-bebidas', price: 700, cost: 300, unit: 'UNIDAD', stockQty: 60, minStock: 12, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-jugo-tropical', name: 'Jugo Tropical', barcode: '7441008810012', categoryId: 'cat-bebidas', price: 600, cost: 320, unit: 'UNIDAD', stockQty: 30, minStock: 8, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-galletas-chiky', name: 'Galletas Chiky', barcode: '7441001602016', categoryId: 'cat-snacks', price: 500, cost: 280, unit: 'UNIDAD', stockQty: 24, minStock: 6, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'prod-papas-tostitos', name: 'Papas Tostitos', barcode: '7501011116368', categoryId: 'cat-snacks', price: 800, cost: 450, unit: 'UNIDAD', stockQty: 20, minStock: 6, isActive: true, syncStatus: 'SYNCED', updatedAt: now },
    ]

    const { error: prodError } = await supabase.from('Product').upsert(products, { onConflict: 'id' })
    if (prodError) throw new Error(`Error products: ${prodError.message}`)
    console.log(`✅ ${products.length} productos creados`)

    // ===== Categorías de Egresos =====
    const expenseCategories = [
        { id: 'expcat-proveedores', name: 'Proveedores' },
        { id: 'expcat-servicios', name: 'Servicios' },
        { id: 'expcat-otros', name: 'Otros' },
    ]

    const { error: expCatError } = await supabase.from('ExpenseCategory').upsert(expenseCategories, { onConflict: 'id' })
    if (expCatError) throw new Error(`Error expense categories: ${expCatError.message}`)
    console.log(`✅ ${expenseCategories.length} categorías de egresos creadas`)

    // ===== Config del Negocio =====
    const { error: configError } = await supabase.from('BusinessConfig').upsert({
        id: 'default',
        name: 'Soda El Pelon',
        ticketFooter: '¡Gracias por su compra!',
        drawerEnabled: true,
        updatedAt: now,
    }, { onConflict: 'id' })
    if (configError) throw new Error(`Error business config: ${configError.message}`)
    console.log('✅ Configuración del negocio creada')

    // ===== Trabajadores de ejemplo =====
    const workers = [
        { id: 'client-carlos', name: 'Carlos Rodríguez', type: 'TRABAJADOR', company: 'Empresa ABC', isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'client-maria', name: 'María López', type: 'TRABAJADOR', company: 'Empresa ABC', isActive: true, syncStatus: 'SYNCED', updatedAt: now },
        { id: 'client-asociacion', name: 'Asociación Solidarista', type: 'ASOCIACION', isActive: true, syncStatus: 'SYNCED', updatedAt: now },
    ]

    const { error: workerError } = await supabase.from('Client').upsert(workers, { onConflict: 'id' })
    if (workerError) throw new Error(`Error workers: ${workerError.message}`)
    console.log(`✅ ${workers.length} trabajadores/clientes creados`)

    console.log('\n🎉 Seed completado exitosamente!')
}

main().catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
})
