import type { BookingGateway } from './gateway'
import { SupabaseBookingGateway } from './supabase-gateway'
export const createBookingGateway = (): BookingGateway => {
  const mode = import.meta.env.VITE_BOOKING_MODE
  if (mode && mode !== 'supabase') throw new Error('VITE_BOOKING_MODE deve ser "supabase".')
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Configuração Supabase ausente para VITE_BOOKING_MODE=supabase.')
  return new SupabaseBookingGateway({ url, key })
}
