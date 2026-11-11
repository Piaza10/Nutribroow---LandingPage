import { sendConfirmationEmail } from './resend.ts'

const input = {
  reservationId: 'reservation-1',
  email: 'ana@example.com',
  patientName: 'Ana <Silva>',
  mode: 'online',
  unitName: 'Consultório próprio',
  startsAt: '2026-10-01T15:00:00.000Z',
  endsAt: '2026-10-01T15:45:00.000Z',
}

Deno.test('sends patient and clinic confirmations with appointment unit', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = Deno.env.get('RESEND_API_KEY')
  const originalFrom = Deno.env.get('RESEND_FROM_EMAIL')
  const originalClinicEmail = Deno.env.get('CLINIC_NOTIFICATION_EMAIL')
  const captured: Request[] = []
  Deno.env.set('RESEND_API_KEY', 're_test_key')
  Deno.env.set('RESEND_FROM_EMAIL', 'Nutri Broow <agendamento@nutribroow.com>')
  Deno.env.set('CLINIC_NOTIFICATION_EMAIL', 'clinica@example.com')
  globalThis.fetch = (async (resource, init) => {
    captured.push(new Request(resource, init))
    return new Response(JSON.stringify({ id: `email-${captured.length}` }), { status: 201, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  try {
    const result = await sendConfirmationEmail(input)
    if (result.id !== 'email-2') throw new Error('expected clinic provider message id')
    if (captured.length !== 2 || captured.some((request) => request.url !== 'https://api.resend.com/emails')) throw new Error('expected two Resend requests')
    if (captured.some((request) => request.headers.get('authorization') !== 'Bearer re_test_key')) throw new Error('expected bearer authorization')
    if (captured[0].headers.get('idempotency-key') !== 'nutri-broow-confirmation-patient-reservation-1') throw new Error('expected patient idempotency key')
    if (captured[1].headers.get('idempotency-key') !== 'nutri-broow-confirmation-clinic-reservation-1') throw new Error('expected clinic idempotency key')
    const patientPayload = await captured[0].json() as { to: string[]; html: string; text: string }
    const clinicPayload = await captured[1].json() as { to: string[]; html: string; text: string }
    if (patientPayload.to[0] !== input.email) throw new Error('expected patient recipient')
    if (!patientPayload.html.includes('Ana &lt;Silva&gt;')) throw new Error('expected escaped patient name')
    if (!patientPayload.text.includes('Unidade: Consultório próprio')) throw new Error('expected appointment unit for patient')
    if (clinicPayload.to[0] !== 'clinica@example.com') throw new Error('expected clinic recipient')
    if (!clinicPayload.text.includes('Unidade: Consultório próprio')) throw new Error('expected appointment unit for clinic')
    if (!clinicPayload.text.includes('quinta-feira, 1 de outubro de 2026 às 12:00')) throw new Error('expected Sao Paulo date and time')
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) Deno.env.delete('RESEND_API_KEY'); else Deno.env.set('RESEND_API_KEY', originalKey)
    if (originalFrom === undefined) Deno.env.delete('RESEND_FROM_EMAIL'); else Deno.env.set('RESEND_FROM_EMAIL', originalFrom)
    if (originalClinicEmail === undefined) Deno.env.delete('CLINIC_NOTIFICATION_EMAIL'); else Deno.env.set('CLINIC_NOTIFICATION_EMAIL', originalClinicEmail)
  }
})

Deno.test('does not include the API key when Resend rejects a request', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = Deno.env.get('RESEND_API_KEY')
  const originalFrom = Deno.env.get('RESEND_FROM_EMAIL')
  Deno.env.set('RESEND_API_KEY', 're_secret_that_must_not_leak')
  Deno.env.set('RESEND_FROM_EMAIL', 'Nutri Broow <agendamento@nutribroow.com>')
  globalThis.fetch = (async () => new Response('invalid', { status: 422 })) as typeof fetch

  try {
    let message = ''
    try { await sendConfirmationEmail(input) } catch (error) { message = error instanceof Error ? error.message : String(error) }
    if (message !== 'resend_email_422') throw new Error(`unexpected error: ${message}`)
    if (message.includes('re_secret_that_must_not_leak')) throw new Error('API key leaked')
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) Deno.env.delete('RESEND_API_KEY'); else Deno.env.set('RESEND_API_KEY', originalKey)
    if (originalFrom === undefined) Deno.env.delete('RESEND_FROM_EMAIL'); else Deno.env.set('RESEND_FROM_EMAIL', originalFrom)
  }
})
