import { sendConfirmationEmail } from '../_shared/resend.ts'

type ConfirmationPayload = {
  notification_id: string
  reservation_id: string
  patient_name: string
  patient_email: string
  mode: string
  starts_at: string
  ends_at: string
}

type Database = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: ConfirmationPayload[] | null; error: { message: string } | null }>
}

type EmailSender = (input: {
  reservationId: string
  email: string
  patientName: string
  mode: string
  startsAt: string
  endsAt: string
}) => Promise<{ id: string }>

export async function processConfirmationEmail(db: Database, reservationId: string, send: EmailSender = sendConfirmationEmail): Promise<'sent' | 'skipped' | 'failed'> {
  const claimed = await db.rpc('claim_confirmation_email_payload', { p_reservation: reservationId })
  if (claimed.error) throw new Error('confirmation_email_payload')
  const notification = claimed.data?.[0]
  if (!notification) return 'skipped'

  try {
    const sent = await send({
      reservationId: notification.reservation_id,
      email: notification.patient_email,
      patientName: notification.patient_name,
      mode: notification.mode,
      startsAt: notification.starts_at,
      endsAt: notification.ends_at,
    })
    const completed = await db.rpc('complete_confirmation_email', {
      p_notification: notification.notification_id,
      p_provider_id: sent.id,
      p_error: null,
    })
    if (completed.error) throw new Error('confirmation_email_completion')
    return 'sent'
  } catch (error) {
    const code = error instanceof Error ? error.message : 'resend_unknown'
    const completed = await db.rpc('complete_confirmation_email', {
      p_notification: notification.notification_id,
      p_provider_id: null,
      p_error: code,
    })
    if (completed.error) throw new Error('confirmation_email_completion')
    console.error('confirmation_email_failed', code)
    return 'failed'
  }
}
