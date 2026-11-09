# Email Delivery Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alertar o nutricionista por e-mail quando um pagamento aprovado permanecer mais de 15 minutos sem e-mail de confirmação enviado.

**Architecture:** O banco identifica e reivindica de forma idempotente as reservas confirmadas sem notificação `sent`, expondo somente IDs internos. A Edge Function `email-delivery-monitor`, acionada pelo Supabase Cron a cada 15 minutos, obtém esses IDs com a service role e envia um único resumo pelo Resend ao destinatário de monitoramento.

**Tech Stack:** Supabase Postgres (RLS, RPCs, `pg_cron`, `pg_net`, Vault), Supabase Edge Functions (Deno/TypeScript), Resend, Deno tests.

**Spec:** `docs/superpowers/specs/2026-11-09-email-delivery-monitor-design.md`

## Global Constraints

- Verificar somente reservas `confirmed` há mais de 15 minutos sem `reservation_notifications.status = 'sent'` para `kind = 'payment_confirmation'`.
- Nunca incluir nome, e-mail, telefone ou outro dado de paciente no alerta ou nos logs.
- Usar apenas `EMAIL_ALERT_TO`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `EMAIL_MONITOR_CRON_SECRET` como secrets; nenhum vai para Git ou frontend.
- Emitir no máximo um alerta por reserva pendente, preservando histórico interno de alertas.
- Rodar a verificação a cada 15 minutos e manter a Edge Function inacessível sem o segredo de cron.

## Review Focus

- Uma reserva confirmada cuja confirmação foi enviada não gera alerta.
- Uma reserva recente, com menos de 15 minutos, não gera alerta.
- Duas execuções concorrentes não enviam alertas duplicados para a mesma reserva.
- A falha do Resend não marca o alerta como enviado e não expõe segredo ou dados do paciente.
- Uma chamada HTTP sem o segredo de cron recebe `401` e não consulta nem envia alertas.

---

### Task 1: Registro e reivindicação idempotente no banco

**Files:**
- Create: `supabase/migrations/<timestamp>_email_delivery_monitor.sql`
- Test: `supabase/tests/email_delivery_monitor.sql`

**Interfaces:**
- Consumes: `public.reservations`, `public.reservation_notifications` e seus estados existentes.
- Produces: `public.email_delivery_alerts`, `public.claim_email_delivery_alerts()` que retorna somente `reservation_id uuid` de alertas novos e `public.complete_email_delivery_alerts(uuid[], text, text)` para registrar o resultado do envio.

- [ ] **Step 1: Escrever o teste SQL que falha para pendência elegível e idempotência**

Crie fixtures sem PII: uma reserva `confirmed` com 16 minutos sem notificação enviada, outra com notificação `sent` e outra com 14 minutos. O teste deve esperar somente o ID da primeira na primeira chamada a `claim_email_delivery_alerts()` e nenhum ID na segunda.

- [ ] **Step 2: Executar o teste para confirmar a falha**

Run: `supabase test db --file supabase/tests/email_delivery_monitor.sql`

Expected: FAIL porque a tabela/RPC ainda não existem.

- [ ] **Step 3: Criar a migração de monitoramento**

Crie a tabela privada `public.email_delivery_alerts` com `reservation_id` único, estado `pending|sent|failed`, `sent_at`, `last_error`, timestamps e RLS sem políticas públicas. Implemente `claim_email_delivery_alerts()` como `SECURITY DEFINER`, com `search_path = public`, que encontra somente reservas confirmadas há mais de 15 minutos sem confirmação `sent`, insere os alertas com `ON CONFLICT DO NOTHING` e retorna seus IDs novos; implemente `complete_email_delivery_alerts(uuid[], text, text)` para marcar o mesmo lote como `sent` ou `failed`. Revogue `EXECUTE` de `PUBLIC`, `anon` e `authenticated` em ambas.

- [ ] **Step 4: Executar o teste para confirmar sucesso**

Run: `supabase test db --file supabase/tests/email_delivery_monitor.sql`

Expected: PASS; somente a reserva elegível é retornada uma vez.

- [ ] **Step 5: Commitar a entrega do banco**

```bash
git add supabase/migrations/<timestamp>_email_delivery_monitor.sql supabase/tests/email_delivery_monitor.sql
git commit -m "feat: track missing confirmation emails"
```

### Task 2: Edge Function e alerta pelo Resend

