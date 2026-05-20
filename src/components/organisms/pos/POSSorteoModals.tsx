import { RuletaModal } from '@/components/modals/RuletaModal'
import { RaspaditaModal } from '@/components/modals/RaspaditaModal'
import type { usePOSSorteo } from '@/hooks/usePOSSorteo'

type SorteoState = ReturnType<typeof usePOSSorteo>

type Props = Pick<SorteoState,
    | 'isRaspadita'
    | 'sorteoOpen'
    | 'setSorteoOpen'
    | 'cartSorteo'
    | 'raspaditaCards'
    | 'qualifyingCount'
    | 'handleSorteoResult'
    | 'handleRaspaditaCardScratched'
    | 'handleRaspaditaClose'
>

export function POSSorteoModals({ isRaspadita, sorteoOpen, setSorteoOpen, cartSorteo, raspaditaCards, qualifyingCount, handleSorteoResult, handleRaspaditaCardScratched, handleRaspaditaClose }: Props) {
    if (isRaspadita) {
        return (
            <RaspaditaModal
                isOpen={sorteoOpen}
                onClose={handleRaspaditaClose}
                sorteo={cartSorteo?.sorteo ?? null}
                cards={raspaditaCards}
                allowedScratchCount={qualifyingCount}
                onCardScratched={handleRaspaditaCardScratched}
            />
        )
    }

    return (
        <RuletaModal
            isOpen={sorteoOpen}
            onClose={() => setSorteoOpen(false)}
            sorteoName={cartSorteo?.sorteo.name ?? ''}
            options={cartSorteo?.options ?? []}
            sorteoId={cartSorteo?.sorteo.id}
            minSpinsBetweenPrizes={cartSorteo?.sorteo.minSpinsBetweenPrizes}
            maxSpins={qualifyingCount}
            onResult={handleSorteoResult}
        />
    )
}
