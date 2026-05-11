import { useState } from 'react'
import { Ticket, Plus, Play, Pause, StopCircle, Trash2, Clock, Zap, BarChart2, Users, UserX, UserCheck, Pencil } from 'lucide-react'
import { Button } from '@/components/atoms/Button'
import { Badge } from '@/components/atoms/Badge'
import { EmptyState } from '@/components/atoms/EmptyState'
import { BaseModal } from '@/components/modals/BaseModal'
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal'
import { CreateSorteoModal } from '@/components/modals/CreateSorteoModal'
import { EditSorteoModal } from '@/components/modals/EditSorteoModal'
import { RuletaModal } from '@/components/modals/RuletaModal'
import { cn } from '@/lib/utils'
import { useSorteos, useUpdateSorteo, useDeleteSorteo, useSorteoStats, useSorteoOptions } from '@/hooks/useSorteos'
import type { Sorteo, SorteoStatus } from '@/types'

const STATUS_LABEL: Record<SorteoStatus, string> = {
    DRAFT: 'Borrador',
    ACTIVE: 'Activo',
    PAUSED: 'Pausado',
    ENDED: 'Terminado',
}

const STATUS_VARIANT: Record<SorteoStatus, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'> = {
    DRAFT: 'default',
    ACTIVE: 'success',
    PAUSED: 'warning',
    ENDED: 'danger',
}

