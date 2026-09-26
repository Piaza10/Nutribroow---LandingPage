import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import App from './App'

vi.mock('./booking/create-gateway', () => ({
  createBookingGateway: () => ({
    getPartner: vi.fn().mockResolvedValue(null),
    getSlots: vi.fn().mockResolvedValue([
      { id: 'online-1', mode: 'online', startsAt: '2026-09-25T13:00:00.000Z', endsAt: '2026-09-25T13:45:00.000Z' },
      { id: 'online-2', mode: 'online', startsAt: '2026-09-25T14:00:00.000Z', endsAt: '2026-09-25T14:45:00.000Z' },
      { id: 'online-lunch', mode: 'online', startsAt: '2026-09-25T15:00:00.000Z', endsAt: '2026-09-25T15:45:00.000Z' },
      { id: 'online-3', mode: 'online', startsAt: '2026-09-28T12:00:00.000Z', endsAt: '2026-09-28T12:45:00.000Z' },
    ]),
    reserve: vi.fn(),
    createCheckout: vi.fn(),
  }),
}))

test('renders the Nutri Broow brand for prospective patients', async () => {
  render(<App />)
  await screen.findByRole('heading', { name: /agende sua consulta/i })
  expect(screen.getByRole('link', { name: /nutri broow/i })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Pessoa surfando uma onda' })).toBeInTheDocument()
  expect(screen.queryByText('Nutrição que acompanha')).not.toBeInTheDocument()
})

test('uses the approved challenge-section copy and card typography', async () => {
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Você não precisa de mais uma regra impossível, mas...' })).toHaveClass('challenge-heading')
  expect(screen.getByText('SEM FÓRMULA PRONTA')).toHaveClass('challenge-eyebrow-large')
  for (const text of [
    'se tem dificuldade em manter a consistência;',
    'se não consegue organizar a rotina alimentar;',
    'se reclama de pouca energia para cumprir a rotina do dia-dia;',
    'e se acha difícil seguir um planejamento alimentar.',
  ]) {
    expect(screen.getByText(text)).toHaveClass('challenge-card-copy')
  }
})

test('uses the selected surf photograph in the routine section', async () => {
  render(<App />)

  const surfPhoto = await screen.findByRole('img', { name: 'Pessoa surfando uma onda' })
  expect(surfPhoto).toHaveAttribute('src', expect.stringContaining('surf-niteroi.jpg'))
})

test('uses the compact value-proposition hierarchy in the benefits section', async () => {
  render(<App />)

  expect(await screen.findByText('AQUI VOCÊ ENCONTRA!')).toHaveClass('benefits-eyebrow-large')
  expect(screen.getByRole('heading', { name: /mais clareza para decidir.*mais leveza para continuar/i })).toHaveClass('benefits-heading')
})

test('keeps the benefits cards focused on their titles', async () => {
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Metas reais' })).toBeInTheDocument()
  expect(screen.queryAllByText('Um caminho adaptado ao seu momento e à sua agenda.')).toHaveLength(0)
})

test('uses the generated preview imagery for the available benefit cards', async () => {
  render(<App />)

  for (const title of ['Metas reais', 'Orientação individual', 'Rotina possível', 'Acompanhamento']) {
    expect((await screen.findByRole('heading', { name: title })).closest('article')).toHaveClass('benefit-card-photo')
  }
  expect(screen.getByRole('heading', { name: 'Orientação individual' }).closest('article')).toHaveClass('benefit-card-orientation')
})

test('presents the booking journey as detailed numbered steps', async () => {
  render(<App />)

  expect(await screen.findByText('Escolha o tipo de atendimento')).toBeInTheDocument()
  expect(screen.getByText('Online ou presencial, quando disponível pela academia parceira.')).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(6)
})

test('uses the shared visual hierarchy in the offer and booking sections', async () => {
  render(<App />)

  expect(await screen.findByText('ACOMPANHAMENTO NUTRI BROOW')).toHaveClass('offer-eyebrow-large')
  expect(screen.getByRole('heading', { name: 'Três meses para construir constância.' })).toHaveClass('offer-heading')
  expect(screen.getByText('SEU MOMENTO')).toHaveClass('booking-eyebrow-large')
  expect(screen.getByRole('heading', { name: 'Vamos encontrar um horário?' })).toHaveClass('booking-heading')
})

test('requires a plan before showing appointment slots', async () => {
  render(<App />)

  expect(await screen.findByRole('heading', { name: /agende sua consulta/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /sexta-feira.*10:00/i })).not.toBeInTheDocument()
})

test('emphasizes the plan selection title in the booking card', async () => {
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Agende sua consulta' })).toHaveClass('plan-step-title')
})

test('guides the patient through selecting a plan before booking', async () => {
  const user = userEvent.setup()
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Agende sua consulta' })).toBeInTheDocument()
  expect(screen.getByText('Etapa 1 de 3')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /escolher este plano/i })).toHaveLength(2)

  await user.click(screen.getAllByRole('button', { name: /escolher este plano/i })[0])
  expect(await screen.findByRole('button', { name: /alterar plano/i })).toBeInTheDocument()
})

