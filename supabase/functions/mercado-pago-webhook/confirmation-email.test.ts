import { processConfirmationEmail } from './confirmation-email.ts'

const payload = {
  notification_id: 'notification-1',
  reservation_id: 'reservation-1',
  patient_name: 'Ana Silva',
  patient_email: 'ana@example.com',
  mode: 'online',
  starts_at: '2026-10-01T15:00:00.000Z',
  ends_at: '2026-10-01T15:45:00.000Z',
}

Deno.test('approved payment sends one email and marks its notification sent', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'claim_confirmation_email_payload') return { data: [payload], error: null }
      return { data: null, error: null }
    },
  }

  const result = await processConfirmationEmail(db, 'reservation-1', async () => ({ id: 'email-1' }))

  if (result !== 'sent') throw new Error('expected email sent result')
  const completion = calls.find((call) => call.name === 'complete_confirmation_email')
  if (!completion || completion.args.p_provider_id !== 'email-1' || completion.args.p_error !== null) throw new Error('expected sent notification completion')
})

Deno.test('a repeated approved webhook does not send another email', async () => {
  let sends = 0
  const db = { rpc: async () => ({ data: [], error: null }) }

  const result = await processConfirmationEmail(db, 'reservation-1', async () => { sends += 1; return { id: 'email-1' } })

  if (result !== 'skipped' || sends !== 0) throw new Error('expected duplicate webhook to skip sending')
})

Deno.test('Resend failure marks notification failed without throwing', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'claim_confirmation_email_payload') return { data: [payload], error: null }
      return { data: null, error: null }
    },
  }

  const result = await processConfirmationEmail(db, 'reservation-1', async () => { throw new Error('resend_email_503') })

  if (result !== 'failed') throw new Error('expected failed email result')
  const completion = calls.find((call) => call.name === 'complete_confirmation_email')
  if (!completion || completion.args.p_provider_id !== null || completion.args.p_error !== 'resend_email_503') throw new Error('expected failed notification completion')
})
