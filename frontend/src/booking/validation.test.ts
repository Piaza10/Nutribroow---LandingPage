import { describe, expect, test } from 'vitest'
import { identitySchema, normalizePhone } from './validation'
import { isBookableSlot } from './time'

describe('booking rules', () => {
  test('normalizes a Brazilian phone and validates required consents', () => {
    expect(normalizePhone('(21) 98096-6678')).toBe('21980966678')
    expect(identitySchema.safeParse({ name: 'Ana Silva', email: 'ana@example.com', phone: '21980966678', consentBooking: true, consentSharing: true }).success).toBe(true)
    expect(identitySchema.safeParse({ name: 'Ana Silva', email: 'ana@example.com', phone: '21980966678', consentBooking: false, consentSharing: true }).success).toBe(false)
  })
  test('accepts slots from 24 hours through 60 days', () => {
    const now = new Date('2026-09-16T12:00:00.000Z')
    expect(isBookableSlot('2026-09-17T12:00:00.000Z', now)).toBe(true)
    expect(isBookableSlot('2026-09-17T11:59:59.000Z', now)).toBe(false)
    expect(isBookableSlot('2026-11-15T12:00:01.000Z', now)).toBe(false)
  })
})
