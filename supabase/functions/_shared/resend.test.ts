import { sendConfirmationEmail } from './resend.ts'

const input = {
  reservationId: 'reservation-1',
  email: 'ana@example.com',
  patientName: 'Ana <Silva>',
  mode: 'online',
  startsAt: '2026-10-01T15:00:00.000Z',
  endsAt: '2026-10-01T15:45:00.000Z',
}

Deno.test('sends a confirmation with the reservation idempotency key', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = Deno.env.get('RESEND_API_KEY')
  const originalFrom = Deno.env.get('RESEND_FROM_EMAIL')
  let captured: Request | undefined
  Deno.env.set('RESEND_API_KEY', 're_test_key')
  Deno.env.set('RESEND_FROM_EMAIL', 'Nutri Broow <agendamento@nutribroow.com>')
  globalThis.fetch = (async (resource, init) => {
    captured = new Request(resource, init)
    return new Response(JSON.stringify({ id: 'email-1' }), { status: 201, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  try {
    const result = await sendConfirmationEmail(input)
    if (result.id !== 'email-1') throw new Error('expected provider message id')
    if (!captured || captured.url !== 'https://api.resend.com/emails') throw new Error('expected Resend endpoint')
    if (captured.headers.get('authorization') !== 'Bearer re_test_key') throw new Error('expected bearer authorization')
    if (captured.headers.get('idempotency-key') !== 'nutri-broow-confirmation-reservation-1') throw new Error('expected idempotency key')
    const payload = await captured.json() as { to: string[]; html: string; text: string }
    if (payload.to[0] !== input.email) throw new Error('expected recipient')
    if (!payload.html.includes('Ana &lt;Silva&gt;')) throw new Error('expected escaped patient name')
    if (!payload.text.includes('quinta-feira, 1 de outubro de 2026 às 12:00')) throw new Error('expected Sao Paulo date and time')
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) Deno.env.delete('RESEND_API_KEY'); else Deno.env.set('RESEND_API_KEY', originalKey)
    if (originalFrom === undefined) Deno.env.delete('RESEND_FROM_EMAIL'); else Deno.env.set('RESEND_FROM_EMAIL', originalFrom)
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
