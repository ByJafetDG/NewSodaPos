import { Receipt } from 'lucide-react'

export function ExpensesPage() {
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#192030]">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-500/10">
                    <Receipt size={18} className="text-rose-400" />
                </div>
                <div>
                    <h1 className="text-[16px] font-semibold text-[#E4ECF7]">Gastos</h1>
                    <p className="text-[12px] text-[#3D506A]">Registrar un gasto</p>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/10 mx-auto">
                        <Receipt size={28} className="text-rose-400" />
                    </div>
                    <p className="text-[14px] text-[#7A8FAA]">Control de gastos</p>
                    <p className="text-[12px] text-[#3D506A]">En construcción</p>
                </div>
            </div>
        </div>
    )
}
