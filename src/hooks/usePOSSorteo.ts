import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCartSorteo, useRaspaditaCards } from '@/hooks/useSorteos'
import { logSorteoEntry, handleSorteoWin, scratchCard } from '@/services/sorteos'
import type { CartItem } from '@/types'

export function usePOSSorteo(items: CartItem[]) {
    const qc = useQueryClient()
    const cartProductIds = items.map(i => i.product.id)
    const cartCategoryIds = [...new Set(items.map(i => i.product.categoryId))]
    const { data: cartSorteo } = useCartSorteo(cartProductIds, cartCategoryIds)

    const [sorteoOpen, setSorteoOpen] = useState(false)
    const [sorteoDeclined, setSorteoDeclined] = useState(false)

    const qualifyingCount = cartSorteo
        ? items.reduce((sum, item) => {
            const hit = cartSorteo.participants.some(p =>
                (p.type === 'PRODUCT' && p.refId === item.product.id) ||
                (p.type === 'CATEGORY' && p.refId === item.product.categoryId)
            )
            return hit ? sum + item.quantity : sum
        }, 0)
        : 0

    const showSorteoButton = !!cartSorteo && !sorteoDeclined && items.length > 0
    const isRaspadita = cartSorteo?.sorteo.type === 'RASPADITA'
    const { data: raspaditaCards = [] } = useRaspaditaCards(isRaspadita ? (cartSorteo?.sorteo.id ?? null) : null)
    const raspaditaSessionScratches = useRef(0)

    async function handleSorteoResult(resultOptionId: string) {
        if (!cartSorteo) return
        const winOption = cartSorteo.options.find(o => o.id === resultOptionId)
        await logSorteoEntry({ sorteoId: cartSorteo.sorteo.id, didParticipate: true, unitCount: qualifyingCount, resultOptionId })
        if (winOption && !winOption.isFiller) {
            await handleSorteoWin(cartSorteo.sorteo.id, resultOptionId)
        }
        qc.invalidateQueries({ queryKey: ['sorteos'] })
        qc.invalidateQueries({ queryKey: ['sorteoStats', cartSorteo.sorteo.id] })
        qc.invalidateQueries({ queryKey: ['sorteoWinners', cartSorteo.sorteo.id] })
        qc.invalidateQueries({ queryKey: ['cartSorteo'] })
        setSorteoDeclined(true)
    }

    function handleRaspaditaCardScratched(cardId: string) {
        raspaditaSessionScratches.current++
        scratchCard(cardId)
        qc.invalidateQueries({ queryKey: ['raspaditaCards', cartSorteo?.sorteo.id] })
        qc.invalidateQueries({ queryKey: ['sorteos'] })
    }

    async function handleRaspaditaClose() {
        if (cartSorteo && raspaditaSessionScratches.current > 0) {
            await logSorteoEntry({ sorteoId: cartSorteo.sorteo.id, didParticipate: true, unitCount: qualifyingCount })
            qc.invalidateQueries({ queryKey: ['sorteoStats', cartSorteo.sorteo.id] })
        }
        raspaditaSessionScratches.current = 0
        setSorteoOpen(false)
        setSorteoDeclined(true)
    }

    return {
        cartSorteo,
        showSorteoButton,
        qualifyingCount,
        isRaspadita,
        raspaditaCards,
        sorteoOpen, setSorteoOpen,
        sorteoDeclined, setSorteoDeclined,
        handleSorteoResult,
        handleRaspaditaCardScratched,
        handleRaspaditaClose,
    }
}
