import { supabase } from '@/lib/supabase'
import { TOMBOLA_PRODUCT_ID } from '@/constants/products'

export async function getCashierHistoricalLeaderboard(): Promise<Array<{ notes: string | null; total: number; month: string }>> {
    if (window.electronAPI) {
        const rows = await window.electronAPI.dbQuery(`
            SELECT notes, total, substr(date, 1, 7) as month
            FROM Sale
            WHERE status = 'COMPLETADA'
              AND date < date('now', 'start of month')
              AND date >= date('now', 'start of month', '-5 months')
        `)
        return rows as any[]
    }
    // Supabase fallback
    const start = new Date()
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
    const fiveMonthsAgo = new Date(start)
    fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5)
    const { data } = await supabase
        .from('Sale')
        .select('notes, total, date')
        .eq('status', 'COMPLETADA')
        .lt('date', start.toISOString())
        .gte('date', fiveMonthsAgo.toISOString())
    return (data ?? []).map((r: any) => ({
        notes: r.notes,
        total: r.total,
        month: r.date?.slice(0, 7) ?? '',
    }))
}

export async function getReportData(from: string, to: string) {
    if (window.electronAPI) {
        const sales = await window.electronAPI.dbQuery(`
            SELECT s.*, c.name as clientName, c.code as clientCode, co.name as companyName
            FROM Sale s
            LEFT JOIN Client c ON s.clientId = c.id
            LEFT JOIN Company co ON s.companyId = co.id
            WHERE (s.paidAt IS NULL AND s.date >= ? AND s.date <= ?)
               OR (s.paidAt IS NOT NULL AND s.paidAt >= ? AND s.paidAt <= ?)
            ORDER BY COALESCE(s.paidAt, s.date) DESC
        `, [from, to, from, to])

        const rawItems = await window.electronAPI.dbQuery(`
            SELECT si.saleId, si.productId, si.quantity, si.unitPrice, si.subtotal, si.notes as itemNotes,
                   CASE WHEN si.productId = 'tombola-entry'
                        THEN COALESCE(si.notes, 'Tómbola')
                        ELSE COALESCE(p.name, 'Producto')
                   END as productName
            FROM SaleItem si
            INNER JOIN Sale s ON si.saleId = s.id
            LEFT JOIN Product p ON si.productId = p.id
            WHERE (s.paidAt IS NULL AND s.date >= ? AND s.date <= ?)
               OR (s.paidAt IS NOT NULL AND s.paidAt >= ? AND s.paidAt <= ?)
        `, [from, to, from, to])

        const itemsMap: Record<string, any[]> = {}
        for (const item of rawItems as any[]) {
            if (!itemsMap[item.saleId]) itemsMap[item.saleId] = []
            itemsMap[item.saleId].push({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
                product: { name: item.productName },
                notes: item.productId === TOMBOLA_PRODUCT_ID ? null : item.itemNotes,
            })
        }

        const expenses = await window.electronAPI.dbQuery(`
            SELECT e.amount, e.description, e.date,
                   json_object('name', c.name) as category
            FROM Expense e
            LEFT JOIN ExpenseCategory c ON e.categoryId = c.id
            WHERE e.date >= ? AND e.date <= ?
        `, [from, to])

        const products = await window.electronAPI.dbQuery(`
            SELECT p.id, p.name, p.stockQty, p.minStock, p.price, p.cost, p.isInfinite,
                   json_object('name', c.name) as category
            FROM Product p
            LEFT JOIN Category c ON p.categoryId = c.id
            WHERE p.isActive = 1
            ORDER BY p.stockQty ASC
        `)

        // Point 2: SQL Aggregations for performance
        const paymentStats = await window.electronAPI.dbQuery(`
            SELECT paymentMethod, SUM(total) as total
            FROM Sale
            WHERE status = 'COMPLETADA' AND date >= ? AND date <= ?
            GROUP BY paymentMethod
        `, [from, to])

        const topProducts = await window.electronAPI.dbQuery(`
            SELECT si.productId, p.name, SUM(si.quantity) as qty, SUM(si.subtotal) as revenue
            FROM SaleItem si
            INNER JOIN Sale s ON si.saleId = s.id
            LEFT JOIN Product p ON si.productId = p.id
            WHERE s.status = 'COMPLETADA' AND s.date >= ? AND s.date <= ?
            GROUP BY si.productId
            ORDER BY qty DESC
            LIMIT 10
        `, [from, to])

        const hourlyStats = await window.electronAPI.dbQuery(`
            SELECT strftime('%H', date) as hour, SUM(total) as total
            FROM Sale
            WHERE status = 'COMPLETADA' AND date >= ? AND date <= ?
            GROUP BY hour
        `, [from, to])

        const creditSalesSum = await window.electronAPI.dbQuery(
            "SELECT SUM(total) as total FROM Sale WHERE isCredit = 1 AND status = 'COMPLETADA'"
        )
        const paymentsSum = await window.electronAPI.dbQuery(
            'SELECT SUM(amount) as total FROM Payment'
        )

        return {
            sales: (sales as any[]).map((s: any) => ({
                ...s,
                isCredit: !!s.isCredit,
                items: itemsMap[s.id] ?? [],
            })),
            expenses: expenses.map((e: any) => ({ ...e, category: JSON.parse(e.category) })),
            products: products.map((p: any) => ({ ...p, category: JSON.parse(p.category) })),
            totalDebt: creditSalesSum[0]?.total || 0,
            totalPaid: paymentsSum[0]?.total || 0,
            // Summaries
            paymentStats,
            topProducts,
            hourlyStats: Array(24).fill(0).map((_, i) => {
                const hourStr = i.toString().padStart(2, '0')
                const stat = (hourlyStats as any[]).find(h => h.hour === hourStr)
                return stat ? stat.total : 0
            })
        }
    }

    const [salesRes, expensesRes, productsRes, creditSalesRes, paymentsRes] = await Promise.all([
        supabase
            .from('Sale')
            .select('*, client:Client(name, code), company:Company(name), items:SaleItem(productId, quantity, unitPrice, subtotal, product:Product(name))')
            .or(`and(date.gte.${from},date.lte.${to},paidAt.is.null),and(paidAt.gte.${from},paidAt.lte.${to},paidAt.not.is.null)`)
            .order('date', { ascending: false }),

        supabase
            .from('Expense')
            .select('amount, description, date, category:ExpenseCategory(name)')
            .gte('date', from).lte('date', to),

        supabase
            .from('Product')
            .select('id, name, stockQty, minStock, price, cost, isInfinite, category:Category(name)')
            .eq('isActive', true)
            .order('stockQty', { ascending: true }),

        supabase.from('Sale').select('total').eq('isCredit', true).eq('status', 'COMPLETADA'),
        supabase.from('Payment').select('amount'),
    ])

    const sales = salesRes.data ?? []
    
    // Cloud fallback summaries (still in JS for simplicity as Supabase doesn't easily do GROUP BY in simple select)
    const paymentStats: any[] = []
    const pMap: Record<string, number> = {}
    sales.forEach(s => { pMap[s.paymentMethod] = (pMap[s.paymentMethod] || 0) + s.total })
    Object.entries(pMap).forEach(([k, v]) => paymentStats.push({ paymentMethod: k, total: v }))

    const hourlyStats = Array(24).fill(0)
    sales.forEach(s => {
        const h = new Date(s.date).getHours()
        hourlyStats[h] += s.total
    })

    return {
        sales,
        expenses: expensesRes.data ?? [],
        products: productsRes.data ?? [],
        totalDebt: (creditSalesRes.data ?? []).reduce((s, c) => s + c.total, 0),
        totalPaid: (paymentsRes.data ?? []).reduce((s, p) => s + p.amount, 0),
        paymentStats,
        topProducts: [], // Cloud top products is complex due to SaleItem join, keeping empty for now or same logic as before
        hourlyStats
    }
}