**Files:**
- Create: `supabase/functions/email-delivery-monitor/index.ts`
- Create: `supabase/functions/email-delivery-monitor/index.test.ts`
- Modify: `supabase/functions/_shared/resend.ts`

**Interfaces:**
- Consumes: `claim_email_delivery_alerts() -> { reservation_id: string }[]`, `complete_email_delivery_alerts(reservation_ids uuid[], provider_message_id text, error text)` e os secrets de monitoramento.
- Produces: endpoint POST `email-delivery-monitor` que responde `401`, `200` sem alertas ou `200` após registrar o envio resumido.

- [ ] **Step 1: Escrever testes Deno em falha para autenticação, resumo e erro do Resend**

Inclua testes que comprovem: pedido sem `x-email-monitor-secret` retorna 401; dois IDs internos viram um único e-mail sem PII; sucesso grava um ID de provedor para ambos; erro do Resend grava o código de falha e retorna 503.

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `deno test --allow-env --allow-net supabase/functions/email-delivery-monitor/index.test.ts`

Expected: FAIL porque a função ainda não existe.

- [ ] **Step 3: Implementar o endpoint e o helper de alerta**

Em `email-delivery-monitor/index.ts`, valide o método POST e compare `x-email-monitor-secret` com `EMAIL_MONITOR_CRON_SECRET`. Com a service role, reivindique os IDs, chame um helper no Resend que envie para `EMAIL_ALERT_TO` assunto `Alerta: confirmação de e-mail pendente` e corpo contendo apenas a contagem e os IDs internos; depois conclua cada alerta como `sent` ou `failed`. Nunca registre valores de secrets, corpo de e-mail ou dados de paciente.

- [ ] **Step 4: Executar os testes para confirmar sucesso**

Run: `deno test --allow-env --allow-net supabase/functions/email-delivery-monitor/index.test.ts`

Expected: PASS para autenticação, sucesso, falha e ausência de PII.

- [ ] **Step 5: Commitar a Edge Function**

```bash
git add supabase/functions/_shared/resend.ts supabase/functions/email-delivery-monitor/index.ts supabase/functions/email-delivery-monitor/index.test.ts
git commit -m "feat: alert missing confirmation emails"
```

### Task 3: Agendamento e verificação operacional

**Files:**
- Create: `supabase/migrations/<timestamp>_schedule_email_delivery_monitor.sql`
- Modify: `supabase/functions/mercado-pago-webhook/README.md`

**Interfaces:**
- Consumes: a Edge Function `email-delivery-monitor` já implantada e secrets `project_url`/`email_monitor_cron_secret` no Supabase Vault.
- Produces: job `email-delivery-monitor-every-15-minutes` em `cron.job` que chama a função com `net.http_post`.

- [ ] **Step 1: Escrever a verificação em falha da configuração de cron**

Antes de criar o job, consulte `cron.job` pelo nome `email-delivery-monitor-every-15-minutes`; a consulta deve não retornar resultados.

- [ ] **Step 2: Criar a migração de agendamento e configurar Vault**

Crie `supabase/migrations/<timestamp>_schedule_email_delivery_monitor.sql`; habilite `pg_cron` e `pg_net` somente se ausentes e agende `*/15 * * * *` para `net.http_post` da Edge Function com o segredo no cabeçalho. Documente a criação manual dos valores de Vault `project_url` e `email_monitor_cron_secret`; a migração nunca grava chaves reais no SQL.

- [ ] **Step 3: Implantar e configurar os secrets**

Implante `email-delivery-monitor` com JWT desabilitado, pois ela autentica pelo segredo próprio. Configure `EMAIL_ALERT_TO` e `EMAIL_MONITOR_CRON_SECRET` no Supabase; crie os correspondentes no Vault. Não exiba seus valores.

- [ ] **Step 4: Verificar o agendamento e a ausência de falsos alertas**

Consulte `cron.job` para confirmar a expressão `*/15 * * * *`. Chame a Edge Function com o segredo em um banco sem novas pendências e espere `200` sem envio; chame sem o segredo e espere `401`.

- [ ] **Step 5: Executar a suíte completa e commit final**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/*.test.ts supabase/functions/mercado-pago-webhook/*.test.ts supabase/functions/email-delivery-monitor/index.test.ts`

Expected: PASS sem contato com o Resend real.

```bash
git add supabase/migrations supabase/functions docs/superpowers/specs/2026-11-09-email-delivery-monitor-design.md docs/superpowers/plans/2026-11-09-email-delivery-monitor.md
git commit -m "feat: schedule email delivery monitoring"
```
