import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import logo from '@/assets/logo-pospelon.png'

const SPLASH_MS = 2200

export function SplashScreen() {
    const [visible, setVisible] = useState(true)

    useEffect(() => {
        const t = setTimeout(() => setVisible(false), SPLASH_MS)
        return () => clearTimeout(t)
    }, [])

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#080C14]"
                >
                    <motion.div
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
                        className="flex flex-col items-center gap-6"
                    >
                        <div className="w-28 h-28 rounded-3xl overflow-hidden shadow-2xl shadow-black/60">
                            <img src={logo} alt="Logo" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <p className="text-[22px] font-bold text-[#E4ECF7] tracking-tight">Soda POS</p>
                            <p className="text-[13px] text-[#3D506A]">v2.0</p>
                        </div>
                    </motion.div>

                    {/* Loading dots */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6, duration: 0.3 }}
                        className="absolute bottom-12 flex gap-1.5"
                    >
                        {[0, 1, 2].map(i => (
                            <motion.span
                                key={i}
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                                className="w-1.5 h-1.5 rounded-full bg-[#3D506A]"
                            />
                        ))}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
