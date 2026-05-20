import { useState } from 'react'
import type { Product } from '@/types'

export function usePOSScanModals() {
    const [scanBuffer, setScanBuffer] = useState<string | null>(null)
    const [scanNotFound, setScanNotFound] = useState<string | null>(null)
    const [scanOutOfStock, setScanOutOfStock] = useState<Product | null>(null)
    const [showCreateProduct, setShowCreateProduct] = useState(false)
    const [createProductBarcode, setCreateProductBarcode] = useState('')

    return {
        scanBuffer, setScanBuffer,
        scanNotFound, setScanNotFound,
        scanOutOfStock, setScanOutOfStock,
        showCreateProduct, setShowCreateProduct,
        createProductBarcode, setCreateProductBarcode,
    }
}
