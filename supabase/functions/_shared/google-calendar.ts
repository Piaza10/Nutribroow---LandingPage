type Input = {
  reservationId: string
  patientName: string
  mode: string
  partnerName: string | null
  startsAt: string
  endsAt: string
}

const enc = new TextEncoder()
const b64 = (value: Uint8Array | string) => btoa(typeof value === 'string' ? value : String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const calendarEventBody = (input: Input) => ({
  id: `nb${input.reservationId.replaceAll('-', '')}`,
  summary: `Consulta Nutri Broow — ${input.mode}`,
  description: `Origem: ${input.partnerName ?? 'Direta'}`,
  visibility: 'private',
  start: { dateTime: input.startsAt, timeZone: 'America/Sao_Paulo' },
  end: { dateTime: input.endsAt, timeZone: 'America/Sao_Paulo' },
})

async function token() {
  const encoded = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64')
  const serviceAccount = encoded ? atob(encoded) : Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '{}'
  const key = JSON.parse(serviceAccount)
  if (!key.client_email || !key.private_key) throw new Error('google_config')
  const now = Math.floor(Date.now() / 1000)
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/calendar.events', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const cryptoKey = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(key.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, '')), (character) => character.charCodeAt(0)).buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, enc.encode(`${header}.${payload}`))
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${payload}.${b64(new Uint8Array(signature))}` }) })
  if (!response.ok) throw new Error(`google_token_${response.status}`)
  const responsePayload = await response.json()
  if (!responsePayload.access_token) throw new Error('google_token_invalid')
  return responsePayload.access_token as string
}

export async function createCalendarEvent(input: Input) {
  const calendar = Deno.env.get('GOOGLE_CALENDAR_ID')
  if (!calendar) throw new Error('google_config')
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events?sendUpdates=none`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: JSON.stringify(calendarEventBody(input)),
  })
  if (!response.ok && response.status !== 409) throw new Error(`google_calendar_${response.status}`)
  return `nb${input.reservationId.replaceAll('-', '')}`
}
