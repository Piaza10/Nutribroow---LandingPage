import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import App from './App'

vi.mock('./booking/create-gateway', () => ({
  createBookingGateway: () => ({
    getPartner: vi.fn().mockResolvedValue(null),
    getSlots: vi.fn().mockResolvedValue([{ id: 'online-1', mode: 'online', startsAt: '2026-09-25T13:00:00.000Z', endsAt: '2026-09-25T13:45:00.000Z' }]),
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

test('uses the selected surf photograph in the routine section', async () => {
  render(<App />)

  const surfPhoto = await screen.findByRole('img', { name: 'Pessoa surfando uma onda' })
  expect(surfPhoto).toHaveAttribute('src', expect.stringContaining('surf-niteroi.jpg'))
})

test('requires a plan before showing appointment slots', async () => {
  render(<App />)

  expect(await screen.findByRole('heading', { name: /agende sua consulta/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /sexta-feira.*10:00/i })).not.toBeInTheDocument()
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
