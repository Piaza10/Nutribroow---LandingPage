export type PreferenceInput = {
  items: Array<{ id: string; title: string; quantity: number; currency_id: 'BRL'; unit_price: number }>
  payer: { name: string; email: string }
  external_reference: string
  payment_methods: { excluded_payment_types: Array<{ id: string }>; installments: number }
  back_urls: { success: string; pending: string; failure: string }
  auto_return: 'approved'
  notification_url: string
}

type PreferenceResponse = { id?: string; init_point?: string }
export type MercadoPagoPayment = { id: number | string; status: string; transaction_amount: number; currency_id: string; external_reference: string | null }

const encoder = new TextEncoder()

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')

export const timingSafeEqualHex = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

const signatureParts = (header: string) => Object.fromEntries(header.split(',').map((part) => part.trim().split('=', 2)).filter(([key, value]) => key && value))

export const verifyWebhookSignature = async ({ secret, signature, requestId, dataId }: { secret: string; signature: string | null; requestId: string | null; dataId: string | null }) => {
  if (!signature) return false
  const { ts, v1 } = signatureParts(signature)
  if (!ts || !v1) return false
  const manifest = [dataId ? `id:${dataId.toLowerCase()};` : '', requestId ? `request-id:${requestId};` : '', `ts:${ts};`].join('')
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(manifest))
  return timingSafeEqualHex(hex(digest), v1)
}

export const createPreference = async (accessToken: string, body: PreferenceInput) => {
  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null) as PreferenceResponse | null
  if (!response.ok || !payload?.id || !payload.init_point) throw new Error('mercado_pago_preference_failed')
  return { id: payload.id, initPoint: payload.init_point }
}

export const getPayment = async (accessToken: string, paymentId: string) => {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { authorization: `Bearer ${accessToken}` } })
  const payload = await response.json().catch(() => null) as MercadoPagoPayment | null
  if (!response.ok || !payload?.id || !payload.status || !Number.isFinite(payload.transaction_amount)) throw new Error('mercado_pago_payment_failed')
  return payload
}
