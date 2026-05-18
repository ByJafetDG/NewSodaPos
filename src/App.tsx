import { useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useUIStore } from '@/store/uiStore'
import { ToastContainer } from '@/components/ui/Toast'
import { POSPage } from '@/pages/POSPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { BalancesPage } from '@/pages/BalancesPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { CashRegisterPage } from '@/pages/CashRegisterPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SorteosPage } from '@/pages/SorteosPage'
import { ReturnsPage } from '@/pages/ReturnsPage'
import { AIAssistantPage } from '@/pages/AIAssistantPage'
import { SinpePage } from '@/pages/SinpePage'
import { StartupCajaModal } from '@/components/modals/StartupCajaModal'
import { SplashScreen } from '@/components/layout/SplashScreen'
import { UpdateModal } from '@/components/modals/UpdateModal'

function PageRenderer() {
    const { currentPage } = useUIStore()
    switch (currentPage) {
        case 'pos':           return <POSPage />
        case 'inventory':     return <InventoryPage />
        case 'balances':      return <BalancesPage />
        case 'reports':       return <ReportsPage />
        case 'cash-register': return <CashRegisterPage />
        case 'sorteos':       return <SorteosPage />
        case 'returns':       return <ReturnsPage />
        case 'settings':      return <SettingsPage />
        case 'ai-assistant':  return <AIAssistantPage />
        case 'sinpe':         return <SinpePage />
        default:              return <POSPage />
    }
}

function playNotificationChime() {
    try {
        const ctx = new AudioContext()
        const notes = [880, 1108, 1318] // A5 → C#6 → E6 (acorde A mayor ascendente)
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.value = freq
            const t = ctx.currentTime + i * 0.13
            gain.gain.setValueAtTime(0, t)
            gain.gain.linearRampToValueAtTime(0.25, t + 0.015)
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
            osc.start(t)
            osc.stop(t + 0.45)
        })
        setTimeout(() => ctx.close(), 2000)
    } catch {}
}

export default function App() {
    const { setSinpeUnread, incrementSinpeUnread } = useUIStore()

    useEffect(() => {
        if (!window.electronAPI?.getSinpeUnreadCount) return
        window.electronAPI.getSinpeUnreadCount().then((n: number) => setSinpeUnread(n))
        const unsub = window.electronAPI.onSinpeNewMessage?.(() => {
            incrementSinpeUnread()
            if (useUIStore.getState().currentPage !== 'sinpe') {
                playNotificationChime()
            }
        })
        return () => { unsub?.() }
    }, [])

    return (
        <>
            <AppLayout>
                <PageRenderer />
            </AppLayout>
            <ToastContainer />
            <StartupCajaModal />
            <UpdateModal />
            <SplashScreen />
        </>
    )
}
