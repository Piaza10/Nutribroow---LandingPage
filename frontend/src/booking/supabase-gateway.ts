import type { BookingGateway } from './gateway'
import type { BookingMode, CheckoutRequest, CheckoutSession, PartnerAcademy, Reservation, ReservationInput, Slot } from './types'

type Config = { url: string; key: string }
export class SupabaseBookingGateway implements BookingGateway {
  constructor(private readonly config: Config) {}
  private async request<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.config.url}/functions/v1/public-booking`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: this.config.key }, body: JSON.stringify(body) })
    const payload = await response.json().catch(() => null) as { error?: string } | null
    if (!response.ok || payload?.error) throw { code: payload?.error ?? 'service_unavailable' }
    return payload as T
  }
  async getPartner(code: string | null) { if (!code) return null; return this.request<PartnerAcademy | null>({ action: 'get-partner', code }) }
  async getSlots(mode: BookingMode, academyCode?: string) { return this.request<Slot[]>({ action: 'get-slots', mode, academyCode }) }
  async reserve(input: ReservationInput) { return this.request<Reservation>({ action: 'reserve', input }) }
  async createCheckout(input: CheckoutRequest) {
    const response = await fetch(`${this.config.url}/functions/v1/create-checkout`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: this.config.key }, body: JSON.stringify(input) })
    const payload = await response.json().catch(() => null) as { error?: string } | null
    if (!response.ok || payload?.error) throw { code: payload?.error ?? 'service_unavailable' }
    return payload as CheckoutSession
  }
}