function SorteoStatsModal({ sorteo, onClose }: { sorteo: Sorteo | null; onClose: () => void }) {
    const { data: stats } = useSorteoStats(sorteo?.id ?? null)
    const { data: options = [] } = useSorteoOptions(sorteo?.id ?? null)

    if (!sorteo) return null

    const participationPct = stats && stats.total > 0
        ? Math.round((stats.participated / stats.total) * 100)
        : 0

    const maxOptionCount = stats
        ? Math.max(...(stats.optionCounts.map(o => o.count)), 1)
        : 1

    return (
        <BaseModal
            isOpen={!!sorteo}
            onClose={onClose}
            title={sorteo.name}
            description="Estadísticas de participación"
            width="max-w-lg"
        >
            {!stats || stats.total === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <BarChart2 size={28} className="text-[#283A56]" />
                    <p className="text-[13px] text-[#3D506A]">Sin entradas registradas aún</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: 'Total', value: stats.total, icon: Users, color: 'text-[#7A8FAA]', bg: 'bg-[#101828]', border: 'border-[#192030]' },
                            { label: 'Participaron', value: stats.participated, icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/15' },
                            { label: 'Rechazaron', value: stats.declined, icon: UserX, color: 'text-red-400', bg: 'bg-red-500/5', border: 'border-red-500/15' },
                        ].map(c => (
                            <div key={c.label} className={cn('rounded-xl border px-3 py-3 flex flex-col gap-1', c.bg, c.border)}>
                                <div className="flex items-center gap-1.5">
                                    <c.icon size={12} className={c.color} />
                                    <span className="text-[10px] uppercase tracking-wider text-[#3D506A]">{c.label}</span>
                                </div>
                                <span className={cn('text-[22px] font-bold tabular-nums', c.color)}>{c.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Participation rate bar */}
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] text-[#3D506A] uppercase tracking-wider">Tasa de participación</span>
                            <span className="text-[13px] font-semibold text-[#7A8FAA]">{participationPct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-[#101828] border border-[#192030] overflow-hidden">
                            <div
                                className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                                style={{ width: `${participationPct}%` }}
                            />
                        </div>
                    </div>

                    {/* Prize distribution */}
                    {stats.optionCounts.some(o => o.count > 0) && (
                        <div className="space-y-2">
                            <p className="text-[11px] uppercase tracking-wider text-[#3D506A]">Distribución de premios</p>
                            <div className="space-y-2">
                                {stats.optionCounts
                                    .filter(o => o.count > 0)
                                    .sort((a, b) => b.count - a.count)
                                    .map(o => {
                                        const opt = options.find(op => op.id === o.optionId)
                                        const barPct = Math.round((o.count / maxOptionCount) * 100)
                                        const color = opt?.color ?? '#F59E0B'
                                        const remaining = opt?.quantityRemaining
                                        return (
                                            <div key={o.optionId} className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                                            style={{ backgroundColor: color }}
                                                        />
                                                        <span className="text-[12px] text-[#C5D5E8] truncate max-w-[200px]">{o.label}</span>
                                                        {remaining !== null && remaining !== undefined && (
                                                            <span className="text-[10px] text-[#3D506A]">({remaining} restantes)</span>
                                                        )}
                                                    </div>
                                                    <span className="text-[12px] font-semibold text-[#7A8FAA] tabular-nums shrink-0">{o.count}</span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-[#101828] overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{ width: `${barPct}%`, backgroundColor: color + '99' }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </BaseModal>
    )
}

function StatsRow({ sorteoId }: { sorteoId: string }) {
    const { data: stats } = useSorteoStats(sorteoId)
    if (!stats || stats.total === 0) return null
    const pct = Math.round((stats.participated / stats.total) * 100)
    return (
        <span className="text-[11px] text-[#7A8FAA]">
            {stats.participated}/{stats.total} participaron ({pct}%)
        </span>
    )
}

function SorteoRow({
    sorteo,
    onDelete,
    onPreview,
    onStats,
    onEdit,
}: {
    sorteo: Sorteo
    onDelete: (s: Sorteo) => void
    onPreview: (s: Sorteo) => void
    onStats: (s: Sorteo) => void
    onEdit: (s: Sorteo) => void
}) {
    const updateSorteo = useUpdateSorteo()

    function changeStatus(status: SorteoStatus) {
        updateSorteo.mutate({ id: sorteo.id, status })
    }

    return (
        <tr className="border-b border-[#0F1523] hover:bg-[#101828]/60 transition-colors">
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Ticket size={13} className="text-amber-400" />
                    </div>
                    <div>
                        <p className="text-[13px] font-medium text-[#E4ECF7]">{sorteo.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-[#3D506A]">{sorteo.type}</span>
                            <StatsRow sorteoId={sorteo.id} />
                        </div>
                    </div>
                </div>
            </td>

            <td className="px-3 py-3 text-center">
                <Badge variant={STATUS_VARIANT[sorteo.status]}>
                    {STATUS_LABEL[sorteo.status]}
                </Badge>
            </td>

            <td className="px-3 py-3">
                {(sorteo.startAt || sorteo.endAt) ? (
                    <div className="flex items-center gap-1 text-[11px] text-[#7A8FAA]">
                        <Clock size={11} className="text-[#3D506A]" />
                        {sorteo.startAt && <span>{new Date(sorteo.startAt).toLocaleDateString()}</span>}
                        {sorteo.startAt && sorteo.endAt && <span className="text-[#3D506A]">→</span>}
                        {sorteo.endAt && <span>{new Date(sorteo.endAt).toLocaleDateString()}</span>}
                    </div>
                ) : (
                    <span className="text-[11px] text-[#283A56]">Sin fecha</span>
                )}
            </td>

            <td className="px-3 py-3">
                <div className="flex items-center gap-1.5 justify-end flex-wrap">
                    {/* Status-changing action chips */}
                    {sorteo.status === 'DRAFT' && (
                        <button
                            onClick={() => changeStatus('ACTIVE')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                        >
                            <Play size={10} />
                            Activar
                        </button>
                    )}
                    {sorteo.status === 'ACTIVE' && (
                        <>
                            <button
                                onClick={() => onPreview(sorteo)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer"
                            >
                                <Zap size={10} />
                                Probar
                            </button>
                            <button
                                onClick={() => changeStatus('PAUSED')}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-[#101828] border-[#1E2A40] text-[#7A8FAA] hover:text-amber-400 hover:border-amber-500/25 hover:bg-amber-500/10 active:scale-95 transition-all cursor-pointer"
                            >
                                <Pause size={10} />
                                Pausar
                            </button>
                            <button
                                onClick={() => changeStatus('ENDED')}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-[#101828] border-[#1E2A40] text-[#7A8FAA] hover:text-red-400 hover:border-red-500/25 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer"
                            >
                                <StopCircle size={10} />
                                Terminar
                            </button>
                        </>
                    )}
                    {sorteo.status === 'PAUSED' && (
                        <>
                            <button
                                onClick={() => changeStatus('ACTIVE')}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                            >
                                <Play size={10} />
                                Reactivar
                            </button>
                            <button
                                onClick={() => changeStatus('ENDED')}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-[#101828] border-[#1E2A40] text-[#7A8FAA] hover:text-red-400 hover:border-red-500/25 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer"
                            >
                                <StopCircle size={10} />
                                Terminar
                            </button>
                        </>
                    )}

                    {/* Divider */}
                    <div className="w-px h-4 bg-[#1A2535] mx-0.5 shrink-0" />

                    {/* Utility icon buttons */}
                    <button
                        onClick={() => onStats(sorteo)}
                        title="Estadísticas"
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#0D1828] border border-[#1E2A40] text-[#4A6A8A] hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/8 active:scale-95 transition-all cursor-pointer"
                    >
                        <BarChart2 size={12} />
                    </button>
                    <button
                        onClick={() => onEdit(sorteo)}
                        title="Editar"
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#0D1828] border border-[#1E2A40] text-[#4A6A8A] hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/8 active:scale-95 transition-all cursor-pointer"
                    >
                        <Pencil size={12} />
                    </button>
                    <button
                        onClick={() => onDelete(sorteo)}
                        title="Eliminar"
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#0D1828] border border-[#1E2A40] text-[#4A6A8A] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/8 active:scale-95 transition-all cursor-pointer"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </td>
        </tr>
    )
}

export function SorteosPage() {
    const { data: sorteos = [], isLoading } = useSorteos()
    const deleteSorteo = useDeleteSorteo()

    const [createOpen, setCreateOpen] = useState(false)
    const [editSorteo, setEditSorteo] = useState<Sorteo | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<Sorteo | null>(null)
    const [previewSorteo, setPreviewSorteo] = useState<Sorteo | null>(null)
    const [statsSorteo, setStatsSorteo] = useState<Sorteo | null>(null)
    const { data: previewOptions = [] } = useSorteoOptions(previewSorteo?.id ?? null)

    const active = sorteos.filter(s => s.status === 'ACTIVE').length
    const draft = sorteos.filter(s => s.status === 'DRAFT').length
    const ended = sorteos.filter(s => s.status === 'ENDED').length

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#192030] shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber-500/10">
                        <Ticket size={18} className="text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E4ECF7]">Sorteos</h1>
                        <p className="text-[12px] text-[#3D506A]">Ruletas y rifas para tus clientes</p>
                    </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                    <Plus size={14} />
                    Nuevo sorteo
                </Button>
            </div>

            {/* Stats */}
            {sorteos.length > 0 && (
                <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-[#192030] shrink-0">
                    {[
                        { label: 'Total', value: sorteos.length, color: 'text-[#7A8FAA]' },
                        { label: 'Activos', value: active, color: 'text-emerald-400' },
                        { label: 'Borradores', value: draft, color: 'text-[#7A8FAA]' },
                        { label: 'Terminados', value: ended, color: 'text-[#3D506A]' },
                    ].map(s => (
                        <div key={s.label} className="bg-[#0B0E19] border border-[#192030] rounded-xl px-4 py-3">
                            <p className="text-[11px] text-[#3D506A] uppercase tracking-wider mb-1">{s.label}</p>
                            <p className={cn('text-[22px] font-bold tabular-nums', s.color)}>{s.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? null : sorteos.length === 0 ? (
                    <EmptyState
                        icon={<Ticket size={32} />}
                        title="Sin sorteos"
                        description="Crea tu primer sorteo para empezar"
                    />
                ) : (
                    <table className="w-full text-[13px]">
                        <thead className="sticky top-0 z-10 bg-[#0B0E19]">
                            <tr className="border-b border-[#192030]">
                                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A] w-[45%]">Sorteo</th>
                                <th className="text-center px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Estado</th>
                                <th className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D506A]">Vigencia</th>
                                <th className="w-56 py-2.5" />
                            </tr>
                        </thead>
                        <tbody>
                            {sorteos.map(s => (
                                <SorteoRow key={s.id} sorteo={s} onDelete={setDeleteTarget} onPreview={setPreviewSorteo} onStats={setStatsSorteo} onEdit={setEditSorteo} />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <SorteoStatsModal sorteo={statsSorteo} onClose={() => setStatsSorteo(null)} />

            <CreateSorteoModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />

            <EditSorteoModal sorteo={editSorteo} onClose={() => setEditSorteo(null)} />

            <RuletaModal
                isOpen={!!previewSorteo}
                onClose={() => setPreviewSorteo(null)}
                sorteoName={previewSorteo?.name ?? ''}
                options={previewOptions}
                sorteoId={previewSorteo?.id}
                minSpinsBetweenPrizes={previewSorteo?.minSpinsBetweenPrizes}
            />

            <DeleteConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => {
                    if (deleteTarget) {
                        deleteSorteo.mutate(deleteTarget.id)
                        setDeleteTarget(null)
                    }
                }}
                title="Eliminar sorteo"
                description={`¿Eliminar "${deleteTarget?.name}"? Se borrarán todas las opciones, participantes y registros de participación.`}
                isPending={deleteSorteo.isPending}
            />
        </div>
    )
}
