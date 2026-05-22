import { useState, useEffect } from 'react'
import { X, Building2, Mail, Phone, FileText, Check, Hash } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useKeyboardInput } from '@/hooks/useKeyboardInput'
import { useKeyboardStore } from '@/store/keyboardStore'
import { cn } from '@/lib/utils'
import type { Company } from '@/types'

type CompanyInput = Omit<Company, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>

interface CompanyFormModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (data: CompanyInput) => void
    company?: Company | null
    isPending?: boolean
}

const EMPTY: CompanyInput = { name: '', taxId: null, billingEmail: null, phone: null, notes: null, isActive: true, isDeleted: false, deletedAt: null }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3D506A] mb-1.5">{label}</p>
            {children}
        </div>
    )
}

function TextInput({ value, onChange, placeholder, mode = 'alpha' }: {
    value: string; onChange: (v: string) => void; placeholder?: string; mode?: 'alpha' | 'numeric'
}) {
    const kb = useKeyboardInput(value, onChange, { mode })
    return (
        <input
            type="text"
            {...kb}
            placeholder={placeholder}
            className="w-full h-10 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-violet-500/40 transition-colors"
        />
    )
}

export function CompanyFormModal({ isOpen, onClose, onConfirm, company, isPending }: CompanyFormModalProps) {
    const [data, setData] = useState<CompanyInput>(EMPTY)

    useEffect(() => {
        if (!isOpen) return
        useKeyboardStore.getState().close()
        if (company) {
            setData({ name: company.name, taxId: company.taxId, billingEmail: company.billingEmail, phone: company.phone, notes: company.notes, isActive: company.isActive, isDeleted: company.isDeleted, deletedAt: company.deletedAt })
        } else {
            setData(EMPTY)
        }
    }, [isOpen])

    function handleClose() { useKeyboardStore.getState().close(); onClose() }

    function handleConfirm() {
        if (!data.name.trim() || isPending) return
        onConfirm({
            name: data.name.trim(),
            taxId: data.taxId?.trim() || null,
            billingEmail: data.billingEmail?.trim() || null,
            phone: data.phone?.trim() || null,
            notes: data.notes?.trim() || null,
            isActive: data.isActive,
            isDeleted: false,
            deletedAt: null,
        })
    }

    const nameKb = useKeyboardInput(data.name, v => setData(d => ({ ...d, name: v })))
    const taxIdKb = useKeyboardInput(data.taxId ?? '', v => setData(d => ({ ...d, taxId: v || null })), { mode: 'numeric' })
    const emailKb = useKeyboardInput(data.billingEmail ?? '', v => setData(d => ({ ...d, billingEmail: v || null })))
    const phoneKb = useKeyboardInput(data.phone ?? '', v => setData(d => ({ ...d, phone: v || null })), { mode: 'numeric' })
    const notesKb = useKeyboardInput(data.notes ?? '', v => setData(d => ({ ...d, notes: v || null })))

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                        onClick={handleClose}
                    />
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, scale: 0.96, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="fixed z-50 inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-full max-w-sm px-4"
                    >
                        <div className="bg-[#0F1523] border border-[#1E2A40] rounded-2xl shadow-2xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 pt-5 pb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                        <Building2 size={15} className="text-orange-400" />
                                    </div>
                                    <h2 className="text-[15px] font-semibold text-[#E4ECF7]">
                                        {company ? 'Editar empresa' : 'Nueva empresa'}
                                    </h2>
                                </div>
                                <button onClick={handleClose} className="w-8 h-8 rounded-lg text-[#3D506A] hover:text-[#E4ECF7] hover:bg-white/5 flex items-center justify-center transition-all cursor-pointer">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="px-5 pb-6 space-y-3">
                                <Field label="Nombre de la empresa">
                                    <input
                                        type="text"
                                        {...nameKb}
                                        placeholder="Ej: Constructora El Pelón S.A."
                                        className="w-full h-11 px-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[14px] font-semibold placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                                    />
                                </Field>

                                <Field label="Cédula jurídica">
                                    <div className="relative">
                                        <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A]" />
                                        <input
                                            type="text"
                                            {...taxIdKb}
                                            placeholder="3-101-000000"
                                            className="w-full h-10 pl-8 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                                        />
                                    </div>
                                </Field>

                                <Field label="Correo de facturación">
                                    <div className="relative">
                                        <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A]" />
                                        <input
                                            type="text"
                                            {...emailKb}
                                            placeholder="facturacion@empresa.com"
                                            className="w-full h-10 pl-8 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                                        />
                                    </div>
                                </Field>

                                <Field label="Teléfono">
                                    <div className="relative">
                                        <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A]" />
                                        <input
                                            type="text"
                                            {...phoneKb}
                                            placeholder="2222-0000"
                                            className="w-full h-10 pl-8 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                                        />
                                    </div>
                                </Field>

                                <Field label="Notas">
                                    <div className="relative">
                                        <FileText size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3D506A]" />
                                        <input
                                            type="text"
                                            {...notesKb}
                                            placeholder="Observaciones opcionales..."
                                            className="w-full h-10 pl-8 pr-3 rounded-xl bg-[#101520] border border-[#1E2A40] text-[#E4ECF7] text-[13px] placeholder:text-[#3D506A] outline-none focus:border-orange-500/40 transition-colors"
                                        />
                                    </div>
                                </Field>

                                <button
                                    onClick={handleConfirm}
                                    disabled={!data.name.trim() || isPending}
                                    className="w-full h-12 rounded-xl bg-orange-500 text-white text-[14px] font-bold hover:bg-orange-600 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer flex items-center justify-center gap-2 mt-1"
                                >
                                    {isPending ? 'Guardando...' : (company ? 'Guardar cambios' : 'Crear empresa')}
                                    {!isPending && <Check size={16} />}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
