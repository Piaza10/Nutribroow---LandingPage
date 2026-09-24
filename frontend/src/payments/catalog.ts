export type PlanCode = 'consulta_trimensal' | 'consulta_mensal'

export type CheckoutPlan = {
  code: PlanCode
  title: string
  unitAmountCents: number
  durationLabel: string
  discountOrigin: 'team-caetano' | null
}

const regularPlans: Record<PlanCode, Omit<CheckoutPlan, 'discountOrigin'>> = {
  consulta_trimensal: {
    code: 'consulta_trimensal',
    title: 'Plano Consulta Trimensal',
    unitAmountCents: 25_000,
    durationLabel: 'Acompanhamento por 3 meses',
  },
  consulta_mensal: {
    code: 'consulta_mensal',
    title: 'Consulta Mensal',
    unitAmountCents: 10_000,
    durationLabel: 'Acompanhamento por 30 dias',
  },
}

export const resolvePlan = (code: PlanCode, partnerCode?: string | null): CheckoutPlan => {
  if (code === 'consulta_trimensal' && partnerCode === 'team-caetano') {
    return {
      ...regularPlans[code],
      title: 'Plano Consulta Trimensal (com desconto de parceiros)',
      unitAmountCents: 20_000,
      discountOrigin: 'team-caetano',
    }
  }

  return { ...regularPlans[code], discountOrigin: null }
}

export const plans = Object.values(regularPlans)
