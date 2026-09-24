import { describe, expect, test, vi } from 'vitest'

describe('gateway selection', () => {
  test('requires Supabase configuration when no booking mode is declared', async () => {
    vi.stubEnv('VITE_BOOKING_MODE', '')
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
    const { createBookingGateway } = await import('./create-gateway')
    expect(() => createBookingGateway()).toThrow(/configuração/i)
  })
  test('creates a Supabase gateway when the public configuration is present', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_BOOKING_MODE', 'supabase')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-demo-key')
    const { createBookingGateway } = await import('./create-gateway')
    expect(createBookingGateway()).toHaveProperty('getSlots')
  })
})
