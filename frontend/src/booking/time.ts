export const isBookableSlot = (startsAt: string, now = new Date()) => {
  const delta = new Date(startsAt).getTime() - now.getTime()
  return delta >= 86_400_000 && delta <= 5_184_000_000
}
export const slotLabel = (slot: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(slot))
