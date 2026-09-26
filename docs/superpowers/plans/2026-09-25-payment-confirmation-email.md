# E-mail de Confirmação de Consulta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar uma confirmação por e-mail ao paciente quando o pagamento da consulta for aprovado.

**Architecture:** O webhook já autenticado do Mercado Pago continuará sendo o único gatilho. Uma tabela privada de notificações torna o fluxo idempotente; uma RPC atômica entrega o payload somente uma vez para a Edge Function, que envia o e-mail via API HTTP do Resend e registra o resultado sem expor dados do paciente.

**Tech Stack:** Supabase Postgres e Edge Functions (Deno), Mercado Pago webhooks, Resend Email API, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-25-payment-confirmation-email-design.md`

## Global Constraints

- Usar apenas `RESEND_API_KEY` e `RESEND_FROM_EMAIL` como secrets do Supabase; nunca colocar valores em arquivos versionados ou no frontend.
- Enviar confirmação somente para reserva confirmada após pagamento aprovado.
- Não reverter pagamento ou sincronização Google Calendar quando o Resend falhar.
- Usar timezone `America/Sao_Paulo`, mensagem em português e WhatsApp `(21) 98096-6678`.
- Tabelas em `public` devem ter RLS habilitada e nenhum acesso de `anon` ou `authenticated`.
- Criar migração usando `npx supabase migration new confirmation_email_notifications`; não inventar nome/timestamp.
- Não publicar, aplicar migration remota, configurar secrets ou disparar e-mail real sem autorização explícita do usuário em cada etapa externa.

## Review Focus

- Reentrega do mesmo webhook: a mesma reserva não pode disparar duas confirmações.
- Status `pending`, `rejected` ou pagamento inválido: nenhum e-mail pode ser criado.
- Falta de secret do Resend: o webhook ainda deve responder sem desfazer pagamento/agenda e registrar somente erro não sensível.
- Nome com caracteres HTML: o corpo do e-mail deve exibi-lo como texto, sem permitir marcação.
- Horário UTC: o conteúdo do e-mail deve mostrar a data/hora correta em São Paulo.

---

### Task 1: Persistência privada e entrega atômica da notificação

**Files:**
- Create: `supabase/migrations/<gerado>_confirmation_email_notifications.sql`
- Modify: `supabase/migrations/` somente através da migração criada pelo CLI
- Test: consulta SQL no projeto Supabase remoto após deploy

**Interfaces:**
- Produces: tabela `public.reservation_notifications` e RPCs `claim_confirmation_email_payload(uuid)` e `complete_confirmation_email(uuid,text,text)`.
- Consumes: `reservations`, `patients` e `availability_slots` já existentes.

- [ ] **Step 1: Criar a migração vazia pelo CLI**

Run: `npx supabase migration new confirmation_email_notifications`

Expected: um único arquivo novo dentro de `supabase/migrations/`.

- [ ] **Step 2: Escrever a verificação SQL de falha esperada antes da implementação**

No SQL Editor do projeto, executar:

```sql
select to_regclass('public.reservation_notifications') as notification_table;
```

Expected: `NULL`, mostrando que a infraestrutura ainda não existe.

- [ ] **Step 3: Implementar tabela, RLS, unicidade e RPCs na migração**

```sql
create table public.reservation_notifications (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  kind text not null check (kind = 'payment_confirmation'),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  provider_message_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, kind)
);
alter table public.reservation_notifications enable row level security;
revoke all on public.reservation_notifications from anon, authenticated;
```

Add `claim_confirmation_email_payload(p_reservation uuid)` using `insert ... on conflict ...`, a row lock, and `update ... set status = 'sending' ... returning` so only one caller receives `{ notification_id, reservation_id, patient_name, patient_email, mode, starts_at, ends_at }` for a confirmed reservation. Add `complete_confirmation_email(p_notification uuid,p_provider_id text,p_error text)` to write `sent`/`sent_at` on success and `failed`/`last_error` on failure. Revoke both functions from `PUBLIC`.

- [ ] **Step 4: Aplicar a migração em produção somente após aprovação do usuário**

Run: `npx supabase db push --yes`

Expected: a nova migração aparece como aplicada, sem alterar reservas existentes.

- [ ] **Step 5: Executar a verificação de sucesso e segurança**

Run no SQL Editor:

```sql
select relrowsecurity
from pg_class
where oid = 'public.reservation_notifications'::regclass;

select has_table_privilege('anon', 'public.reservation_notifications', 'select') as anon_can_read;
```

Expected: `relrowsecurity = true` e `anon_can_read = false`.

### Task 2: Cliente Resend isolado e testado

**Files:**
- Create: `supabase/functions/_shared/resend.ts`
- Create: `supabase/functions/_shared/resend.test.ts`

**Interfaces:**
- Produces: `sendConfirmationEmail(input)` retornando `{ id: string }` ou lançando erro técnico curto.
- Consumes: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` e `fetch` global do Deno.

- [ ] **Step 1: Escrever os testes que falham para o cliente**

```ts
Deno.test('sends a confirmation with the reservation idempotency key', async () => {
  // mock global fetch with a 201 response carrying { id: 'email-1' }
  // set RESEND_API_KEY and RESEND_FROM_EMAIL
  // expect POST https://api.resend.com/emails, Bearer auth,
  // Idempotency-Key: nutri-broow-confirmation-reservation-1,
  // recipient, subject, text, and escaped HTML content.
})

Deno.test('does not include the API key when Resend rejects a request', async () => {
  // mock a 422 response and assert thrown message is resend_email_422.
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/resend.test.ts`

Expected: FAIL porque `resend.ts` e `sendConfirmationEmail` ainda não existem.

