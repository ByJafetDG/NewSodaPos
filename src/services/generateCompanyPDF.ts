import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from '@/lib/utils'

interface GenerateCompanyPDFInput {
    companyName: string
    businessName: string
    employees: { name: string; phone: string | null; pendingTotal: number; pendingCount: number }[]
    totalDebt: number
}

export function generateCompanyStatementPDF(input: GenerateCompanyPDFInput): string {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 18
    const now = new Date()
    const dateStr = now.toLocaleDateString('es-CR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    // ── Header bar ───────────────────────────────────────────────────────────────
    doc.setFillColor(11, 14, 25)
    doc.rect(0, 0, pageW, 38, 'F')

    // Business name (top-left, small)
    doc.setTextColor(139, 92, 246)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(input.businessName.toUpperCase(), margin, 13)

    // "Estado de Cuenta" title
    doc.setTextColor(228, 236, 247)
    doc.setFontSize(16)
    doc.text('Estado de Cuenta', margin, 25)

    // Date (top-right)
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text(dateStr, pageW - margin, 13, { align: 'right' })

    // Company name (right, large)
    doc.setTextColor(251, 146, 60)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(input.companyName, pageW - margin, 25, { align: 'right' })

    // ── Summary strip ────────────────────────────────────────────────────────────
    doc.setFillColor(255, 247, 237)
    doc.setDrawColor(251, 146, 60)
    doc.setLineWidth(0.3)
    doc.roundedRect(margin, 43, pageW - margin * 2, 18, 2, 2, 'FD')

    doc.setTextColor(120, 53, 15)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('TOTAL ADEUDADO', margin + 6, 50)

    doc.setTextColor(234, 88, 12)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(formatCurrency(input.totalDebt), margin + 6, 57)

    doc.setTextColor(120, 53, 15)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.text(
        `${input.employees.length} colaborador${input.employees.length !== 1 ? 'es' : ''} con saldo pendiente`,
        pageW - margin - 6, 57, { align: 'right' }
    )

    // ── Table ─────────────────────────────────────────────────────────────────────
    autoTable(doc, {
        startY: 67,
        margin: { left: margin, right: margin },
        head: [['Colaborador', 'Teléfono', 'Cuentas', 'Saldo pendiente']],
        body: input.employees.map(e => [
            e.name,
            e.phone || '—',
            `${e.pendingCount}`,
            formatCurrency(e.pendingTotal),
        ]),
        foot: [['', '', 'Total', formatCurrency(input.totalDebt)]],
        showFoot: 'lastPage',
        headStyles: {
            fillColor: [11, 14, 25],
            textColor: [100, 116, 139],
            fontSize: 8,
            fontStyle: 'bold',
        },
        bodyStyles: {
            fontSize: 10,
            textColor: [30, 41, 59],
        },
        footStyles: {
            fillColor: [255, 247, 237],
            textColor: [234, 88, 12],
            fontSize: 11,
            fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 32 },
            2: { cellWidth: 22, halign: 'center' },
            3: { cellWidth: 42, halign: 'right', fontStyle: 'bold', textColor: [234, 88, 12] as [number, number, number] },
        },
    })

    // ── Footer ────────────────────────────────────────────────────────────────────
    const finalY: number = (doc as any).lastAutoTable.finalY + 7
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.setFont('helvetica', 'normal')
    doc.text(
        `Generado el ${dateStr} · ${input.businessName} · Sistema POS`,
        pageW / 2, finalY, { align: 'center' }
    )

    return (doc.output('datauristring') as string).split(',')[1]
}
