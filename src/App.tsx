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
        default:              return <POSPage />
    }
}

export default function App() {
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
