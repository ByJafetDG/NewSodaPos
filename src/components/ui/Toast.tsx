import { sileo, Toaster } from 'sileo'
import 'sileo/styles.css'

// ===== Shortcut helpers (same interface as before) =====
export const toast = {
    success: (msg: string, duration?: number) => sileo.success({ title: msg, duration: duration || 3000 }),
    error: (msg: string, duration?: number) => sileo.error({ title: msg, duration: duration || 5000 }),
    warning: (msg: string, duration?: number) => sileo.warning({ title: msg, duration: duration || 3000 }),
    info: (msg: string, duration?: number) => sileo.info({ title: msg, duration: duration || 3000 }),
}

// ===== Toast Container (uses Sileo's Toaster with dark theme) =====
export function ToastContainer() {
    return (
        <Toaster
            position="bottom-center"
            theme="dark"
            options={{
                fill: '#0f172a',
                roundness: 16,
                duration: 2500,
                styles: {
                    title: 'text-white!',
                    description: 'text-white/75!',
                    badge: 'bg-white/10!',
                    button: 'bg-white/10! hover:bg-white/15!',
                },
            }}
        />
    )
}
