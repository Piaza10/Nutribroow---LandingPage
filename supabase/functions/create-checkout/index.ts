import { createClient } from 'npm:@supabase/supabase-js@2'
import { createPreference } from '../_shared/mercado-pago.ts'

type PublicError = 'invalid_request' | 'reservation_unavailable' | 'configuration_error' | 'service_unavailable'
const json = (body: unknown, status = 200, origin?: string) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}) } })
const fail = (error: PublicError, status: number, origin?: string) => json({ error }, status, origin)
const allowed = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const errorSummary = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; message?: unknown }
    return JSON.stringify({ code: record.code ?? null, message: record.message ?? null })
  }
  return String(error)
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? ''; const permitted = allowed().includes(origin)
  if (request.method === 'OPTIONS') return permitted ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, apikey', vary: 'Origin' } }) : new Response(null, { status: 403 })
  if (request.method !== 'POST' || !permitted) return fail('invalid_request', request.method === 'POST' ? 403 : 405, permitted ? origin : undefined)
  let body: { reservationId?: unknown; planCode?: unknown }
  try { body = await request.json() } catch { return fail('invalid_request', 400, origin) }
  if (!uuid.test(String(body.reservationId)) || !['consulta_trimensal', 'consulta_mensal'].includes(String(body.planCode))) return fail('invalid_request', 400, origin)
  const supabaseUrl = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN'); const appBaseUrl = Deno.env.get('APP_BASE_URL')
  if (!supabaseUrl || !serviceKey || !accessToken || !appBaseUrl || !appBaseUrl.startsWith('https://')) return fail('configuration_error', 503, origin)
  try {
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const { data, error } = await db.rpc('create_payment_checkout', { p_reservation: body.reservationId, p_plan_code: body.planCode })
    if (error || !data?.[0]) { if (error?.message.match(/reservation_(expired|unavailable|not_found)/)) return fail('reservation_unavailable', 409, origin); throw error }
    const payment = data[0]
    const reservationId = String(payment.reservation_id)
    const preference = await createPreference(accessToken, { items: [{ id: payment.plan_code, title: payment.title, quantity: 1, currency_id: 'BRL', unit_price: Number(payment.amount_cents) / 100 }], payer: { name: payment.name, email: payment.email }, external_reference: reservationId, payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: 3 }, back_urls: { success: `${appBaseUrl}/?pagamento=success&reserva=${reservationId}`, pending: `${appBaseUrl}/?pagamento=pending&reserva=${reservationId}`, failure: `${appBaseUrl}/?pagamento=failure&reserva=${reservationId}` }, auto_return: 'approved', notification_url: `${supabaseUrl}/functions/v1/mercado-pago-webhook` })
    const { error: updateError } = await db.from('reservation_payments').update({ preference_id: preference.id, checkout_url: preference.initPoint, updated_at: new Date().toISOString() }).eq('reservation_id', reservationId)
    if (updateError) throw updateError
    return json({ checkoutUrl: preference.initPoint, reservationId, expiresAt: payment.expires_at }, 201, origin)
  } catch (error) {
    console.error('create_checkout_failed', errorSummary(error))
    return fail('service_unavailable', 503, origin)
  }
})
