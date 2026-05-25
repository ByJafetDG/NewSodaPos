// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptItem {
    name: string
    quantity: number
    unitPrice: number
    subtotal: number
}

interface SendReceiptInput {
    to: string
    clientName: string
    businessName: string
    saleNumber: number
    date: string
    items: ReceiptItem[]
    subtotal: number
    discount: number
    total: number
    logoUrl?: string | null
    modifiedFromSaleNumber?: number | null
}

interface SettledSaleInfo {
    saleNumber: number
    date: string
    items: ReceiptItem[]
    subtotal: number
    discount: number
    total: number
}

interface NewSaleInfo {
    saleNumber: number
    items: ReceiptItem[]
    subtotal: number
    discount: number
    total: number
    paymentMethod: string
}

interface SendSettledInput {
    to: string
    clientName: string
    businessName: string
    sales: SettledSaleInfo[]
    logoUrl?: string | null
    newSale?: NewSaleInfo
}

export interface MixedPaymentInfo {
    efectivo?: number
    sinpe?: number
    cuenta: number
}

interface SendMixedCreditInput {
    to: string
    clientName: string
    businessName: string
    saleNumber: number
    creditNoteNumber: number
    date: string
    items: ReceiptItem[]
    subtotal: number
    discount: number
    fullTotal: number
    payment: MixedPaymentInfo
    logoUrl?: string | null
}

export interface SplitCreditProductInfo {
    name: string
    totalPrice: number
    clientAmount: number
}

