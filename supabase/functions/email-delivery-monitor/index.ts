import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendDeliveryMonitorAlert } from '../_shared/resend.ts'

type Dependencies = { secret: string; claim: () => Promise<string[]>; send: (reservationIds: string[]) => Promise<{ id: string }>; complete: (reservationIds: string[], providerId: string | null, error: string | null) => Promise<void> }
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function handleEmailDeliveryMonitor(request: Request, dependencies: Dependencies): Promise<Response> {
  if (request.method !== 'POST' || request.headers.get('x-email-monitor-secret') !== dependencies.secret) return json({ error: 'unauthorized' }, 401)
  const reservationIds = await dependencies.claim()
  if (!reservationIds.length) return json({ monitored: 0 }, 200)
  try {
    const sent = await dependencies.send(reservationIds)
    await dependencies.complete(reservationIds, sent.id, null)
    return json({ monitored: reservationIds.length }, 200)
  } catch (error) {
    const code = error instanceof Error ? error.message : 'monitor_alert_unknown'
    await dependencies.complete(reservationIds, null, code)
    return json({ error: 'alert_delivery_failed' }, 503)
  }
}

Deno.serve(async (request) => {
  const secret = Deno.env.get('EMAIL_MONITOR_CRON_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const alertTo = Deno.env.get('EMAIL_ALERT_TO')
  if (!secret || !supabaseUrl || !serviceRoleKey || !alertTo) return json({ error: 'configuration_error' }, 503)
  const database = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  return handleEmailDeliveryMonitor(request, {
    secret,
    claim: async () => { const result = await database.rpc('claim_email_delivery_alerts'); if (result.error) throw new Error('email_delivery_monitor_claim'); return (result.data ?? []).map((alert: { reservation_id: string }) => alert.reservation_id) },
    send: (reservationIds) => sendDeliveryMonitorAlert({ to: alertTo, reservationIds }),
    complete: async (reservationIds, providerId, error) => { const result = await database.rpc('complete_email_delivery_alerts', { p_reservations: reservationIds, p_provider_id: providerId, p_error: error }); if (result.error) throw new Error('email_delivery_monitor_complete') },
  })
})
