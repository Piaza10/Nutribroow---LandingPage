type ConfirmationEmailInput = {
  reservationId: string
  email: string
  patientName: string
  mode: string
  startsAt: string
  endsAt: string
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const formatDateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))

export async function sendConfirmationEmail(input: ConfirmationEmailInput) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !from) throw new Error('resend_config')

  const patientName = escapeHtml(input.patientName)
  const mode = escapeHtml(input.mode)
  const dateTime = formatDateTime(input.startsAt)
  const subject = 'Consulta confirmada — Nutri Broow'
  const text = `Olá, ${input.patientName}.\n\nSua consulta Nutri Broow foi confirmada.\n\nData e horário: ${dateTime}\nModalidade: ${input.mode}\nDuração: 45 minutos\n\nPara reagendar, entre em contato pelo WhatsApp: (21) 98096-6678. O reagendamento depende de outra data e horário disponíveis.\n\nAté breve!`
  const html = `<p>Olá, ${patientName}.</p><p>Sua consulta <strong>Nutri Broow</strong> foi confirmada.</p><p><strong>Data e horário:</strong> ${escapeHtml(dateTime)}<br><strong>Modalidade:</strong> ${mode}<br><strong>Duração:</strong> 45 minutos</p><p>Para reagendar, entre em contato pelo WhatsApp: <a href="https://wa.me/5521980966678">(21) 98096-6678</a>. O reagendamento depende de outra data e horário disponíveis.</p><p>Até breve!</p>`
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': `nutri-broow-confirmation-${input.reservationId}`,
    },
    body: JSON.stringify({ from, to: [input.email], subject, html, text }),
  })
  const payload = await response.json().catch(() => null) as { id?: string } | null
  if (!response.ok || !payload?.id) throw new Error(`resend_email_${response.status}`)
  return { id: payload.id }
}
