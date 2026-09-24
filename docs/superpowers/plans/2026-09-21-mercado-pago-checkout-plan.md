# Checkout Mercado Pago — Nutri Broow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o paciente escolha um plano, pague com Pix ou cartão no Checkout Pro do Mercado Pago e tenha a consulta confirmada somente após a confirmação segura do pagamento.

**Architecture:** O frontend continua criando a reserva temporária pela Edge Function pública e passa a pedir ao backend uma preferência do Checkout Pro usando apenas o identificador da reserva e do plano. O backend recalcula o preço, cria a preferência e grava seu vínculo; um webhook autenticado consulta o pagamento no Mercado Pago e atualiza a reserva de maneira idempotente. O retorno do navegador é apenas informativo — o webhook é a fonte de verdade.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase Postgres, Supabase Edge Functions (Deno), Mercado Pago Checkout Pro REST API.

**Spec:** `docs/superpowers/specs/2026-09-21-mercado-pago-checkout-design.md`

## Global Constraints

- Usar Checkout Pro em redirecionamento; dados de cartão nunca entram na landing.
- Cobrar em BRL, com Pix e cartão, no máximo 3 parcelas; os juros exibidos/calculados pelo Mercado Pago ficam por conta do paciente.
- Produtos únicos: `consulta_trimensal` por R$ 250,00; `consulta_trimensal_parceiro` por R$ 200,00 para `team-caetano`; `consulta_mensal` por R$ 100,00.
- A origem `team-caetano` aplica o preço de parceiro somente à consulta trimestral.
- A reserva fica temporária por 15 minutos e só a confirmação de pagamento pode torná-la `confirmed`.
- Nunca aceitar preço, status de pagamento ou aprovação enviados pelo navegador.
- `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` ficam somente nos secrets do Supabase; não entram no Git, navegador, logs ou chat.
- As `back_urls` exigem domínio HTTPS público; `localhost` e `127.0.0.1` não podem ser usados para pagamento real.
- Sem reembolso automático: o produto deve exibir que o reagendamento depende de outra data/horário disponível.
- Não criar assinatura, cobrança recorrente, reembolso automático nem envio automático por WhatsApp.
- Não fazer commit sem solicitação explícita do usuário.

## Review Focus

- Um usuário que altera o preço ou o código de parceiro no navegador deve receber sempre o valor recalculado no servidor; o teste fica na Task 2.
- A reserva expirada ou já cancelada não deve gerar uma nova preferência; o teste fica na Task 3.
- Um webhook repetido deve resultar em uma única confirmação e um único registro de pagamento; o teste fica na Task 4.
- Um retorno `success` na URL, sem webhook aprovado, deve continuar exibindo pagamento em processamento; o teste fica na Task 5.
- Pix pendente, cartão recusado e pagamento com valor/moeda/referência divergentes nunca devem confirmar a consulta; os testes ficam na Task 4.

---

## Estrutura de arquivos

- Criar `frontend/src/payments/catalog.ts`: catálogo imutável de planos, preços em centavos e regra de preço por parceiro.
- Criar `frontend/src/payments/catalog.test.ts`: testes puros das regras de produto e preço.
- Criar `supabase/migrations/202609210005_payment_checkout.sql`: estados de reserva compatíveis com pagamento, tabela de pagamentos e RPC transacional para iniciar checkout.
- Criar `supabase/functions/_shared/mercado-pago.ts`: cliente REST, validação HMAC do webhook e tipos mínimos da API do Mercado Pago.
- Criar `supabase/functions/create-checkout/index.ts`: cria preferência Checkout Pro para uma reserva temporária válida.
- Criar `supabase/functions/mercado-pago-webhook/index.ts`: valida a notificação, busca o pagamento na API e confirma a reserva de forma idempotente.
- Criar `supabase/functions/mercado-pago-webhook/README.md`: corpo esperado para configurar e testar o webhook sem expor segredos.
- Modificar `frontend/src/booking/types.ts`: tipos de plano, checkout e estado de pagamento.
- Modificar `frontend/src/booking/gateway.ts` e `frontend/src/booking/supabase-gateway.ts`: contrato e chamada para a criação do checkout.
- Modificar `frontend/src/App.tsx`: seleção de plano antes do horário, política de reagendamento, redirecionamento e página de retorno informativa.
- Modificar `frontend/src/App.test.tsx` e criar `frontend/src/booking/supabase-gateway.test.ts`: cobertura do fluxo visual e da chamada de checkout.
- Modificar `README.md`: configuração das variáveis públicas, secrets, URLs públicas e roteiro de testes sandbox/produção.

