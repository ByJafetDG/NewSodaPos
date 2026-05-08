import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'

if (window.electronAPI?.onSyncLog) {
    window.electronAPI.onSyncLog(({ level, msg }) => {
        if (level === 'error') console.error('[Sync]', msg)
        else console.log('[Sync]', msg)
    })
}

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: 1, refetchOnWindowFocus: false, networkMode: 'always' },
        mutations: { networkMode: 'always' },
    },
})

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </StrictMode>
)
