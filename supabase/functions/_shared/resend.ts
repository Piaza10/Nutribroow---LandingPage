type ConfirmationEmailInput = {
  reservationId: string
  email: string
  patientName: string
  mode: string
  unitName: string
  startsAt: string
  endsAt: string
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const formatDateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))

export async function sendConfirmationEmail(input: ConfirmationEmailInput) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM_EMAIL')
  const clinicEmail = Deno.env.get('CLINIC_NOTIFICATION_EMAIL') ?? Deno.env.get('EMAIL_ALERT_TO')
  if (!apiKey || !from) throw new Error('resend_config')
  if (!clinicEmail) throw new Error('resend_clinic_recipient_config')

  const patientName = escapeHtml(input.patientName)
  const mode = escapeHtml(input.mode)
  const unitName = escapeHtml(input.unitName)
  const dateTime = formatDateTime(input.startsAt)
  const subject = 'Consulta confirmada — Nutri Broow'
  const patientText = `Olá, ${input.patientName}.\n\nSua consulta Nutri Broow foi confirmada.\n\nData e horário: ${dateTime}\nModalidade: ${input.mode}\nUnidade: ${input.unitName}\nDuração: 45 minutos\n\nPara reagendar, entre em contato pelo WhatsApp: (21) 98096-6678. O reagendamento depende de outra data e horário disponíveis.\n\nAté breve!`
  const patientHtml = `<p>Olá, ${patientName}.</p><p>Sua consulta <strong>Nutri Broow</strong> foi confirmada.</p><p><strong>Data e horário:</strong> ${escapeHtml(dateTime)}<br><strong>Modalidade:</strong> ${mode}<br><strong>Unidade:</strong> ${unitName}<br><strong>Duração:</strong> 45 minutos</p><p>Para reagendar, entre em contato pelo WhatsApp: <a href="https://wa.me/5521980966678">(21) 98096-6678</a>. O reagendamento depende de outra data e horário disponíveis.</p><p>Até breve!</p>`
  const clinicText = `Novo agendamento confirmado — Nutri Broow\n\nPaciente: ${input.patientName}\nE-mail: ${input.email}\nData e horário: ${dateTime}\nModalidade: ${input.mode}\nUnidade: ${input.unitName}\nDuração: 45 minutos\nReserva: ${input.reservationId}`
  const send = async (body: Record<string, unknown>, idempotencyKey: string) => {
    const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
    },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => null) as { id?: string } | null
    if (!response.ok || !payload?.id) throw new Error(`resend_email_${response.status}`)
    return payload.id
  }
  await send({ from, to: [input.email], subject, html: patientHtml, text: patientText }, `nutri-broow-confirmation-patient-${input.reservationId}`)
  const clinicMessageId = await send({ from, to: [clinicEmail], subject: `Novo agendamento confirmado — ${input.unitName}`, text: clinicText }, `nutri-broow-confirmation-clinic-${input.reservationId}`)
  return { id: clinicMessageId }
}

export async function sendDeliveryMonitorAlert(input: { to: string; reservationIds: string[] }) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM_EMAIL')
  if (!apiKey || !from) throw new Error('resend_config')
  const text = `Foram identificadas ${input.reservationIds.length} confirmações de pagamento sem e-mail de confirmação enviado. IDs internos: ${input.reservationIds.join(', ')}.`
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [input.to], subject: 'Alerta: confirmação de e-mail pendente', text }) })
  const payload = await response.json().catch(() => null) as { id?: string } | null
  if (!response.ok || !payload?.id) throw new Error(`resend_email_${response.status}`)
  return { id: payload.id }
}