test('uses icon-only social links and omits promotional footer copy', async () => {
  render(<App />)

  expect(await screen.findByRole('link', { name: /instagram/i })).toHaveAttribute('href', 'https://www.instagram.com/nutribroow/')
  expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute('href', 'https://wa.me/5521980966678')
  expect(screen.queryByText('Reserva online · atendimento personalizado')).not.toBeInTheDocument()
  expect(screen.queryByText('45 min consulta inicial')).not.toBeInTheDocument()
})

test('highlights practical strategies for the patient routine in the offer', async () => {
  render(<App />)

  expect(await screen.findByText('Estratégias práticas para a sua rotina')).toBeInTheDocument()
  expect(screen.queryByText(/^Consulta inicial de 45 min$/)).not.toBeInTheDocument()
  expect(screen.queryByText('Valor e pagamento confirmados pela equipe.')).not.toBeInTheDocument()
})

test('shows both consent errors when booking is submitted without consent', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: /plano consulta trimensal/i }))
  await user.click(await screen.findByRole('button', { name: /sexta-feira.*10:00/i }))
  await user.click(screen.getByRole('button', { name: /continuar/i }))
  await user.click(screen.getByRole('button', { name: /criar reserva/i }))

  expect(await screen.findByText('É necessário consentir para criar a reserva.')).toBeInTheDocument()
  expect(screen.getByText('É necessário consentir para compartilhar dados operacionais.')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('button', { name: /criar reserva/i })).toBeEnabled())
})

test('uses a concise phone label in the booking form', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click((await screen.findAllByRole('button', { name: /escolher este plano/i }))[0])
  await user.click(await screen.findByRole('button', { name: /sexta-feira.*10:00/i }))
  await user.click(screen.getByRole('button', { name: /continuar/i }))

  expect(await screen.findByLabelText('Telefone')).toBeInTheDocument()
  expect(screen.queryByLabelText('Telefone brasileiro')).not.toBeInTheDocument()
})

test('presents available appointment times in a labeled compact grid', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click((await screen.findAllByRole('button', { name: /escolher este plano/i }))[0])
  expect(await screen.findByLabelText('Horários disponíveis')).toBeInTheDocument()
})

test('shows only the selected day appointment times', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click((await screen.findAllByRole('button', { name: /escolher este plano/i }))[0])
  expect(await screen.findByRole('button', { name: /sexta-feira, 25 de setembro de 2026 às 10:00/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /segunda-feira, 28 de setembro de 2026 às 09:00/i })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /segunda-feira, 28 de setembro de 2026/i }))

  expect(await screen.findByRole('button', { name: /segunda-feira, 28 de setembro de 2026 às 09:00/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /sexta-feira, 25 de setembro de 2026 às 10:00/i })).not.toBeInTheDocument()
})

test('uses a short numeric format in each available day button', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click((await screen.findAllByRole('button', { name: /escolher este plano/i }))[0])

  const days = await screen.findByLabelText('Dias disponíveis')
  expect(within(days).getByRole('button', { name: /sexta-feira, 25 de setembro de 2026/i })).toHaveTextContent('25/09')
})

test('shows only the consultation start time inside a time card', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click((await screen.findAllByRole('button', { name: /escolher este plano/i }))[0])

  const timeCard = await screen.findByRole('button', { name: /sexta-feira, 25 de setembro de 2026 às 10:00/i })
  expect(timeCard).toHaveTextContent('10:00')
  expect(timeCard).not.toHaveTextContent('sexta-feira')
  expect(timeCard).not.toHaveTextContent('45 minutos')
})

test('does not show the online lunch appointment time', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click((await screen.findAllByRole('button', { name: /escolher este plano/i }))[0])

  expect(screen.queryByRole('button', { name: /sexta-feira, 25 de setembro de 2026 às 12:00/i })).not.toBeInTheDocument()
})
