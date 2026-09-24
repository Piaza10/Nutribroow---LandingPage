import { z } from 'zod'

export const normalizePhone = (value: string) => value.replace(/\D/g, '')
export const identitySchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  email: z.string().trim().email('Informe um e-mail válido.').max(254),
  phone: z.string().transform(normalizePhone).refine((value) => /^\d{10,11}$/.test(value), 'Informe um telefone brasileiro válido.'),
  consentBooking: z.literal(true, { error: 'É necessário consentir para criar a reserva.' }),
  consentSharing: z.literal(true, { error: 'É necessário consentir para compartilhar dados operacionais.' }),
})
