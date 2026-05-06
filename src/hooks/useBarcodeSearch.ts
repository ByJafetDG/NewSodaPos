import { useCallback } from 'react'
import { toast } from '@/components/ui/Toast'
import type { Product } from '@/types'

/**
 * Shared barcode/name search logic used by both POS and Inventory pages.
 * Returns a function that searches products by barcode first, then by name.
 */
export function useBarcodeSearch(products: Product[]) {
    const findProduct = useCallback((query: string): Product | null => {
        if (!query.trim()) return null
        const q = query.trim()

        // Try exact barcode match first (case-insensitive)
        const byBarcode = products.find(
            (p) => p.barcode && p.barcode.toLowerCase() === q.toLowerCase()
        )
        if (byBarcode) return byBarcode

        // Then try name search
        const byName = products.find(
            (p) => p.name.toLowerCase().includes(q.toLowerCase())
        )
        if (byName) return byName

        return null
    }, [products])

    return { findProduct }
}