interface SendSplitCreditInput {
    to: string
    clientName: string
    businessName: string
    saleNumber: number
    date: string
    products: SplitCreditProductInfo[]
    allClientNames: string[]
    totalCharged: number
    logoUrl?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESSAGES = [
    '¡Que tengas un excelente día!',
    '¡Gracias por tu preferencia!',
    '¡Nos alegra tenerte como cliente!',
    '¡Siempre a tu servicio!',
    '¡Vuelve pronto, te esperamos!',
]

function fmt(n: number) {
    return `₡${n.toLocaleString('es-CR', { minimumFractionDigits: 0 })}`
}

function randomMsg() {
    return MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
}

function logoCell(initial: string, bg: string, border: string, iconColor: string, logoUrl?: string | null): string {
    const inner = logoUrl
        ? `<img src="${logoUrl}" width="72" height="72" style="display:block;border-radius:16px;object-fit:cover;" alt="Logo" />`
        : `<span style="font-size:28px;font-weight:800;color:${iconColor};letter-spacing:-1px;">${initial}</span>`
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
        <tr>
          <td width="72" height="72" bgcolor="${bg}" style="width:72px;height:72px;background:${bg};border:1px solid ${border};border-radius:16px;text-align:center;vertical-align:middle;padding:0;overflow:hidden;">
            ${inner}
          </td>
        </tr>
      </table>`
}

// Shared item rows
function itemRows(items: ReceiptItem[]): string {
    return items.map(it => `
    <tr>
      <td bgcolor="#0f172a" style="padding:14px 0;border-bottom:1px solid #1e293b;background:#0f172a;">
        <span style="display:block;font-size:14px;color:#e2e8f0;font-weight:600;">${it.name}</span>
        <span style="display:block;font-size:11px;color:#475569;margin-top:3px;">${it.quantity} unidad${it.quantity !== 1 ? 'es' : ''} &nbsp;·&nbsp; ${fmt(it.unitPrice)} c/u</span>
      </td>
      <td bgcolor="#0f172a" style="padding:14px 0;border-bottom:1px solid #1e293b;text-align:right;vertical-align:top;background:#0f172a;white-space:nowrap;">
        <span style="font-size:14px;color:#f1f5f9;font-weight:600;font-family:'Courier New',Courier,monospace;">${fmt(it.subtotal)}</span>
      </td>
    </tr>`).join('')
}

function discountRow(discount: number): string {
    if (!discount) return ''
    return `
    <tr>
      <td bgcolor="#0f172a" style="padding:5px 0;font-size:12px;color:#34d399;background:#0f172a;">Descuento</td>
      <td bgcolor="#0f172a" style="padding:5px 0;font-size:12px;color:#34d399;text-align:right;font-family:'Courier New',Courier,monospace;background:#0f172a;">&#8722; ${fmt(discount)}</td>
    </tr>`
}

// Shared outer wrapper
function emailWrapper(inner: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>${title}</title>
  <style>
    @media only screen and (max-width:600px){
      .email-body{padding:20px 8px!important;}
      .email-card{border-radius:16px!important;}
      .email-pad{padding-left:24px!important;padding-right:24px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;" bgcolor="#0b0f1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0b0f1a" style="background:#0b0f1a;" class="email-body">
<tr><td style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;" class="email-card">

${inner}

</table>
</td></tr>
</table>
</body>
</html>`
}

// Top accent bar
function accentTop(color1: string, color2: string): string {
    return `<tr>
    <td height="5" bgcolor="${color1}" style="height:5px;background:${color1};font-size:0;line-height:0;border-radius:14px 14px 0 0;">&nbsp;</td>
  </tr>`
}

// Bottom accent bar
function accentBottom(color: string): string {
    return `<tr>
    <td height="4" bgcolor="${color}" style="height:4px;background:${color};font-size:0;line-height:0;border-radius:0 0 14px 14px;">&nbsp;</td>
  </tr>`
}

// Footer
function footerRow(businessName: string): string {
    return `<tr>
    <td bgcolor="#080d16" style="background:#080d16;padding:18px 36px 24px;border-radius:0 0 14px 14px;border:1px solid #1e293b;border-top:0;text-align:center;" class="email-pad">
      <p style="margin:0;font-size:11px;color:#334155;line-height:1.9;">
        Recibo generado por <strong style="color:#475569;">${businessName}</strong> &nbsp;·&nbsp; POS Soda El Pelón<br>
        ¿Preguntas? Contáctanos directamente.
      </p>
    </td>
  </tr>`
}

// Message row
function messageRow(): string {
    return `<tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:22px 36px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;border-top:1px solid #1e293b;" class="email-pad">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.9;font-style:italic;">&ldquo;${randomMsg()}&rdquo;</p>
    </td>
  </tr>`
}

// ─── Template: Normal invoice receipt (paid, not credit) ─────────────────────

interface SendInvoiceReceiptInput {
    to: string
    clientName: string
    businessName: string
    saleNumber: number
    date: string
    items: ReceiptItem[]
    subtotal: number
    discount: number
    total: number
    paymentMethod: string
    logoUrl?: string | null
}

function fmtMethod(method: string): string {
    if (method === 'EFECTIVO') return 'Efectivo'
    if (method === 'SINPE') return 'SINPE'
    return method
}

function buildInvoiceReceiptHTML(input: SendInvoiceReceiptInput, logoUrl?: string | null): string {
    const initial = input.businessName.charAt(0).toUpperCase()
    const dateStr = new Date(input.date).toLocaleDateString('es-CR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })

    const inner = `
  ${accentTop('#0369a1', '#0284c7')}

  <!-- Header -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:36px 36px 28px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      ${logoCell(initial, '#082f49', '#0284c755', '#38bdf8', logoUrl)}
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">${input.businessName}</h1>
      <p style="margin:0 0 18px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:2.5px;">Recibo de venta</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#082f49" style="padding:5px 18px;background:#082f49;border:1px solid #0284c744;border-radius:99px;">
            <span style="font-size:10px;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:2px;">&#10003; ${fmtMethod(input.paymentMethod)}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Client + Meta -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:22px 0 18px;border-bottom:1px dashed #1e293b;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#0f172a" style="vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Facturado a</p>
                  <p style="margin:0;font-size:18px;font-weight:700;color:#f1f5f9;">${input.clientName}</p>
                </td>
                <td bgcolor="#0f172a" style="text-align:right;vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Factura</p>
                  <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#f1f5f9;font-family:'Courier New',Courier,monospace;">#${input.saleNumber}</p>
                  <p style="margin:0;font-size:11px;color:#475569;">${dateStr}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Items -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:16px 0 8px;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Producto</td>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;text-align:right;">Monto</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${itemRows(input.items)}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;padding-top:12px;border-top:1px dashed #1e293b;">
        <tr>
          <td bgcolor="#0f172a" style="font-size:12px;color:#475569;padding:4px 0;background:#0f172a;">Subtotal</td>
          <td bgcolor="#0f172a" style="font-size:12px;color:#64748b;text-align:right;font-family:'Courier New',Courier,monospace;padding:4px 0;background:#0f172a;">${fmt(input.subtotal)}</td>
        </tr>
        ${discountRow(input.discount)}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="24" style="height:24px;background:#0f172a;">&nbsp;</td></tr></table>
    </td>
  </tr>

  <!-- Total -->
  <tr>
    <td bgcolor="#071e2e" style="background:#071e2e;padding:28px 36px;text-align:center;border-left:1px solid #0284c744;border-right:1px solid #0284c744;border-top:1px solid #0284c733;" class="email-pad">
      <p style="margin:0 0 6px;font-size:10px;color:#0369a1;text-transform:uppercase;letter-spacing:2.5px;">Total Pagado</p>
      <p style="margin:0 0 12px;font-size:44px;font-weight:800;color:#f1f5f9;font-family:'Courier New',Courier,monospace;letter-spacing:-2px;line-height:1;">${fmt(input.total)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#082f49" style="padding:5px 16px;background:#082f49;border:1px solid #0284c740;border-radius:99px;">
            <span style="font-size:11px;color:#38bdf8;font-weight:600;">&#10003; Pago recibido &nbsp;·&nbsp; ${fmtMethod(input.paymentMethod)}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${messageRow()}
  ${footerRow(input.businessName)}
  ${accentBottom('#0284c7')}`

    return emailWrapper(inner, `Factura #${input.saleNumber}`)
}

// ─── Template: Credit receipt ────────────────────────────────────────────────

function buildHTML(input: SendReceiptInput, logoUrl?: string | null): string {
    const initial = input.businessName.charAt(0).toUpperCase()
    const dateStr = new Date(input.date).toLocaleDateString('es-CR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })

    const inner = `
  ${accentTop('#7c3aed', '#4f46e5')}

  <!-- Header -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:36px 36px 28px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      ${logoCell(initial, '#1e1b4b', '#7c3aed55', '#a78bfa', logoUrl)}
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">${input.businessName}</h1>
      <p style="margin:0 0 18px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:2.5px;">Recibo de crédito</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#1e1b4b" style="padding:5px 18px;background:#1e1b4b;border:1px solid #7c3aed44;border-radius:99px;">
            <span style="font-size:10px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:2px;">&#10022; A Crédito</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${input.modifiedFromSaleNumber ? `
  <!-- Modification notice -->
  <tr>
    <td bgcolor="#1c1500" style="background:#1c1500;padding:12px 36px;border-left:1px solid #d9770640;border-right:1px solid #d9770640;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle;padding-right:10px;width:24px;">
            <span style="font-size:15px;">&#9888;&#65039;</span>
          </td>
          <td>
            <p style="margin:0 0 2px;font-size:12px;font-weight:700;color:#fbbf24;">Factura corregida</p>
            <p style="margin:0;font-size:11px;color:#92400e;">Esta factura reemplaza a la <strong style="color:#fbbf24;">#${input.modifiedFromSaleNumber}</strong>. Los montos anteriores quedaron sin efecto.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>` : ''}

  <!-- Client + Meta -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:22px 0 18px;border-bottom:1px dashed #1e293b;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#0f172a" style="vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Cliente</p>
                  <p style="margin:0;font-size:18px;font-weight:700;color:#f1f5f9;">${input.clientName}</p>
                </td>
                <td bgcolor="#0f172a" style="text-align:right;vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Factura</p>
                  <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#f1f5f9;font-family:'Courier New',Courier,monospace;">#${input.saleNumber}</p>
                  <p style="margin:0;font-size:11px;color:#475569;">${dateStr}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Items -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:16px 0 8px;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Producto</td>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;text-align:right;">Monto</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${itemRows(input.items)}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;padding-top:12px;border-top:1px dashed #1e293b;">
        <tr>
          <td bgcolor="#0f172a" style="font-size:12px;color:#475569;padding:4px 0;background:#0f172a;">Subtotal</td>
          <td bgcolor="#0f172a" style="font-size:12px;color:#64748b;text-align:right;font-family:'Courier New',Courier,monospace;padding:4px 0;background:#0f172a;">${fmt(input.subtotal)}</td>
        </tr>
        ${discountRow(input.discount)}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="24" style="height:24px;background:#0f172a;">&nbsp;</td></tr></table>
    </td>
  </tr>

  <!-- Total -->
  <tr>
    <td bgcolor="#13102b" style="background:#13102b;padding:28px 36px;text-align:center;border-left:1px solid #7c3aed44;border-right:1px solid #7c3aed44;border-top:1px solid #7c3aed33;" class="email-pad">
      <p style="margin:0 0 6px;font-size:10px;color:#6d28d9;text-transform:uppercase;letter-spacing:2.5px;">Total a Pagar</p>
      <p style="margin:0 0 12px;font-size:44px;font-weight:800;color:#f1f5f9;font-family:'Courier New',Courier,monospace;letter-spacing:-2px;line-height:1;">${fmt(input.total)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#1e1b4b" style="padding:5px 16px;background:#1e1b4b;border:1px solid #7c3aed40;border-radius:99px;">
            <span style="font-size:11px;color:#8b5cf6;font-weight:600;">Pendiente de pago</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${messageRow()}
  ${footerRow(input.businessName)}
  ${accentBottom('#7c3aed')}`

    return emailWrapper(inner, `Recibo #${input.saleNumber}`)
}

// ─── Template: Settled / paid ─────────────────────────────────────────────────

function buildSettledHTML(input: SendSettledInput, logoUrl?: string | null): string {
    const initial = input.businessName.charAt(0).toUpperCase()
    const isSingle = input.sales.length === 1

    function saleBlock(sale: SettledSaleInfo, first: boolean) {
        const dateStr = new Date(sale.date).toLocaleDateString('es-CR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
        const rows = sale.items.map(it => `
        <tr>
          <td bgcolor="#0f172a" style="padding:12px 0;border-bottom:1px solid #1e293b;background:#0f172a;">
            <span style="display:block;font-size:14px;color:#e2e8f0;font-weight:600;">${it.name}</span>
            <span style="display:block;font-size:11px;color:#475569;margin-top:3px;">${it.quantity} unid. &nbsp;·&nbsp; ${fmt(it.unitPrice)} c/u</span>
          </td>
          <td bgcolor="#0f172a" style="padding:12px 0;border-bottom:1px solid #1e293b;text-align:right;vertical-align:top;background:#0f172a;white-space:nowrap;">
            <span style="font-size:14px;color:#f1f5f9;font-weight:600;font-family:'Courier New',Courier,monospace;">${fmt(it.subtotal)}</span>
          </td>
        </tr>`).join('')

        const saleTotalRow = !isSingle ? `
        <tr>
          <td bgcolor="#0f172a" style="padding-top:6px;font-size:13px;font-weight:700;color:#34d399;background:#0f172a;">Total venta</td>
          <td bgcolor="#0f172a" style="padding-top:6px;font-size:13px;font-weight:700;color:#34d399;text-align:right;font-family:'Courier New',Courier,monospace;background:#0f172a;">${fmt(sale.total)}</td>
        </tr>` : ''

        const separator = (!isSingle && !first) ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="1" style="height:1px;background:#1e293b;font-size:0;">&nbsp;</td></tr></table>` : ''

        const saleHeader = !isSingle ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
          <tr>
            <td bgcolor="#0f172a" style="font-size:12px;font-weight:700;color:#34d399;font-family:'Courier New',Courier,monospace;background:#0f172a;">Venta #${sale.saleNumber}</td>
            <td bgcolor="#0f172a" style="font-size:11px;color:#475569;text-align:right;background:#0f172a;">${dateStr}</td>
          </tr>
        </table>` : ''

        return `${separator}${saleHeader}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;padding-top:10px;border-top:1px dashed #1e293b;">
          <tr>
            <td bgcolor="#0f172a" style="font-size:12px;color:#475569;padding:3px 0;background:#0f172a;">Subtotal</td>
            <td bgcolor="#0f172a" style="font-size:12px;color:#64748b;text-align:right;font-family:'Courier New',Courier,monospace;padding:3px 0;background:#0f172a;">${fmt(sale.subtotal)}</td>
          </tr>
          ${sale.discount > 0 ? `<tr>
            <td bgcolor="#0f172a" style="padding:3px 0;font-size:12px;color:#34d399;background:#0f172a;">Descuento</td>
            <td bgcolor="#0f172a" style="padding:3px 0;font-size:12px;color:#34d399;text-align:right;font-family:'Courier New',Courier,monospace;background:#0f172a;">&#8722; ${fmt(sale.discount)}</td>
          </tr>` : ''}
          ${saleTotalRow}
        </table>`
    }

    const single = isSingle ? input.sales[0] : null
    const singleDateStr = single ? new Date(single.date).toLocaleDateString('es-CR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }) : ''
    const salesContent = input.sales.map((sale, i) => saleBlock(sale, i === 0)).join('')
    const grandTotal = (input.newSale?.total ?? 0) + input.sales.reduce((s, sale) => s + sale.total, 0)

    const newSaleBlock = input.newSale ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
      <tr>
        <td bgcolor="#0f172a" style="font-size:12px;font-weight:700;color:#38bdf8;background:#0f172a;">Compra del día &nbsp;·&nbsp; #${input.newSale.saleNumber}</td>
        <td bgcolor="#0f172a" style="font-size:11px;color:#475569;text-align:right;background:#0f172a;">${fmtMethod(input.newSale.paymentMethod)}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${input.newSale.items.map(it => `
      <tr>
        <td bgcolor="#0f172a" style="padding:12px 0;border-bottom:1px solid #1e293b;background:#0f172a;">
          <span style="display:block;font-size:14px;color:#e2e8f0;font-weight:600;">${it.name}</span>
          <span style="display:block;font-size:11px;color:#475569;margin-top:3px;">${it.quantity} unid. &nbsp;·&nbsp; ${fmt(it.unitPrice)} c/u</span>
        </td>
        <td bgcolor="#0f172a" style="padding:12px 0;border-bottom:1px solid #1e293b;text-align:right;vertical-align:top;background:#0f172a;white-space:nowrap;">
          <span style="font-size:14px;color:#f1f5f9;font-weight:600;font-family:'Courier New',Courier,monospace;">${fmt(it.subtotal)}</span>
        </td>
      </tr>`).join('')}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;padding-top:10px;border-top:1px dashed #1e293b;">
      <tr>
        <td bgcolor="#0f172a" style="font-size:12px;color:#475569;padding:3px 0;background:#0f172a;">Subtotal compra</td>
        <td bgcolor="#0f172a" style="font-size:12px;color:#64748b;text-align:right;font-family:'Courier New',Courier,monospace;padding:3px 0;background:#0f172a;">${fmt(input.newSale.subtotal)}</td>
      </tr>
      ${input.newSale.discount > 0 ? `<tr>
        <td bgcolor="#0f172a" style="padding:3px 0;font-size:12px;color:#34d399;background:#0f172a;">Descuento</td>
        <td bgcolor="#0f172a" style="padding:3px 0;font-size:12px;color:#34d399;text-align:right;font-family:'Courier New',Courier,monospace;background:#0f172a;">&#8722; ${fmt(input.newSale.discount)}</td>
      </tr>` : ''}
      <tr>
        <td bgcolor="#0f172a" style="font-size:13px;font-weight:700;color:#38bdf8;padding:4px 0;background:#0f172a;">Total compra</td>
        <td bgcolor="#0f172a" style="font-size:13px;font-weight:700;color:#38bdf8;text-align:right;font-family:'Courier New',Courier,monospace;padding:4px 0;background:#0f172a;">${fmt(input.newSale.total)}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="18" style="height:18px;background:#0f172a;">&nbsp;</td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="1" style="height:1px;background:#1e293b;font-size:0;">&nbsp;</td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="14" style="height:14px;background:#0f172a;">&nbsp;</td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td bgcolor="#0f172a" style="font-size:12px;font-weight:700;color:#34d399;background:#0f172a;">Cuentas saldadas</td>
        <td bgcolor="#0f172a" style="font-size:11px;color:#475569;text-align:right;background:#0f172a;">${input.sales.length} cuenta${input.sales.length !== 1 ? 's' : ''}</td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td bgcolor="#0f172a" height="6" style="height:6px;background:#0f172a;">&nbsp;</td></tr></table>
    ` : ''

    const inner = `
  ${accentTop('#059669', '#10b981')}

  <!-- Header -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:36px 36px 28px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      ${logoCell(initial, '#052e16', '#10b98155', '#34d399', logoUrl)}
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">${input.businessName}</h1>
      <p style="margin:0 0 18px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:2.5px;">${isSingle ? 'Confirmación de pago' : 'Resumen de pagos'}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#052e16" style="padding:5px 18px;background:#052e16;border:1px solid #10b98144;border-radius:99px;">
            <span style="font-size:10px;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:2px;">&#10003; ${isSingle ? 'Pagada' : `${input.sales.length} cuentas saldadas`}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Client + Meta -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:22px 0 18px;border-bottom:1px dashed #1e293b;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#0f172a" style="vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Cliente</p>
                  <p style="margin:0;font-size:18px;font-weight:700;color:#f1f5f9;">${input.clientName}</p>
                </td>
                ${isSingle
                    ? `<td bgcolor="#0f172a" style="text-align:right;vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Factura</p>
                  <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#f1f5f9;font-family:'Courier New',Courier,monospace;">#${single!.saleNumber}</p>
                  <p style="margin:0;font-size:11px;color:#475569;">${singleDateStr}</p>
                </td>`
                    : `<td bgcolor="#0f172a" style="text-align:right;vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Cuentas</p>
                  <p style="margin:0;font-size:24px;font-weight:700;color:#34d399;font-family:'Courier New',Courier,monospace;">${input.sales.length}</p>
                </td>`}
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Items -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:16px 0 8px;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Producto</td>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;text-align:right;">Monto</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      ${newSaleBlock}${salesContent}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="24" style="height:24px;background:#0f172a;">&nbsp;</td></tr></table>
    </td>
  </tr>

  <!-- Total -->
  <tr>
    <td bgcolor="#071f12" style="background:#071f12;padding:28px 36px;text-align:center;border-left:1px solid #10b98144;border-right:1px solid #10b98144;border-top:1px solid #10b98133;" class="email-pad">
      <p style="margin:0 0 6px;font-size:10px;color:#065f46;text-transform:uppercase;letter-spacing:2.5px;">${input.newSale ? 'Total Cobrado' : isSingle ? 'Total Pagado' : 'Total Saldado'}</p>
      <p style="margin:0 0 12px;font-size:44px;font-weight:800;color:#f1f5f9;font-family:'Courier New',Courier,monospace;letter-spacing:-2px;line-height:1;">${fmt(grandTotal)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#052e16" style="padding:5px 16px;background:#052e16;border:1px solid #10b98140;border-radius:99px;">
            <span style="font-size:11px;color:#34d399;font-weight:600;">&#10003; Cuenta${input.sales.length !== 1 ? 's' : ''} al día</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${messageRow()}
  ${footerRow(input.businessName)}
  ${accentBottom('#10b981')}`

    return emailWrapper(inner, isSingle ? `Pago #${single!.saleNumber}` : `${input.sales.length} cuentas saldadas`)
}

// ─── Template: Mixed payment ──────────────────────────────────────────────────

function buildMixedCreditHTML(input: SendMixedCreditInput, logoUrl?: string | null): string {
    const initial = input.businessName.charAt(0).toUpperCase()
    const dateStr = new Date(input.date).toLocaleDateString('es-CR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
    const payRows = [
        input.payment.efectivo ? `<tr>
          <td bgcolor="#1a1008" style="padding:6px 0;font-size:13px;color:#d1d5db;background:#1a1008;">Efectivo</td>
          <td bgcolor="#1a1008" style="padding:6px 0;font-size:13px;color:#e2e8f0;text-align:right;font-family:'Courier New',Courier,monospace;background:#1a1008;">${fmt(input.payment.efectivo)}</td>
        </tr>` : '',
        input.payment.sinpe ? `<tr>
          <td bgcolor="#1a1008" style="padding:6px 0;font-size:13px;color:#d1d5db;background:#1a1008;">SINPE</td>
          <td bgcolor="#1a1008" style="padding:6px 0;font-size:13px;color:#60a5fa;text-align:right;font-family:'Courier New',Courier,monospace;background:#1a1008;">${fmt(input.payment.sinpe)}</td>
        </tr>` : '',
        `<tr>
          <td bgcolor="#1a1008" style="padding:6px 0;font-size:13px;font-weight:700;color:#fb923c;background:#1a1008;">Cargo a tu cuenta</td>
          <td bgcolor="#1a1008" style="padding:6px 0;font-size:13px;font-weight:700;color:#fb923c;text-align:right;font-family:'Courier New',Courier,monospace;background:#1a1008;">${fmt(input.payment.cuenta)}</td>
        </tr>`,
    ].filter(Boolean).join('')

    const inner = `
  ${accentTop('#ea580c', '#f97316')}

  <!-- Header -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:36px 36px 28px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      ${logoCell(initial, '#1c0a00', '#f9731655', '#fb923c', logoUrl)}
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">${input.businessName}</h1>
      <p style="margin:0 0 18px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:2.5px;">Pago mixto</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#1c0a00" style="padding:5px 18px;background:#1c0a00;border:1px solid #f9731644;border-radius:99px;">
            <span style="font-size:10px;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:2px;">Compra #${input.saleNumber}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Client + Meta -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:22px 0 18px;border-bottom:1px dashed #1e293b;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#0f172a" style="vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Cliente</p>
                  <p style="margin:0;font-size:18px;font-weight:700;color:#f1f5f9;">${input.clientName}</p>
                </td>
                <td bgcolor="#0f172a" style="text-align:right;vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Fecha</p>
                  <p style="margin:0;font-size:11px;color:#475569;">${dateStr}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Items -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td bgcolor="#0f172a" style="padding:16px 0 8px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;background:#0f172a;">Productos</td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows(input.items)}</table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;padding-top:12px;border-top:1px dashed #1e293b;">
        <tr>
          <td bgcolor="#0f172a" style="font-size:12px;color:#475569;padding:3px 0;background:#0f172a;">Subtotal</td>
          <td bgcolor="#0f172a" style="font-size:12px;color:#64748b;text-align:right;font-family:'Courier New',Courier,monospace;padding:3px 0;background:#0f172a;">${fmt(input.subtotal)}</td>
        </tr>
        ${discountRow(input.discount)}
        <tr>
          <td bgcolor="#0f172a" style="font-size:14px;font-weight:700;color:#e2e8f0;padding:6px 0 2px;background:#0f172a;">Total compra</td>
          <td bgcolor="#0f172a" style="font-size:14px;font-weight:700;color:#e2e8f0;text-align:right;font-family:'Courier New',Courier,monospace;padding:6px 0 2px;background:#0f172a;">${fmt(input.fullTotal)}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="20" style="height:20px;background:#0f172a;">&nbsp;</td></tr></table>
    </td>
  </tr>

  <!-- Payment breakdown -->
  <tr>
    <td bgcolor="#1a1008" style="background:#1a1008;padding:20px 36px;border-left:1px solid #f9731633;border-right:1px solid #f9731633;border-top:1px solid #f9731633;" class="email-pad">
      <p style="margin:0 0 12px;font-size:10px;color:#78350f;text-transform:uppercase;letter-spacing:2px;font-weight:700;">Desglose del pago</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${payRows}</table>
    </td>
  </tr>

  <!-- Total charged -->
  <tr>
    <td bgcolor="#1c0e00" style="background:#1c0e00;padding:24px 36px;text-align:center;border-left:1px solid #f9731644;border-right:1px solid #f9731644;border-top:1px solid #f9731633;" class="email-pad">
      <p style="margin:0 0 6px;font-size:10px;color:#78350f;text-transform:uppercase;letter-spacing:2.5px;">Cargado a tu cuenta</p>
      <p style="margin:0 0 12px;font-size:44px;font-weight:800;color:#fb923c;font-family:'Courier New',Courier,monospace;letter-spacing:-2px;line-height:1;">${fmt(input.payment.cuenta)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#1c0a00" style="padding:5px 16px;background:#1c0a00;border:1px solid #f9731640;border-radius:99px;">
            <span style="font-size:11px;color:#fb923c;font-weight:600;">Pendiente de pago &nbsp;·&nbsp; Nota #${input.creditNoteNumber}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${footerRow(input.businessName)}
  ${accentBottom('#f97316')}`

    return emailWrapper(inner, `Pago mixto #${input.saleNumber}`)
}

// ─── Template: Split credit ───────────────────────────────────────────────────

function buildSplitCreditHTML(input: SendSplitCreditInput, logoUrl?: string | null): string {
    const initial = input.businessName.charAt(0).toUpperCase()
    const dateStr = new Date(input.date).toLocaleDateString('es-CR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
    const othersStr = input.allClientNames.filter(n => n !== input.clientName).join(', ')
    const rows = input.products.map(p => `
    <tr>
      <td bgcolor="#0f172a" style="padding:14px 0;border-bottom:1px solid #1e293b;background:#0f172a;">
        <span style="display:block;font-size:14px;color:#e2e8f0;font-weight:600;">${p.name}</span>
        <span style="display:block;font-size:11px;color:#475569;margin-top:3px;">Precio total: ${fmt(p.totalPrice)} &nbsp;·&nbsp; <strong style="color:#fb923c;">Tu parte: ${fmt(p.clientAmount)}</strong></span>
      </td>
      <td bgcolor="#0f172a" style="padding:14px 0;border-bottom:1px solid #1e293b;text-align:right;vertical-align:top;background:#0f172a;white-space:nowrap;">
        <span style="font-size:14px;color:#fb923c;font-weight:700;font-family:'Courier New',Courier,monospace;">${fmt(p.clientAmount)}</span>
      </td>
    </tr>`).join('')

    const inner = `
  ${accentTop('#ea580c', '#f97316')}

  <!-- Header -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:36px 36px 28px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      ${logoCell(initial, '#1c0a00', '#f9731655', '#fb923c', logoUrl)}
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">${input.businessName}</h1>
      <p style="margin:0 0 18px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:2.5px;">Crédito dividido</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#1c0a00" style="padding:5px 18px;background:#1c0a00;border:1px solid #f9731644;border-radius:99px;">
            <span style="font-size:10px;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:2px;">Compra #${input.saleNumber}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Client + Meta -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:22px 0 18px;border-bottom:1px dashed #1e293b;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#0f172a" style="vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Cliente</p>
                  <p style="margin:0;font-size:18px;font-weight:700;color:#f1f5f9;">${input.clientName}</p>
                </td>
                <td bgcolor="#0f172a" style="text-align:right;vertical-align:top;background:#0f172a;">
                  <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Factura</p>
                  <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#f1f5f9;font-family:'Courier New',Courier,monospace;">#${input.saleNumber}</p>
                  <p style="margin:0;font-size:11px;color:#475569;">${dateStr}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${othersStr ? `<tr>
    <td bgcolor="#1a0e00" style="background:#1a0e00;padding:12px 36px;border-left:1px solid #f9731633;border-right:1px solid #f9731633;" class="email-pad">
      <p style="margin:0;font-size:12px;color:#92400e;">Compra compartida con: <strong style="color:#fb923c;">${othersStr}</strong></p>
    </td>
  </tr>` : ''}

  <!-- Items -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:16px 0 8px;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Producto</td>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;text-align:right;">Tu parte</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="20" style="height:20px;background:#0f172a;">&nbsp;</td></tr></table>
    </td>
  </tr>

  <!-- Total -->
  <tr>
    <td bgcolor="#1c0e00" style="background:#1c0e00;padding:28px 36px;text-align:center;border-left:1px solid #f9731644;border-right:1px solid #f9731644;border-top:1px solid #f9731633;" class="email-pad">
      <p style="margin:0 0 6px;font-size:10px;color:#78350f;text-transform:uppercase;letter-spacing:2.5px;">Cargado a tu cuenta</p>
      <p style="margin:0 0 12px;font-size:44px;font-weight:800;color:#fb923c;font-family:'Courier New',Courier,monospace;letter-spacing:-2px;line-height:1;">${fmt(input.totalCharged)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#1c0a00" style="padding:5px 16px;background:#1c0a00;border:1px solid #f9731640;border-radius:99px;">
            <span style="font-size:11px;color:#fb923c;font-weight:600;">Pendiente de pago &nbsp;·&nbsp; Nota #${input.saleNumber}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${messageRow()}
  ${footerRow(input.businessName)}
  ${accentBottom('#f97316')}`

    return emailWrapper(inner, `Crédito dividido #${input.saleNumber}`)
}

// ─── Exported send functions ──────────────────────────────────────────────────

export async function sendReceiptEmail(input: SendReceiptInput): Promise<{ success: boolean; error?: string; isVerificationError?: boolean }> {
    try {
        const html = buildHTML(input, input.logoUrl)
        if (!window.electronAPI?.sendEmail) return { success: false, error: 'Entorno Electron no detectado' }
        const result = await window.electronAPI.sendEmail({
            from: `${input.businessName} <noreply@jafetduarte.dev>`,
            to: [input.to],
            subject: input.modifiedFromSaleNumber
                ? `Corrección Crédito #${input.saleNumber} (reemplaza #${input.modifiedFromSaleNumber}) — ${fmt(input.total)} | ${input.businessName}`
                : `Recibo #${input.saleNumber} — ${fmt(input.total)} | ${input.businessName}`,
            html,
        })
        if (!result.success) {
            const isVerificationError = result.error?.statusCode === 403 ||
                String(result.error?.message ?? '').includes('verify a domain')
            return { success: false, error: result.error?.message ?? 'Error desconocido', isVerificationError }
        }
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

export async function sendSettledEmail(input: SendSettledInput): Promise<{ success: boolean; error?: string; isVerificationError?: boolean }> {
    try {
        const html = buildSettledHTML(input, input.logoUrl)
        if (!window.electronAPI?.sendEmail) return { success: false, error: 'Entorno Electron no detectado' }
        const isSingle = input.sales.length === 1
        const debtTotal = input.sales.reduce((s, sale) => s + sale.total, 0)
        const combinedTotal = (input.newSale?.total ?? 0) + debtTotal
        const subject = input.newSale
            ? `Recibo #${input.newSale.saleNumber} + ${input.sales.length} cuenta${input.sales.length !== 1 ? 's' : ''} saldada${input.sales.length !== 1 ? 's' : ''} — ${fmt(combinedTotal)} | ${input.businessName}`
            : isSingle
                ? `Pago recibido #${input.sales[0].saleNumber} — ${fmt(debtTotal)} | ${input.businessName}`
                : `${input.sales.length} cuentas saldadas — ${fmt(debtTotal)} | ${input.businessName}`
        const result = await window.electronAPI.sendEmail({
            from: `${input.businessName.trim() || 'Recibos'} <noreply@jafetduarte.dev>`,
            to: [input.to],
            subject,
            html,
        })
        if (!result.success) {
            const isVerificationError = result.error?.statusCode === 403 ||
                String(result.error?.message ?? '').includes('verify a domain')
            return { success: false, error: result.error?.message ?? 'Error desconocido', isVerificationError }
        }
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

export async function sendMixedCreditEmail(input: SendMixedCreditInput): Promise<{ success: boolean; error?: string; isVerificationError?: boolean }> {
    try {
        const html = buildMixedCreditHTML(input, input.logoUrl)
        if (!window.electronAPI?.sendEmail) return { success: false, error: 'Entorno Electron no detectado' }
        const result = await window.electronAPI.sendEmail({
            from: `${input.businessName.trim() || 'Recibos'} <noreply@jafetduarte.dev>`,
            to: [input.to],
            subject: `Pago mixto #${input.saleNumber} — ${fmt(input.payment.cuenta)} cargado a tu cuenta | ${input.businessName}`,
            html,
        })
        if (!result.success) {
            const isVerificationError = result.error?.statusCode === 403 ||
                String(result.error?.message ?? '').includes('verify a domain')
            return { success: false, error: result.error?.message ?? 'Error desconocido', isVerificationError }
        }
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

export async function sendInvoiceReceiptEmail(input: SendInvoiceReceiptInput): Promise<{ success: boolean; error?: string; isVerificationError?: boolean }> {
    try {
        const html = buildInvoiceReceiptHTML(input, input.logoUrl)
        if (!window.electronAPI?.sendEmail) return { success: false, error: 'Entorno Electron no detectado' }
        const result = await window.electronAPI.sendEmail({
            from: `${input.businessName} <noreply@jafetduarte.dev>`,
            to: [input.to],
            subject: `Factura #${input.saleNumber} — ${fmt(input.total)} | ${input.businessName}`,
            html,
        })
        if (!result.success) {
            const isVerificationError = result.error?.statusCode === 403 ||
                String(result.error?.message ?? '').includes('verify a domain')
            return { success: false, error: result.error?.message ?? 'Error desconocido', isVerificationError }
        }
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

// ─── Template: Company billing ────────────────────────────────────────────────

interface CompanyEmployeeDebt {
    employeeName: string
    pendingTotal: number
}

interface SendCompanyBillingInput {
    to: string
    companyName: string
    businessName: string
    employees: CompanyEmployeeDebt[]
    logoUrl?: string | null
}

function buildCompanyBillingHTML(input: SendCompanyBillingInput): string {
    const grandTotal = input.employees.reduce((s, e) => s + e.pendingTotal, 0)
    const initial = input.businessName.charAt(0).toUpperCase()
    const dateStr = new Date().toLocaleDateString('es-CR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    const employeeRows = input.employees.map(e => `
    <tr>
      <td bgcolor="#0f172a" style="padding:14px 0;border-bottom:1px solid #1e293b;background:#0f172a;">
        <span style="font-size:14px;color:#e2e8f0;font-weight:600;">${e.employeeName}</span>
      </td>
      <td bgcolor="#0f172a" style="padding:14px 0;border-bottom:1px solid #1e293b;text-align:right;background:#0f172a;white-space:nowrap;">
        <span style="font-size:14px;color:#fb923c;font-weight:700;font-family:'Courier New',Courier,monospace;">${fmt(e.pendingTotal)}</span>
      </td>
    </tr>`).join('')

    const inner = `
  ${accentTop('#ea580c', '#f97316')}
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:36px 36px 28px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      ${logoCell(initial, '#1c0a00', '#f9731655', '#fb923c', input.logoUrl)}
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">${input.businessName}</h1>
      <p style="margin:0 0 18px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:2.5px;">Estado de cuenta empresarial</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#1c0a00" style="padding:5px 18px;background:#1c0a00;border:1px solid #f9731644;border-radius:99px;">
            <span style="font-size:10px;font-weight:700;color:#fb923c;text-transform:uppercase;letter-spacing:2px;">${dateStr}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:22px 0 18px;border-bottom:1px dashed #1e293b;background:#0f172a;">
            <p style="margin:0 0 3px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Empresa</p>
            <p style="margin:0;font-size:22px;font-weight:800;color:#f1f5f9;">${input.companyName}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#475569;">${input.employees.length} colaborador${input.employees.length !== 1 ? 'es' : ''} con saldo pendiente</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:16px 0 8px;background:#0f172a;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">Colaborador</td>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;text-align:right;">Saldo pendiente</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${employeeRows}</table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#0f172a" height="20" style="height:20px;background:#0f172a;">&nbsp;</td></tr></table>
    </td>
  </tr>
  <tr>
    <td bgcolor="#1c0e00" style="background:#1c0e00;padding:28px 36px;text-align:center;border-left:1px solid #f9731644;border-right:1px solid #f9731644;border-top:1px solid #f9731633;" class="email-pad">
      <p style="margin:0 0 6px;font-size:10px;color:#78350f;text-transform:uppercase;letter-spacing:2.5px;">Total adeudado</p>
      <p style="margin:0 0 12px;font-size:48px;font-weight:800;color:#fb923c;font-family:'Courier New',Courier,monospace;letter-spacing:-2px;line-height:1;">${fmt(grandTotal)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#1c0a00" style="padding:5px 16px;background:#1c0a00;border:1px solid #f9731640;border-radius:99px;">
            <span style="font-size:11px;color:#fb923c;font-weight:600;">Pendiente de pago</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${footerRow(input.businessName)}
  ${accentBottom('#f97316')}`

    return emailWrapper(inner, `Cobro empresarial — ${input.companyName}`)
}

export async function sendCompanyBillingEmail(input: SendCompanyBillingInput): Promise<{ success: boolean; error?: string; isVerificationError?: boolean }> {
    try {
        const html = buildCompanyBillingHTML(input)
        if (!window.electronAPI?.sendEmail) return { success: false, error: 'Entorno Electron no detectado' }
        const grandTotal = input.employees.reduce((s, e) => s + e.pendingTotal, 0)
        const result = await window.electronAPI.sendEmail({
            from: `${input.businessName.trim() || 'Recibos'} <noreply@jafetduarte.dev>`,
            to: [input.to],
            subject: `Estado de cuenta — ${input.companyName} — ${fmt(grandTotal)} pendiente | ${input.businessName}`,
            html,
        })
        if (!result.success) {
            const isVerificationError = result.error?.statusCode === 403 ||
                String(result.error?.message ?? '').includes('verify a domain')
            return { success: false, error: result.error?.message ?? 'Error desconocido', isVerificationError }
        }
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

function buildCompanyStatementPDFEmailHTML(input: {
    companyName: string
    businessName: string
    totalDebt: number
    employeeCount: number
    logoUrl?: string | null
}): string {
    const initial = input.businessName.charAt(0).toUpperCase()
    const dateStr = new Date().toLocaleDateString('es-CR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    const inner = `
  ${accentTop('#7c3aed', '#8b5cf6')}

  <!-- Header -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:36px 36px 28px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      ${logoCell(initial, '#1e1b4b', '#7c3aed55', '#a78bfa', input.logoUrl)}
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">${input.businessName}</h1>
      <p style="margin:0 0 18px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:2.5px;">Estado de cuenta · PDF adjunto</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td bgcolor="#1e1b4b" style="padding:5px 18px;background:#1e1b4b;border:1px solid #7c3aed44;border-radius:99px;">
            <span style="font-size:10px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:2px;">${dateStr}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Company info -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#0f172a" style="padding:24px 0 20px;border-bottom:1px dashed #1e293b;background:#0f172a;">
            <p style="margin:0 0 4px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Empresa</p>
            <p style="margin:0 0 6px;font-size:24px;font-weight:800;color:#f1f5f9;letter-spacing:-0.5px;">${input.companyName}</p>
            <p style="margin:0;font-size:12px;color:#475569;">${input.employeeCount} colaborador${input.employeeCount !== 1 ? 'es' : ''} con saldo pendiente</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Stats -->
  <tr>
    <td bgcolor="#0f172a" style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td bgcolor="#13102b" style="background:#13102b;padding:16px 20px;border:1px solid #7c3aed33;border-radius:12px;text-align:center;vertical-align:middle;">
            <p style="margin:0 0 4px;font-size:10px;color:#6d28d9;text-transform:uppercase;letter-spacing:2px;font-weight:700;">Total adeudado</p>
            <p style="margin:0;font-size:38px;font-weight:800;color:#c4b5fd;font-family:'Courier New',Courier,monospace;letter-spacing:-1.5px;line-height:1.1;">${fmt(input.totalDebt)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- PDF notice -->
  <tr>
    <td bgcolor="#0d0b1f" style="background:#0d0b1f;padding:20px 36px;border-left:1px solid #7c3aed33;border-right:1px solid #7c3aed33;border-top:1px solid #7c3aed22;" class="email-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="36" style="vertical-align:top;padding-right:12px;">
            <div style="width:36px;height:36px;background:#1e1b4b;border:1px solid #7c3aed44;border-radius:10px;text-align:center;line-height:36px;font-size:18px;">📄</div>
          </td>
          <td style="vertical-align:middle;">
            <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#e2e8f0;">Estado de cuenta adjunto</p>
            <p style="margin:0;font-size:12px;color:#475569;line-height:1.5;">Encontrará el detalle completo en el archivo PDF adjunto a este correo. Incluye el desglose de cuentas por colaborador.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  ${footerRow(input.businessName)}
  ${accentBottom('#7c3aed')}`

    return emailWrapper(inner, `Estado de cuenta — ${input.companyName}`)
}

export async function sendCompanyStatementPDFEmail(input: {
    to: string
    companyName: string
    businessName: string
    pdfBase64: string
    logoUrl?: string | null
    employeeCount?: number
    totalDebt?: number
}): Promise<{ success: boolean; error?: string; isVerificationError?: boolean }> {
    try {
        if (!window.electronAPI?.sendEmail) return { success: false, error: 'Entorno Electron no detectado' }
        const html = buildCompanyStatementPDFEmailHTML({
            companyName: input.companyName,
            businessName: input.businessName,
            totalDebt: input.totalDebt ?? 0,
            employeeCount: input.employeeCount ?? 0,
            logoUrl: input.logoUrl,
        })
        const result = await window.electronAPI.sendEmail({
            from: `${input.businessName.trim() || 'Recibos'} <noreply@jafetduarte.dev>`,
            to: [input.to],
            subject: `Estado de cuenta — ${input.companyName} | ${input.businessName}`,
            html,
            attachments: [{
                filename: `estado-cuenta-${input.companyName.toLowerCase().replace(/\s+/g, '-')}.pdf`,
                content: input.pdfBase64,
            }],
        })
        if (!result.success) {
            const isVerificationError = result.error?.statusCode === 403 ||
                String(result.error?.message ?? '').includes('verify a domain')
            return { success: false, error: result.error?.message ?? 'Error desconocido', isVerificationError }
        }
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

export async function sendSplitCreditEmail(input: SendSplitCreditInput): Promise<{ success: boolean; error?: string; isVerificationError?: boolean }> {
    try {
        const html = buildSplitCreditHTML(input, input.logoUrl)
        if (!window.electronAPI?.sendEmail) return { success: false, error: 'Entorno Electron no detectado' }
        const result = await window.electronAPI.sendEmail({
            from: `${input.businessName.trim() || 'Recibos'} <noreply@jafetduarte.dev>`,
            to: [input.to],
            subject: `Crédito dividido #${input.saleNumber} — ${fmt(input.totalCharged)} cargado a tu cuenta | ${input.businessName}`,
            html,
        })
        if (!result.success) {
            const isVerificationError = result.error?.statusCode === 403 ||
                String(result.error?.message ?? '').includes('verify a domain')
            return { success: false, error: result.error?.message ?? 'Error desconocido', isVerificationError }
        }
        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}
