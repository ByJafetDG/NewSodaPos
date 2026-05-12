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
}

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

function buildHTML(input: SendReceiptInput): string {
    const initial = input.businessName.charAt(0).toUpperCase()
    const dateStr = new Date(input.date).toLocaleDateString('es-CR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })

    const rows = input.items.map(it => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #1e293b;">
            <span style="display:block;font-size:14px;color:#e2e8f0;font-weight:500;">${it.name}</span>
            <span style="display:block;font-size:11px;color:#475569;margin-top:3px;">× ${it.quantity} unidad${it.quantity !== 1 ? 'es' : ''} · ${fmt(it.unitPrice)} c/u</span>
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #1e293b;text-align:right;vertical-align:top;">
            <span style="font-size:14px;color:#e2e8f0;font-family:'Courier New',monospace;white-space:nowrap;">${fmt(it.subtotal)}</span>
          </td>
        </tr>`).join('')

    const discountRow = input.discount > 0 ? `
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#34d399;">Descuento</td>
          <td style="padding:5px 0;font-size:13px;color:#34d399;text-align:right;font-family:'Courier New',monospace;">− ${fmt(input.discount)}</td>
        </tr>` : ''

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Recibo #${input.saleNumber}</title>
</head>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f1a;padding:40px 16px;">
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;margin:0 auto;">

  <!-- ── TOP ACCENT ── -->
  <tr>
    <td style="height:4px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#0ea5e9);border-radius:4px 4px 0 0;"></td>
  </tr>

  <!-- ── HEADER ── -->
  <tr>
    <td style="background:#0f172a;padding:36px 36px 28px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;">

      <!-- Monogram -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
        <tr>
          <td style="width:56px;height:56px;background:linear-gradient(135deg,#7c3aed22,#4f46e522);border:1px solid #7c3aed55;border-radius:14px;text-align:center;vertical-align:middle;">
            <span style="font-size:24px;font-weight:800;color:#a78bfa;letter-spacing:-1px;">${initial}</span>
          </td>
        </tr>
      </table>

      <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">${input.businessName}</h1>
      <p style="margin:0 0 20px;font-size:11px;color:#334155;text-transform:uppercase;letter-spacing:2.5px;">Recibo de crédito</p>

      <!-- Badge -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:5px 16px;background:#7c3aed18;border:1px solid #7c3aed55;border-radius:99px;">
            <span style="font-size:10px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:2px;">A Crédito</span>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- ── CLIENT + META ── -->
  <tr>
    <td style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:24px 0 20px;border-bottom:1px dashed #1e293b;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;">
                  <p style="margin:0 0 4px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Cliente</p>
                  <p style="margin:0;font-size:17px;font-weight:700;color:#f1f5f9;">${input.clientName}</p>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <p style="margin:0 0 4px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Factura</p>
                  <p style="margin:0 0 5px;font-size:17px;font-weight:700;color:#f1f5f9;font-family:'Courier New',monospace;">#${input.saleNumber}</p>
                  <p style="margin:0;font-size:11px;color:#475569;">${dateStr}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── ITEMS ── -->
  <tr>
    <td style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:18px 0 6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Producto</td>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;text-align:right;">Monto</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rows}
      </table>
      <!-- Subtotals -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;padding-top:14px;border-top:1px dashed #1e293b;">
        <tr>
          <td style="font-size:13px;color:#475569;padding:4px 0;">Subtotal</td>
          <td style="font-size:13px;color:#64748b;text-align:right;font-family:'Courier New',monospace;padding:4px 0;">${fmt(input.subtotal)}</td>
        </tr>
        ${discountRow}
      </table>
      <div style="height:28px;"></div>
    </td>
  </tr>

  <!-- ── TOTAL ── -->
  <tr>
    <td style="background:linear-gradient(135deg,#1e1035,#0f172a);padding:28px 36px;text-align:center;border-left:1px solid #7c3aed44;border-right:1px solid #7c3aed44;border-top:1px solid #7c3aed33;">
      <p style="margin:0 0 8px;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:2.5px;">Total a Pagar</p>
      <p style="margin:0 0 10px;font-size:42px;font-weight:800;color:#f1f5f9;font-family:'Courier New',monospace;letter-spacing:-2px;line-height:1;">${fmt(input.total)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:4px 14px;background:#7c3aed20;border:1px solid #7c3aed40;border-radius:99px;">
            <span style="font-size:11px;color:#8b5cf6;font-weight:600;">Pendiente de pago</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── MESSAGE ── -->
  <tr>
    <td style="background:#0f172a;padding:26px 36px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;border-top:1px solid #1e293b;">
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.8;font-style:italic;">&ldquo;${randomMsg()}&rdquo;</p>
    </td>
  </tr>

  <!-- ── FOOTER ── -->
  <tr>
    <td style="background:#080d16;padding:18px 36px 24px;border-radius:0 0 14px 14px;border:1px solid #1e293b;border-top:1px solid #0f172a;text-align:center;">
      <p style="margin:0;font-size:11px;color:#1e293b;line-height:1.9;">
        Recibo generado automáticamente por <strong style="color:#334155;">${input.businessName}</strong>.<br>
        ¿Preguntas? Contáctanos directamente.
      </p>
    </td>
  </tr>

  <!-- ── BOTTOM ACCENT ── -->
  <tr>
    <td style="height:3px;background:linear-gradient(90deg,#0ea5e9,#4f46e5,#7c3aed);border-radius:0 0 4px 4px;opacity:0.4;"></td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`
}

interface SettledSaleInfo {
    saleNumber: number
    date: string
    items: ReceiptItem[]
    subtotal: number
    discount: number
    total: number
}

interface SendSettledInput {
    to: string
    clientName: string
    businessName: string
    sales: SettledSaleInfo[]
}

function buildSettledHTML(input: SendSettledInput): string {
    const initial = input.businessName.charAt(0).toUpperCase()
    const isSingle = input.sales.length === 1
    const grandTotal = input.sales.reduce((s, sale) => s + sale.total, 0)

    function saleBlock(sale: SettledSaleInfo, first: boolean) {
        const dateStr = new Date(sale.date).toLocaleDateString('es-CR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
        const rows = sale.items.map(it => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #1e293b;">
            <span style="display:block;font-size:14px;color:#e2e8f0;font-weight:500;">${it.name}</span>
            <span style="display:block;font-size:11px;color:#475569;margin-top:3px;">× ${it.quantity} unidad${it.quantity !== 1 ? 'es' : ''} · ${fmt(it.unitPrice)} c/u</span>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #1e293b;text-align:right;vertical-align:top;">
            <span style="font-size:14px;color:#e2e8f0;font-family:'Courier New',monospace;white-space:nowrap;">${fmt(it.subtotal)}</span>
          </td>
        </tr>`).join('')

        const discountRow = sale.discount > 0 ? `
        <tr>
          <td style="padding:4px 0;font-size:12px;color:#34d399;">Descuento</td>
          <td style="padding:4px 0;font-size:12px;color:#34d399;text-align:right;font-family:'Courier New',monospace;">− ${fmt(sale.discount)}</td>
        </tr>` : ''

        const saleTotalRow = !isSingle ? `
        <tr>
          <td style="padding-top:6px;font-size:13px;font-weight:700;color:#cbd5e1;">Total venta</td>
          <td style="padding-top:6px;font-size:13px;font-weight:700;color:#10b981;text-align:right;font-family:'Courier New',monospace;">${fmt(sale.total)}</td>
        </tr>` : ''

        const separator = !isSingle && !first ? `<div style="height:1px;background:#1e293b;margin:14px 0;"></div>` : ''

        const saleHeader = !isSingle ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
          <tr>
            <td style="font-size:12px;font-weight:700;color:#34d399;font-family:'Courier New',monospace;">Venta #${sale.saleNumber}</td>
            <td style="font-size:11px;color:#475569;text-align:right;">${dateStr}</td>
          </tr>
        </table>` : ''

        return `${separator}${saleHeader}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;padding-top:10px;border-top:1px dashed #1e293b;">
          <tr>
            <td style="font-size:12px;color:#475569;padding:3px 0;">Subtotal</td>
            <td style="font-size:12px;color:#64748b;text-align:right;font-family:'Courier New',monospace;padding:3px 0;">${fmt(sale.subtotal)}</td>
          </tr>
          ${discountRow}${saleTotalRow}
        </table>`
    }

    const single = isSingle ? input.sales[0] : null
    const singleDateStr = single ? new Date(single.date).toLocaleDateString('es-CR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }) : ''

    const salesContent = input.sales.map((sale, i) => saleBlock(sale, i === 0)).join('')

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${isSingle ? `Pago #${single!.saleNumber}` : `${input.sales.length} cuentas saldadas`}</title>
</head>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f1a;padding:40px 16px;">
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;margin:0 auto;">

  <tr><td style="height:4px;background:linear-gradient(90deg,#059669,#10b981,#34d399);border-radius:4px 4px 0 0;"></td></tr>

  <tr>
    <td style="background:#0f172a;padding:36px 36px 28px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
        <tr>
          <td style="width:56px;height:56px;background:linear-gradient(135deg,#05966922,#10b98122);border:1px solid #10b98155;border-radius:14px;text-align:center;vertical-align:middle;">
            <span style="font-size:24px;font-weight:800;color:#34d399;letter-spacing:-1px;">${initial}</span>
          </td>
        </tr>
      </table>
      <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#f1f5f9;letter-spacing:-0.4px;">${input.businessName}</h1>
      <p style="margin:0 0 20px;font-size:11px;color:#334155;text-transform:uppercase;letter-spacing:2.5px;">${isSingle ? 'Confirmación de pago' : 'Resumen de pagos'}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:5px 16px;background:#10b98118;border:1px solid #10b98155;border-radius:99px;">
            <span style="font-size:10px;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:2px;">${isSingle ? '✓ Pagada' : `✓ ${input.sales.length} cuentas saldadas`}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:24px 0 20px;border-bottom:1px dashed #1e293b;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;">
                  <p style="margin:0 0 4px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Cliente</p>
                  <p style="margin:0;font-size:17px;font-weight:700;color:#f1f5f9;">${input.clientName}</p>
                </td>
                ${isSingle
                    ? `<td style="text-align:right;vertical-align:top;">
                  <p style="margin:0 0 4px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Factura</p>
                  <p style="margin:0 0 5px;font-size:17px;font-weight:700;color:#f1f5f9;font-family:'Courier New',monospace;">#${single!.saleNumber}</p>
                  <p style="margin:0;font-size:11px;color:#475569;">${singleDateStr}</p>
                </td>`
                    : `<td style="text-align:right;vertical-align:top;">
                  <p style="margin:0 0 4px;font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;">Cuentas</p>
                  <p style="margin:0;font-size:22px;font-weight:700;color:#34d399;font-family:'Courier New',monospace;">${input.sales.length}</p>
                </td>`}
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="background:#0f172a;padding:0 36px;border-left:1px solid #1e293b;border-right:1px solid #1e293b;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:18px 0 6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Producto</td>
                <td style="font-size:10px;color:#334155;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;text-align:right;">Monto</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      ${salesContent}
      <div style="height:28px;"></div>
    </td>
  </tr>

  <tr>
    <td style="background:linear-gradient(135deg,#052e16,#0f172a);padding:28px 36px;text-align:center;border-left:1px solid #10b98144;border-right:1px solid #10b98144;border-top:1px solid #10b98133;">
      <p style="margin:0 0 8px;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:2.5px;">${isSingle ? 'Total Pagado' : 'Total Saldado'}</p>
      <p style="margin:0 0 10px;font-size:42px;font-weight:800;color:#f1f5f9;font-family:'Courier New',monospace;letter-spacing:-2px;line-height:1;">${fmt(grandTotal)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:4px 14px;background:#10b98120;border:1px solid #10b98140;border-radius:99px;">
            <span style="font-size:11px;color:#34d399;font-weight:600;">✓ Cuenta${input.sales.length !== 1 ? 's' : ''} al día</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td style="background:#0f172a;padding:26px 36px;text-align:center;border-left:1px solid #1e293b;border-right:1px solid #1e293b;border-top:1px solid #1e293b;">
      <p style="margin:0;font-size:14px;color:#64748b;line-height:1.8;font-style:italic;">&ldquo;${randomMsg()}&rdquo;</p>
    </td>
  </tr>

  <tr>
    <td style="background:#080d16;padding:18px 36px 24px;border-radius:0 0 14px 14px;border:1px solid #1e293b;border-top:1px solid #0f172a;text-align:center;">
      <p style="margin:0;font-size:11px;color:#1e293b;line-height:1.9;">
        Recibo generado automáticamente por <strong style="color:#334155;">${input.businessName}</strong>.<br>
        ¿Preguntas? Contáctanos directamente.
      </p>
    </td>
  </tr>

  <tr><td style="height:3px;background:linear-gradient(90deg,#34d399,#10b981,#059669);border-radius:0 0 4px 4px;opacity:0.4;"></td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

export async function sendSettledEmail(input: SendSettledInput): Promise<{ success: boolean; error?: string; isVerificationError?: boolean }> {
    try {
        const html = buildSettledHTML(input)
        if (!window.electronAPI?.sendEmail) {
            return { success: false, error: 'Entorno Electron no detectado' }
        }
        const isSingle = input.sales.length === 1
        const grandTotal = input.sales.reduce((s, sale) => s + sale.total, 0)
        const subject = isSingle
            ? `Pago recibido #${input.sales[0].saleNumber} — ${fmt(grandTotal)} | ${input.businessName}`
            : `${input.sales.length} cuentas saldadas — ${fmt(grandTotal)} | ${input.businessName}`
        const fromName = input.businessName.trim() || 'Recibos'
        const result = await window.electronAPI.sendEmail({
            from: `${fromName} <noreply@jafetduarte.dev>`,
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

export async function sendReceiptEmail(input: SendReceiptInput): Promise<{ success: boolean; error?: string; isVerificationError?: boolean }> {
    try {
        const html = buildHTML(input)
        if (!window.electronAPI?.sendEmail) {
            return { success: false, error: 'Entorno Electron no detectado' }
        }
        const result = await window.electronAPI.sendEmail({
            from: `${input.businessName} <noreply@jafetduarte.dev>`,
            to: [input.to],
            subject: `Recibo #${input.saleNumber} — ${fmt(input.total)} | ${input.businessName}`,
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
