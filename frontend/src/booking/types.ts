export type BookingMode = 'online' | 'presencial'
export type PartnerAcademy = { code: string; name: string; address: string; active: boolean }
export type Slot = { id: string; mode: BookingMode; startsAt: string; endsAt: string; academyCode?: string }
export type Reservation = { id: string; slotId: string; mode: BookingMode; expiresAt: string; status: 'temporary' }
export type ReservationInput = { slotId: string; mode: BookingMode; academyCode?: string; name: string; email: string; phone: string; consentBooking: boolean; consentSharing: boolean }
export type PlanCode = 'consulta_trimensal' | 'consulta_mensal'
export type CheckoutRequest = { reservationId: string; planCode: PlanCode }
export type CheckoutSession = { checkoutUrl: string; reservationId: string; expiresAt: string }