### Task 1: Catálogo de planos e regra de preço

**Files:**
- Create: `frontend/src/payments/catalog.ts`
- Test: `frontend/src/payments/catalog.test.ts`

**Interfaces:**
- Produces: `PlanCode`, `CheckoutPlan`, `plans`, `resolvePlan(planCode, partnerCode): CheckoutPlan`.
- Consumes: nenhum módulo de infraestrutura; os valores serão usados pelo frontend para copy e pelo contrato da Task 5.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { resolvePlan } from './catalog'

describe('resolvePlan', () => {
  it('uses the partner price only for Team Caetano trimestal plan', () => {
    expect(resolvePlan('consulta_trimensal', 'team-caetano')).toMatchObject({
      code: 'consulta_trimensal', unitAmountCents: 20_000, discountOrigin: 'team-caetano',
    })
  })
  it('keeps the regular monthly price for a partner URL', () => {
    expect(resolvePlan('consulta_mensal', 'team-caetano').unitAmountCents).toBe(10_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run frontend/src/payments/catalog.test.ts --maxWorkers=1` from `frontend`.

Expected: FAIL because `./catalog` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type PlanCode = 'consulta_trimensal' | 'consulta_mensal'
export type CheckoutPlan = {
  code: PlanCode; title: string; unitAmountCents: number; durationLabel: string
  discountOrigin: 'team-caetano' | null
}
const regular: Record<PlanCode, Omit<CheckoutPlan, 'discountOrigin'>> = {
  consulta_trimensal: { code: 'consulta_trimensal', title: 'Plano Consulta Trimensal', unitAmountCents: 25_000, durationLabel: 'Acompanhamento por 3 meses' },
  consulta_mensal: { code: 'consulta_mensal', title: 'Consulta Mensal', unitAmountCents: 10_000, durationLabel: 'Acompanhamento por 30 dias' },
}
export const resolvePlan = (code: PlanCode, partnerCode?: string | null): CheckoutPlan =>
  code === 'consulta_trimensal' && partnerCode === 'team-caetano'
    ? { ...regular[code], title: 'Plano Consulta Trimensal (com desconto de parceiros)', unitAmountCents: 20_000, discountOrigin: 'team-caetano' }
    : { ...regular[code], discountOrigin: null }
export const plans = Object.values(regular)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run frontend/src/payments/catalog.test.ts --maxWorkers=1` from `frontend`.

Expected: PASS with two passing assertions.

- [ ] **Step 5: Review checkpoint**

Inspect that no UI value is trusted by the backend in later tasks; this catalog is a display aid and the Edge Function reproduces the same whitelist.

### Task 2: Persistência transacional de pagamento

**Files:**
- Create: `supabase/migrations/202609210005_payment_checkout.sql`
- Test: `supabase/migrations/202609210005_payment_checkout.sql` executed against a disposable Supabase project or reviewed with SQL assertions in the Supabase SQL editor.

**Interfaces:**
- Consumes: `public.reservations`, `public.patients`, `public.partner_academies` and 15-minute expiry produced by `create_temporary_reservation`.
- Produces: `public.reservation_payments`, `public.create_payment_checkout(p_reservation uuid, p_plan_code text)`, and `public.apply_mercado_pago_payment(...)` for Tasks 3 and 4.

- [ ] **Step 1: Write executable SQL assertions before the migration**

```sql
-- This must fail before the migration because the function is absent.
select public.create_payment_checkout('00000000-0000-0000-0000-000000000000', 'consulta_mensal');
```

- [ ] **Step 2: Apply the migration design**

Create `reservation_payments` with one row per reservation, `reservation_id uuid unique not null references public.reservations(id)`, `plan_code`, `amount_cents`, `currency` default `'BRL'`, `discount_origin`, `preference_id unique`, `payment_id unique`, `payment_status`, `checkout_url`, timestamps, and no public grants. Extend `reservations.status` to `temporary`, `payment_pending`, `confirmed`, `expired`, `cancelled`; replace the live-slot unique index so it covers `temporary` and `payment_pending`.

Implement `create_payment_checkout` as `security definer`: lock the reservation, expire it if `expires_at <= now()`, reject any status other than `temporary` or `payment_pending`, resolve its academy code, whitelist only `consulta_trimensal` and `consulta_mensal`, calculate `25000`, `20000` only for Team Caetano trimensal, or `10000`, upsert the payment row, set reservation status to `payment_pending`, and return reservation/patient/price data needed by Task 3. It must never accept an amount argument.

```sql
returns table(reservation_id uuid, email text, name text, plan_code text,
              title text, amount_cents integer, expires_at timestamptz)
```

- [ ] **Step 3: Add the authoritative apply function**

Implement `apply_mercado_pago_payment(p_reservation uuid, p_payment_id text, p_status text, p_amount_cents integer, p_currency text)` to lock the payment row, reject non-BRL, mismatched amount, foreign payment id, or expired/cancelled reservation. For status `approved`, set `reservations.status='confirmed'`; for `pending`/`in_process`, retain `payment_pending`; for rejected/cancelled/expired statuses, retain the appointment hold only until its expiration and record the provider status. Returning the current reservation status makes duplicate calls harmless.

- [ ] **Step 4: Run migration and assertions in a safe target**

Run: `npx supabase db push` only after explicit authorization for the remote database write, then execute SQL Editor assertions for regular price, Team Caetano price, a deliberately invalid plan, and an expired reservation.

Expected: valid products return server-calculated cent values; invalid product and expired reservation fail; no browser-provided amount exists in the function signature.

- [ ] **Step 5: Review checkpoint**

Verify RLS remains enabled, `anon`/`authenticated` receive no table or RPC grants, and `reservation_payments` does not store clinical answers or card data.

### Task 3: Create the Checkout Pro preference server-side

**Files:**
- Create: `supabase/functions/_shared/mercado-pago.ts`
- Create: `supabase/functions/create-checkout/index.ts`
- Test: `supabase/functions/create-checkout/index.ts` exercised with a staging reservation and Mercado Pago test credentials.

**Interfaces:**
- Consumes: `create_payment_checkout(reservationId, planCode)` from Task 2; secrets `MERCADO_PAGO_ACCESS_TOKEN`, `APP_BASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `POST /functions/v1/create-checkout` body `{ reservationId: string, planCode: PlanCode }` returning `{ checkoutUrl: string, reservationId: string, expiresAt: string }`.

- [ ] **Step 1: Define a direct Edge Function acceptance check**

```sh
curl -i -X POST "$SUPABASE_URL/functions/v1/create-checkout" \
  -H "content-type: application/json" -H "apikey: $SUPABASE_ANON_KEY" \
  --data '{"reservationId":"not-a-uuid","planCode":"consulta_mensal"}'
```

Expected after implementation: `400` with `{ "error": "invalid_request" }`, with no preference created.

- [ ] **Step 2: Implement Mercado Pago REST helpers**

In `_shared/mercado-pago.ts`, export `createPreference(accessToken, body)` using `POST https://api.mercadopago.com/checkout/preferences` with `Authorization: Bearer <token>`, require a returned nonempty `id` and `init_point`, and export strict payload types. Export `timingSafeEqualHex` plus `verifyWebhookSignature` using `crypto.subtle` HMAC-SHA256 over the Mercado Pago manifest (`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`) and the configured webhook secret.

- [ ] **Step 3: Implement the checkout endpoint**

Validate CORS exactly as `public-booking` does, accept only UUID `reservationId` and two allowed `planCode` values, call the Task 2 RPC using the service role, then send a preference body whose important fields are:

```ts
{
  items: [{ id: planCode, title, quantity: 1, currency_id: 'BRL', unit_price: amountCents / 100 }],
  payer: { name, email }, external_reference: reservationId,
  payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: 3 },
  back_urls: {
    success: `${APP_BASE_URL}/?pagamento=success&reserva=${reservationId}`,
    pending: `${APP_BASE_URL}/?pagamento=pending&reserva=${reservationId}`,
    failure: `${APP_BASE_URL}/?pagamento=failure&reserva=${reservationId}`,
  },
  auto_return: 'approved',
  notification_url: `${SUPABASE_URL}/functions/v1/mercado-pago-webhook`,
}
```

After the Mercado Pago response, update only the matching `reservation_payments` row with `preference_id` and `checkout_url`. Return the `init_point`; never return the access token or log request bodies containing payer information.

- [ ] **Step 4: Deploy safely and run the acceptance checks**

Set `MERCADO_PAGO_ACCESS_TOKEN` and `APP_BASE_URL` through Supabase secrets, then deploy `create-checkout`, only after explicit authorization immediately before each external mutation. Use Mercado Pago test credentials and a real public HTTPS test URL; do not use `127.0.0.1` in `back_urls`.

Expected: an active temporary reservation returns one Mercado Pago test checkout URL; manipulated or expired reservations return a generic safe error.

- [ ] **Step 5: Review checkpoint**

Confirm that Pix remains available, boleto is excluded, cards are limited to 3 installments, and the exact installment interest is left to Mercado Pago rather than invented in the application.

### Task 4: Webhook confiável e idempotente

**Files:**
- Create: `supabase/functions/mercado-pago-webhook/index.ts`
- Create: `supabase/functions/mercado-pago-webhook/README.md`
- Test: `supabase/functions/mercado-pago-webhook/index.ts` exercised with Mercado Pago webhook simulation and duplicate delivery.

**Interfaces:**
- Consumes: `verifyWebhookSignature`, Mercado Pago `GET /v1/payments/{id}`, and `apply_mercado_pago_payment` from Task 2.
- Produces: HTTPS POST endpoint `mercado-pago-webhook` returning `200` only after the payment is safely processed or recognized as duplicate.

- [ ] **Step 1: Write the webhook simulation cases in the README**

Document these executable scenarios: approved payment exactly matching the reservation, pending Pix, rejected card, duplicate approved webhook, invalid `x-signature`, wrong `external_reference`, wrong amount, wrong currency, and payment after hold expiry. Each scenario names the expected reservation state.

- [ ] **Step 2: Implement request verification and provider lookup**

Read `data.id` from the query string or JSON body; require `type === 'payment'` when present. Require `x-signature` and `x-request-id`, call `verifyWebhookSignature`, then fetch `https://api.mercadopago.com/v1/payments/${paymentId}` with the server access token. Reject an invalid signature with `401`, malformed input with `400`, and unexpected provider fetch failures with a retryable `503`.

- [ ] **Step 3: Apply verified status without trusting the notification body**

Take `external_reference`, `id`, `status`, `transaction_amount`, and `currency_id` from the API fetch, not the inbound webhook. Validate `external_reference` as UUID and call:

```ts
rpc('apply_mercado_pago_payment', {
  p_reservation: externalReference,
  p_payment_id: String(payment.id),
  p_status: payment.status,
  p_amount_cents: Math.round(Number(payment.transaction_amount) * 100),
  p_currency: payment.currency_id,
})
```

Use the database unique constraints and locked RPC to make repeated notifications return `200` without a second confirmation. Log only event type and an internal correlation id, never names, email, token, headers, or full payment JSON.

- [ ] **Step 4: Deploy and execute every documented simulation**

Deploy the webhook and configure its public URL and `MERCADO_PAGO_WEBHOOK_SECRET` in Mercado Pago only after explicit authorization. Simulate all nine documented cases, inspect database state after each, and keep an evidence table in the completion report.

Expected: only an approved, exact BRL payment for an active reservation changes it to `confirmed`; duplicate delivery is harmless.

- [ ] **Step 5: Review checkpoint**

Verify the browser-return URL never calls `apply_mercado_pago_payment`; it must not be able to confirm a consultation.

### Task 5: Frontend checkout journey and return state

**Files:**
- Modify: `frontend/src/booking/types.ts`
- Modify: `frontend/src/booking/gateway.ts`
- Modify: `frontend/src/booking/supabase-gateway.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Create: `frontend/src/booking/supabase-gateway.test.ts`

**Interfaces:**
- Consumes: `PlanCode` from Task 1; `create-checkout` response from Task 3.
- Produces: plan-first booking UI that redirects with `window.location.assign(checkoutUrl)` and informational `success`, `pending`, `failure` return states.

- [ ] **Step 1: Write failing frontend tests**

```tsx
it('requires a plan before showing appointment slots', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: /escolha seu acompanhamento/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /sexta-feira.*10:00/i })).not.toBeInTheDocument()
})

it('does not treat a success return URL as confirmed payment', async () => {
  window.history.pushState({}, '', '/?pagamento=success&reserva=abc')
  render(<App />)
  expect(await screen.findByText(/aguardando confirmação segura/i)).toBeInTheDocument()
  expect(screen.queryByText(/consulta confirmada/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Extend exact gateway contracts**

```ts
export type CheckoutRequest = { reservationId: string; planCode: PlanCode }
export type CheckoutSession = { checkoutUrl: string; reservationId: string; expiresAt: string }
export interface BookingGateway {
  getPartner(code: string | null): Promise<PartnerAcademy | null>
  getSlots(mode: BookingMode, academyCode?: string): Promise<Slot[]>
  reserve(input: ReservationInput): Promise<Reservation>
  createCheckout(input: CheckoutRequest): Promise<CheckoutSession>
}
```

Implement `SupabaseBookingGateway.createCheckout` as `request<CheckoutSession>` to `/functions/v1/create-checkout` using the same `content-type` and publishable `apikey` headers. Add a mock expectation that its JSON body contains only reservation id and plan code.

- [ ] **Step 3: Implement plan-first UI and secure redirect**

Add `selectedPlan: PlanCode | null` and a first wizard stage with two cards: Trimensal R$ 250,00 / R$ 200,00 on Team Caetano, and Mensal R$ 100,00. Only after selecting a plan show the existing modality/slot stage. Preserve both consent validations. After the temporary reservation, display selected plan, value, Pix/cartão and "cartão em até 3x; juros definidos pelo Mercado Pago" plus "Sem reembolso automático; reagendamento sujeito a outra data e horário disponíveis." On explicit button click, call `gateway.createCheckout` then `window.location.assign(session.checkoutUrl)`.

On `?pagamento=success|pending|failure&reserva=...`, render a small payment return panel. `success` says "Pagamento recebido. Aguardando confirmação segura da consulta." `pending` says "Pagamento em processamento." `failure` says "Pagamento não concluído; tente novamente enquanto a reserva estiver válida." None says the consultation is confirmed.

- [ ] **Step 4: Run frontend verification**

Run from `frontend`:

```sh
npm test -- --run --maxWorkers=1
npm run typecheck
npm run lint
npm run build
```

Expected: all tests pass; TypeScript, lint and production build complete without errors.

- [ ] **Step 5: Manual accessibility review checkpoint**

Tab through plan cards, all consent checkboxes, checkout button and return panel. Confirm buttons have accessible names, selected plan is announced through the existing live wizard region, error text remains visible, and the external redirect only occurs after deliberate activation.

### Task 6: Operação, configuração e teste de ponta a ponta

**Files:**
- Modify: `README.md`
- Modify: `frontend/.env.example` (create if absent)

**Interfaces:**
- Consumes: deployed functions from Tasks 3–4 and the client setup from Task 5.
- Produces: repeatable configuration and acceptance checklist for the nutritionist or maintainer.

- [ ] **Step 1: Write the configuration checklist**

Document: create Mercado Pago application; use test credentials first; set `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `APP_BASE_URL`, and existing allowed origins as Supabase secrets; deploy migrations/functions; configure payment webhook URL; set frontend `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Explicitly state that `VITE_MERCADO_PAGO_PUBLIC_KEY` is unnecessary for this Checkout Pro redirect implementation and access tokens must never enter `.env.local` in the frontend.

- [ ] **Step 2: Add the no-refund/rebooking operational note**

Add visible user copy and maintainer instructions: payments are not refunded automatically; a rebooking request must be handled by staff and only into another currently available slot. Mark this as business policy requiring legal/accounting review before public launch.

- [ ] **Step 3: Perform a test-mode end-to-end rehearsal**

Using an approved public HTTPS test deployment and Mercado Pago test buyer, select the Team Caetano trimensal plan, reserve a slot, pay using a documented test path, receive the signed webhook, and verify `reservations.status='confirmed'` and stored amount `20000`. Repeat a pending Pix and a declined card, verifying neither confirms the slot.

- [ ] **Step 4: Production readiness gate**

Before any production credential or live payment: show the user the test evidence, confirm the public domain and webhook secret are set, have the user explicitly authorize production secrets/deploy, and then perform one low-risk live payment only if the user explicitly authorizes it.

- [ ] **Step 5: Final verification checkpoint**

Run `npm test -- --run --maxWorkers=1`, `npm run typecheck`, `npm run lint`, and `npm run build` from `frontend`; inspect `git diff`; report exact results, no secret values, and no claims of payment confirmation without database/webhook evidence.
