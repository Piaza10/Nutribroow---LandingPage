import { describe, expect, it } from 'vitest'
import { resolvePlan } from './catalog'

describe('resolvePlan', () => {
  it('applies Team Caetano discount only to the trimestral plan', () => {
    expect(resolvePlan('consulta_trimensal', 'team-caetano')).toMatchObject({
      code: 'consulta_trimensal',
      unitAmountCents: 20_000,
      discountOrigin: 'team-caetano',
    })
  })

  it('keeps the regular monthly price for a partner URL', () => {
    expect(resolvePlan('consulta_mensal', 'team-caetano').unitAmountCents).toBe(10_000)
  })
})
