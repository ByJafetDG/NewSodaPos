import { supabase } from '@/lib/supabase'

export async function getReportData(from: string, to: string) {
    if (window.electronAPI) {
        const sales = await window.electronAPI.dbQuery(`
            SELECT s.*, c.name as clientName, c.code as clientCode
FROM Sale s
            LEFT JOIN Client c ON s.clientId = c.id
            WHERE s.status = 'COMPLETADA'
              AND (
                (s.date >= ? AND s.date <= ?)
                OR (s.paidAt IS NOT NULL AND s.paidAt >= ? AND s.paidAt <= ?)
              )
            ORDER BY COALESCE(s.paidAt, s.date) DESC
        `, [from, to, from, to])

        const rawItems = await window.electronAPI.dbQuery(`
            SELECT si.saleId, si.productId, si.quantity, si.unitPrice, si.subtotal,
                   COALESCE(p.name, 'Producto') as productName
            FROM SaleItem si
            INNER JOIN Sale s ON si.saleId = s.id
            LEFT JOIN Product p ON si.productId = p.id
            WHERE s.status = 'COMPLETADA'
              AND (
                (s.date >= ? AND s.date <= ?)
                OR (s.paidAt IS NOT NULL AND s.paidAt >= ? AND s.paidAt <= ?)
              )
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

        const creditSalesSum = await window.electronAPI.dbQuery(
            "SELECT SUM(total) as total FROM Sale WHERE isCredit = 1 AND status = 'COMPLETADA'"
        )
        const paymentsSum = await window.electronAPI.dbQuery(
            'SELECT SUM(amount) as total FROM Payment'
        )

        return {
            sales: sales.map((s: any) => ({
                ...s,
                isCredit: !!s.isCredit,
                items: itemsMap[s.id] ?? [],
            })),
            expenses: expenses.map((e: any) => ({ ...e, category: JSON.parse(e.category) })),
            products: products.map((p: any) => ({ ...p, category: JSON.parse(p.category) })),
            totalDebt: creditSalesSum[0]?.total || 0,
            totalPaid: paymentsSum[0]?.total || 0,
        }
    }

    const [salesRes, expensesRes, productsRes, creditSalesRes, paymentsRes] = await Promise.all([
        supabase
            .from('Sale')
            .select('*, client:Client(name, code), items:SaleItem(productId, quantity, unitPrice, subtotal, product:Product(name))')
            .or(`and(date.gte.${from},date.lte.${to}),and(paidAt.gte.${from},paidAt.lte.${to},paidAt.not.is.null)`)
            .eq('status', 'COMPLETADA')
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

    return {
        sales: salesRes.data ?? [],
        expenses: expensesRes.data ?? [],
        products: productsRes.data ?? [],
        totalDebt: (creditSalesRes.data ?? []).reduce((s, c) => s + c.total, 0),
        totalPaid: (paymentsRes.data ?? []).reduce((s, p) => s + p.amount, 0),
    }
}
