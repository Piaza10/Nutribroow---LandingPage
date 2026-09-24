import { createClient } from 'npm:@supabase/supabase-js@2'

type PublicError = 'invalid_request' | 'partner_required' | 'partner_not_found' | 'slot_unavailable' | 'configuration_error' | 'service_unavailable'
const json = (body: unknown, status = 200, origin?: string) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}) } })
const fail = (error: PublicError, status: number, origin?: string) => json({ error }, status, origin)
const allowed = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean)

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? ''
  const permitted = allowed().includes(origin)
  if (request.method === 'OPTIONS') return permitted ? new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, apikey', vary: 'Origin' } }) : new Response(null, { status: 403 })
  if (request.method !== 'POST') return fail('invalid_request', 405, permitted ? origin : undefined)
  if (!permitted) return fail('invalid_request', 403)
  if (Number(request.headers.get('content-length') ?? 0) > 16_384) return fail('invalid_request', 413, origin)
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return fail('configuration_error', 503, origin)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return fail('invalid_request', 400, origin) }
  const db = createClient(url, key, { auth: { persistSession: false } })
  try {
    if (body.action === 'get-partner' && typeof body.code === 'string') {
      const { data, error } = await db.from('partner_academies').select('code,name,address,active').eq('code', body.code.toLowerCase()).eq('active', true).maybeSingle()
      if (error) throw error
      return json(data, 200, origin)
    }
    if (body.action === 'get-slots' && (body.mode === 'online' || body.mode === 'presencial')) {
      if (body.mode === 'presencial' && typeof body.academyCode !== 'string') return fail('partner_required', 400, origin)
      let academyId: string | null = null
      if (body.mode === 'presencial') { const partner = await db.from('partner_academies').select('id').eq('code', body.academyCode).eq('active', true).maybeSingle(); if (partner.error) throw partner.error; if (!partner.data) return fail('partner_not_found', 404, origin); academyId = partner.data.id }
      const { data, error } = await db.rpc('get_available_slots', { p_mode: body.mode, p_academy: academyId }); if (error) throw error
      return json((data ?? []).map((slot) => ({ id: slot.id, mode: slot.mode, startsAt: slot.starts_at, endsAt: slot.ends_at })), 200, origin)
    }
    if (body.action === 'reserve' && body.input && typeof body.input === 'object') {
      const input = body.input as Record<string, unknown>
      if (!['online','presencial'].includes(String(input.mode)) || typeof input.slotId !== 'string' || typeof input.name !== 'string' || typeof input.email !== 'string' || typeof input.phone !== 'string' || input.consentBooking !== true || input.consentSharing !== true) return fail('invalid_request', 400, origin)
      let academyId: string | null = null
      if (input.academyCode) { const partner = await db.from('partner_academies').select('id').eq('code', input.academyCode).eq('active', true).maybeSingle(); if (partner.error) throw partner.error; if (!partner.data) return fail('partner_not_found', 404, origin); academyId = partner.data.id }
      const { data, error } = await db.rpc('create_temporary_reservation', { p_slot: input.slotId, p_name: input.name.trim(), p_email: input.email.trim().toLowerCase(), p_phone: input.phone.replace(/\D/g,''), p_academy: academyId })
      if (error) { if (error.message.includes('slot_unavailable')) return fail('slot_unavailable', 409, origin); throw error }
      return json({ id: data.id, slotId: data.slot_id, mode: data.mode, status: data.status, expiresAt: data.expires_at }, 201, origin)
    }
    return fail('invalid_request', 400, origin)
  } catch { console.error(JSON.stringify({ event: 'public_booking_error' })); return fail('service_unavailable', 503, origin) }
})
