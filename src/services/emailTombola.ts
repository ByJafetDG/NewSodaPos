interface SendWinnerInput {
    to: string
    participantName: string
    sorteoName: string
    number: number
    prizeName: string
    prizeAmount: number | null
    drawDate: string | null
}

function fmt(n: number) {
    return '₡' + n.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function buildWinnerHTML(input: SendWinnerInput): string {
    const prizeAmountRow = input.prizeAmount != null
        ? `<p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#10B981">${fmt(input.prizeAmount)}</p>`
        : ''
    const drawDateRow = input.drawDate
        ? `<p style="margin:6px 0 0;color:#3D506A;font-size:12px">Fecha del sorteo: ${input.drawDate}</p>`
        : ''
    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0B0E19;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 24px">

  <div style="text-align:center;margin-bottom:32px">
    <div style="font-size:48px;line-height:1;margin-bottom:12px">🎉</div>
    <h1 style="margin:0 0 6px;color:#F59E0B;font-size:28px;font-weight:900;letter-spacing:-0.5px">¡Felicidades!</h1>
    <p style="margin:0;color:#7A8FAA;font-size:14px;line-height:1.5">
      Eres ganador del sorteo<br>
      <strong style="color:#E4ECF7;font-size:16px">${input.sorteoName}</strong>
    </p>
  </div>

  <div style="background:#101520;border-radius:16px;padding:28px 24px;margin-bottom:12px;text-align:center;border:1px solid #1E2A40">
    <p style="margin:0 0 8px;color:#3D506A;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;font-weight:600">Tu número ganador</p>
    <p style="margin:0;font-size:64px;font-weight:900;color:#10B981;line-height:1;font-variant-numeric:tabular-nums">${input.number}</p>
  </div>

  <div style="background:#101520;border-radius:16px;padding:20px 24px;margin-bottom:24px;border:1px solid #1E2A40">
    <p style="margin:0 0 6px;color:#3D506A;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;font-weight:600">Premio</p>
    <p style="margin:0;font-size:20px;font-weight:700;color:#E4ECF7">${input.prizeName}</p>
    ${prizeAmountRow}
  </div>

  <div style="padding:16px 0;border-top:1px solid #192030">
    <p style="margin:0;color:#7A8FAA;font-size:13px">
      Participante: <strong style="color:#E4ECF7">${input.participantName}</strong>
    </p>
    ${drawDateRow}
  </div>

</div>
</body>
</html>`
}

export async function sendTombolaWinnerEmail(
    input: SendWinnerInput
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!window.electronAPI?.sendEmail) return { success: false, error: 'Entorno Electron no detectado' }
        const html = buildWinnerHTML(input)
        const prizeLabel = input.prizeAmount != null ? ` — ${fmt(input.prizeAmount)}` : ''
        const result = await window.electronAPI.sendEmail({
            from: `${input.sorteoName} <noreply@jafetduarte.dev>`,
            to: [input.to],
            subject: `🎉 ¡Ganaste el número ${input.number}! ${input.prizeName}${prizeLabel} — ${input.sorteoName}`,
            html,
        })
        if (!result.success) {
            return { success: false, error: result.error?.message ?? 'Error desconocido' }
        }
        return { success: true }
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : 'Error al enviar' }
    }
}
