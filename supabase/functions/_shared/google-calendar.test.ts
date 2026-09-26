import { calendarEventBody } from './google-calendar.ts'

Deno.test('adds the partner origin to an online appointment event', () => {
  const event = calendarEventBody({
    reservationId: '3e1c0e56-4f3a-4d17-b75c-52c7d2de7a73',
    patientName: 'Ana Silva',
    mode: 'online',
    partnerName: 'Team Caetano',
    startsAt: '2026-10-01T15:00:00.000Z',
    endsAt: '2026-10-01T15:45:00.000Z',
  })

  if (event.summary !== 'Consulta Nutri Broow — online') throw new Error('expected online summary')
  if (event.description !== 'Origem: Team Caetano') throw new Error('expected partner origin')
})

Deno.test('marks direct appointments as direct origin', () => {
  const event = calendarEventBody({
    reservationId: '3e1c0e56-4f3a-4d17-b75c-52c7d2de7a73',
    patientName: 'Ana Silva',
    mode: 'online',
    partnerName: null,
    startsAt: '2026-10-01T15:00:00.000Z',
    endsAt: '2026-10-01T15:45:00.000Z',
  })

  if (event.description !== 'Origem: Direta') throw new Error('expected direct origin')
})
