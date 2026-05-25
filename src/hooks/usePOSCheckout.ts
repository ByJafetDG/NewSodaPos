import { useState, useEffect } from 'react'
import type { PaymentMethod } from '@/types'
import type { MixedModalView } from '@/components/modals/MixedPaymentModal'

export function usePOSCheckout(effectiveTotal: number) {
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO')
    const [amountReceived, setAmountReceived] = useState(() => localStorage.getItem('pos_amount_received') ?? '')
    const [mixedMethods, setMixedMethods] = useState<string[]>([])
    const [splitAmount, setSplitAmount] = useState('')
    const [creditAmount, setCreditAmount] = useState('')
    const [creditClientId, setCreditClientId] = useState<string | null>(null)
    const [showMixedModal, setShowMixedModal] = useState(false)
    const [mixedModalView, setMixedModalView] = useState<MixedModalView>('select')
    const [showCreditModal, setShowCreditModal] = useState(false)

    useEffect(() => {
        localStorage.setItem('pos_amount_received', amountReceived)
    }, [amountReceived])

    const received = parseFloat(amountReceived) || 0
    const splitAmountNum = parseFloat(splitAmount) || 0
    const creditAmountNum = parseFloat(creditAmount) || 0
    const isMixed = mixedMethods.length >= 2
    const hasSinpeMixed = isMixed && mixedMethods.includes('SINPE')
    const hasEfectivoMixed = isMixed && mixedMethods.includes('EFECTIVO')
    const hasCuentaMixed = isMixed && mixedMethods.includes('CUENTA')
    const cashPortion = effectiveTotal - (hasSinpeMixed ? splitAmountNum : 0) - (hasCuentaMixed ? creditAmountNum : 0)

    const handleOpenMixedSelect = () => { setMixedModalView('select'); setShowMixedModal(true) }
    const handleOpenMixedCancel = () => { setMixedModalView('cancel'); setShowMixedModal(true) }
    const handleMixedConfirm = (methods: string[]) => { setMixedMethods(methods); setShowMixedModal(false) }
    const handleCancelMixed = () => { setMixedMethods([]); setShowMixedModal(false) }

    const reset = () => {
        setPaymentMethod('EFECTIVO')
        setAmountReceived('')
        setMixedMethods([])
        setCreditAmount('')
        setCreditClientId(null)
        setShowCreditModal(false)
    }

    return {
        paymentMethod, setPaymentMethod,
        amountReceived, setAmountReceived,
        mixedMethods, setMixedMethods,
        splitAmount, setSplitAmount,
        creditAmount, setCreditAmount,
        creditClientId, setCreditClientId,
        showMixedModal, setShowMixedModal,
        mixedModalView, setMixedModalView,
        showCreditModal, setShowCreditModal,
        received,
        splitAmountNum,
        creditAmountNum,
        isMixed,
        hasSinpeMixed,
        hasEfectivoMixed,
        hasCuentaMixed,
        cashPortion,
        handleOpenMixedSelect,
        handleOpenMixedCancel,
        handleMixedConfirm,
        handleCancelMixed,
        reset,
    }
}
