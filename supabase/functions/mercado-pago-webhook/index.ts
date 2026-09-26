import { createClient } from 'npm:@supabase/supabase-js@2'
import { getPayment, verifyWebhookSignature } from '../_shared/mercado-pago.ts'
import { createCalendarEvent } from '../_shared/google-calendar.ts'
import { processConfirmationEmail } from './confirmation-email.ts'

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const url = new URL(request.url)
  let body: { type?: unknown; data?: { id?: unknown } }
  try { body = await request.json() } catch { return json({ error: 'invalid_request' }, 400) }
  const paymentId = String(url.searchParams.get('data.id') ?? body.data?.id ?? '')
  if (!paymentId || (body.type !== undefined && body.type !== 'payment')) return json({ error: 'invalid_request' }, 400)
  const secret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET'); const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN'); const supabaseUrl = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !accessToken || !supabaseUrl || !serviceKey) return json({ error: 'configuration_error' }, 503)
  if (!await verifyWebhookSignature({ secret, signature: request.headers.get('x-signature'), requestId: request.headers.get('x-request-id'), dataId: paymentId })) return json({ error: 'invalid_signature' }, 401)
  try {
    const payment = await getPayment(accessToken, paymentId)
    if (!payment.external_reference || !uuid.test(payment.external_reference)) return json({ error: 'invalid_payment' }, 400)
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const { error } = await db.rpc('apply_mercado_pago_payment', { p_reservation: payment.external_reference, p_payment_id: String(payment.id), p_status: payment.status, p_amount_cents: Math.round(payment.transaction_amount * 100), p_currency: payment.currency_id })
    if (error) return json({ error: 'payment_rejected' }, 409)
    if (payment.status === 'approved') {
      try {
        await processConfirmationEmail(db as never, payment.external_reference)
      } catch (error) {
        console.error('confirmation_email_processing_failed', error instanceof Error ? error.message : 'unknown_error')
      }
      const { data: events, error: eventError } = await db.rpc('calendar_event_payload', { p_reservation: payment.external_reference })
      if (eventError) return json({ error: 'calendar_payload_error' }, 503)
      const event = events?.[0]
      if (event) {
        try {
          const id = await createCalendarEvent({ reservationId: event.reservation_id, patientName: event.patient_name, mode: event.mode, partnerName: event.partner_name, startsAt: event.starts_at, endsAt: event.ends_at })
          await db.from('reservations').update({ calendar_event_id: id, calendar_synced_at: new Date().toISOString() }).eq('id', event.reservation_id)
        } catch (error) {
          console.error('google_calendar_sync_failed', error instanceof Error ? error.message : 'unknown_error')
          return json({ received: true, calendar: 'pending' }, 202)
        }
      }
    }
    return json({ received: true }, 200)
  } catch { return json({ error: 'service_unavailable' }, 503) }
})
