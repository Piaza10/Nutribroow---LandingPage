import { handleEmailDeliveryMonitor } from './index.ts'

const request = (secret?: string) => new Request('https://example.test/email-delivery-monitor', {
  method: 'POST',
  headers: secret ? { 'x-email-monitor-secret': secret } : {},
})

Deno.test('rejects a monitor request without its secret', async () => {
  let claimed = false
  const response = await handleEmailDeliveryMonitor(request(), {
    secret: 'cron-secret',
    claim: async () => { claimed = true; return [] },
    send: async () => ({ id: 'provider-1' }),
    complete: async () => undefined,
  })
  if (response.status !== 401 || claimed) throw new Error('expected unauthorized request without a database claim')
})

Deno.test('sends one PII-free alert and completes every claimed reservation', async () => {
  let receivedIds: string[] = []
  let completed: Record<string, unknown> | undefined
  const response = await handleEmailDeliveryMonitor(request('cron-secret'), {
    secret: 'cron-secret',
    claim: async () => ['reservation-1', 'reservation-2'],
    send: async (ids) => { receivedIds = ids; return { id: 'provider-1' } },
    complete: async (ids, providerId, error) => { completed = { ids, providerId, error } },
  })
  if (response.status !== 200) throw new Error('expected successful monitor response')
  if (receivedIds.join(',') !== 'reservation-1,reservation-2') throw new Error('expected one alert for both internal ids')
  if (JSON.stringify(completed) !== JSON.stringify({ ids: ['reservation-1', 'reservation-2'], providerId: 'provider-1', error: null })) throw new Error('expected successful completion')
})

Deno.test('records a provider failure without exposing the monitor secret', async () => {
  let completed: Record<string, unknown> | undefined
  const response = await handleEmailDeliveryMonitor(request('cron-secret'), {
    secret: 'cron-secret',
    claim: async () => ['reservation-1'],
    send: async () => { throw new Error('resend_email_503') },
    complete: async (ids, providerId, error) => { completed = { ids, providerId, error } },
  })
  if (response.status !== 503) throw new Error('expected service unavailable response')
  if (JSON.stringify(completed) !== JSON.stringify({ ids: ['reservation-1'], providerId: null, error: 'resend_email_503' })) throw new Error('expected failed completion')
  if ((await response.text()).includes('cron-secret')) throw new Error('monitor secret leaked')
})
