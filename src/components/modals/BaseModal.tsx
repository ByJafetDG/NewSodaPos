import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

interface BaseModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    description?: string
    width?: string
    children: ReactNode
}

export function BaseModal({ isOpen, onClose, title, description, width = 'max-w-md', children }: BaseModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className={`fixed z-50 inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full ${width} px-4`}
                    >
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#192030]">
                                <div>
                                    <h2 className="text-[16px] font-semibold text-[#E4ECF7]">{title}</h2>
                                    {description && (
                                        <p className="text-[12px] text-[#3D506A] mt-0.5">{description}</p>
                                    )}
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="px-6 py-5">{children}</div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