- [ ] **Step 3: Implementar o cliente mínimo**

```ts
export async function sendConfirmationEmail(input: ConfirmationEmailInput) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!apiKey || !from) throw new Error('resend_config');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': `nutri-broow-confirmation-${input.reservationId}`,
    },
    body: JSON.stringify({ from, to: [input.email], subject, html, text }),
  });
  const payload = await response.json().catch(() => null) as { id?: string } | null;
  if (!response.ok || !payload?.id) throw new Error(`resend_email_${response.status}`);
  return { id: payload.id };
}
```

Formatar data/hora com `Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })`; escapar `&`, `<`, `>`, `"` e `'` no HTML; gerar também texto simples.

- [ ] **Step 4: Executar novamente os testes do módulo**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/resend.test.ts`

Expected: PASS para envio, idempotência, conteúdo e erro seguro.

### Task 3: Acoplar o e-mail ao webhook sem bloquear Google Agenda

**Files:**
- Modify: `supabase/functions/mercado-pago-webhook/index.ts`
- Create: `supabase/functions/mercado-pago-webhook/index.test.ts`

**Interfaces:**
- Consumes: `claim_confirmation_email_payload`, `complete_confirmation_email` e `sendConfirmationEmail`.
- Produces: confirmação por e-mail como efeito de um pagamento `approved`, mantendo a resposta HTTP atual do webhook.

- [ ] **Step 1: Escrever testes de integração de webhook que falham**

```ts
Deno.test('approved payment sends one email and marks its notification sent', async () => {
  // mock Mercado Pago approved, RPC claim payload and Resend id email-1
  // assert complete_confirmation_email(notificationId, 'email-1', null).
})

Deno.test('a repeated approved webhook does not send another email', async () => {
  // claim RPC returns no payload; assert Resend was not called.
})

Deno.test('Resend failure keeps the webhook successful and marks notification failed', async () => {
  // Resend throws resend_email_503; assert complete(..., null, 'resend_email_503')
  // and the payment/calendar paths remain reachable.
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `deno test --allow-env --allow-net supabase/functions/mercado-pago-webhook/index.test.ts`

Expected: FAIL pois o webhook ainda não chama as RPCs de e-mail.

- [ ] **Step 3: Implementar o caminho de confirmação**

Depois de `apply_mercado_pago_payment` e somente para `payment.status === 'approved'`:

```ts
const { data: notifications, error: notificationError } = await db.rpc(
  'claim_confirmation_email_payload',
  { p_reservation: payment.external_reference },
)
const notification = notifications?.[0]
if (notification) {
  try {
    const sent = await sendConfirmationEmail({
      reservationId: notification.reservation_id,
      email: notification.patient_email,
      patientName: notification.patient_name,
      mode: notification.mode,
      startsAt: notification.starts_at,
      endsAt: notification.ends_at,
    })
    await db.rpc('complete_confirmation_email', {
      p_notification: notification.notification_id,
      p_provider_id: sent.id,
      p_error: null,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'resend_unknown'
    await db.rpc('complete_confirmation_email', {
      p_notification: notification.notification_id,
      p_provider_id: null,
      p_error: code,
    })
    console.error('confirmation_email_failed', code)
  }
}
```

Do not return 503 for an e-mail failure. Execute calendar synchronization in its existing block independently, so neither external provider cancels the other.

- [ ] **Step 4: Executar os testes do webhook e o conjunto existente**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/resend.test.ts supabase/functions/mercado-pago-webhook/index.test.ts`

Expected: PASS incluindo repetição, config ausente, falha Resend e pagamento pendente.

- [ ] **Step 5: Fazer lint de segurança manual**

Run: `rg -n "RESEND_API_KEY|RESEND_FROM_EMAIL" supabase/functions`

Expected: variáveis lidas apenas em `supabase/functions/_shared/resend.ts`; nenhum `console.log` delas.

### Task 4: Publicação controlada e configuração do proprietário

**Files:**
- Modify: `supabase/functions/mercado-pago-webhook/README.md`
- Modify: `supabase/.env.example`

**Interfaces:**
- Produces: instruções de configuração que listam nomes de secrets, sem valores.

- [ ] **Step 1: Documentar somente os nomes dos secrets e o domínio verificado**

Adicionar ao README:

```md
RESEND_API_KEY=<api-key criada no Resend>
RESEND_FROM_EMAIL=Nutri Broow <agendamento@nutribroow.com>
```

Explicar que o domínio `nutribroow.com` precisa estar verificado no Resend via registros DNS da Hostinger antes do envio em produção.

- [ ] **Step 2: Publicar a função após autorização explícita do usuário**

Run: `npx supabase functions deploy mercado-pago-webhook --no-verify-jwt`

Expected: deploy da função já existente sem trocar sua política de JWT.

- [ ] **Step 3: Configurar secrets somente com o usuário no painel**

No Supabase Dashboard > Edge Functions > Secrets, criar `RESEND_API_KEY` e `RESEND_FROM_EMAIL`. Nunca copiar a API key para chat, Git ou `.env.example`.

- [ ] **Step 4: Testar de ponta a ponta com pagamento de teste**

Criar uma reserva de teste, concluir pagamento aprovado na conta de testes e verificar:

1. `reservation_notifications.status = 'sent'`;
2. chegada do e-mail de confirmação;
3. data/hora em São Paulo, modalidade e WhatsApp corretos;
4. reentrega do mesmo webhook não cria outro e-mail;
5. evento aparece na agenda do nutricionista.

- [ ] **Step 5: Verificação final antes de qualquer commit ou publicação de frontend**

Run: `git diff --check` e os comandos de teste das Tasks 2 e 3.

Expected: sem erros de espaço, testes verdes e nenhum segredo no diff.
