import type { BookingMode, PartnerAcademy, Reservation, ReservationInput, Slot } from './types'
import { isBookableSlot } from './time'

const academy: PartnerAcademy = { code: 'academia-centro', name: 'Academia Centro', address: 'Endereço demonstrativo — Centro, Rio de Janeiro', active: true }
const dateAt = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString() }
const slots: Slot[] = [1, 2, 3, 4].flatMap((days) => [
  { id: `online-${days}`, mode: 'online' as const, startsAt: dateAt(days + 1, 10), endsAt: dateAt(days + 1, 10) },
  { id: `presencial-${days}`, mode: 'presencial' as const, academyCode: academy.code, startsAt: dateAt(days + 1, 15), endsAt: dateAt(days + 1, 15) },
])
const held = new Set<string>()
export class DemoBookingGateway {
  async getPartner(code: string | null) { return code?.toLowerCase() === academy.code ? academy : null }
  async getSlots(mode: BookingMode, academyCode?: string) { return slots.filter((slot) => slot.mode === mode && (mode === 'online' || slot.academyCode === academyCode) && !held.has(slot.id) && isBookableSlot(slot.startsAt)) }
  async reserve(input: ReservationInput): Promise<Reservation> { if (held.has(input.slotId)) throw { code: 'slot_unavailable' }; held.add(input.slotId); return { id: crypto.randomUUID(), slotId: input.slotId, mode: input.mode, status: 'temporary', expiresAt: new Date(Date.now() + 900_000).toISOString() } }
}
