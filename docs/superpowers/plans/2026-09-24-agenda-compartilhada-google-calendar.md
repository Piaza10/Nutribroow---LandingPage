# Agenda Compartilhada e Google Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir agendamentos sobrepostos entre online e presencial e criar um evento de 45 minutos no calendário exclusivo do nutricionista somente depois do pagamento aprovado.

**Architecture:** `availability_slots` continua representando a modalidade exibida na landing, mas as funções SQL passam a tratar todas as reservas vivas como uma única agenda por intervalo de tempo. A Edge Function pública consulta uma RPC de slots livres; o webhook do Mercado Pago confirma a reserva e sincroniza idempotentemente o evento no Google Calendar por meio de uma conta de serviço.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, Supabase Edge Functions (Deno/TypeScript), Mercado Pago webhook, Google Calendar REST API, React/Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-agenda-compartilhada-google-calendar-design.md`

## Global Constraints

- Fuso de todos os horários: `America/Sao_Paulo`.
- Consultas duram exatamente 45 minutos.
- Online: segunda a sexta, das 09:00 às 19:00; último início às 18:00.
- Presencial Team Caetano: quarta 18:00–22:00 e quinta 13:00–18:00; não há mais presencial na segunda.
- Somente `temporary`, `payment_pending` não expiradas e `confirmed` bloqueiam a agenda; expirada, cancelada ou recusada não bloqueiam.
- Evento Google é criado somente com pagamento `approved`; credenciais Google permanecem apenas em secrets do Supabase.
- Não expor nome, e-mail, telefone ou credenciais em logs da landing ou do navegador.

## Review Focus

- Reserva online às 18:00 termina às 18:45 e a grade não oferece início às 19:00.
- Uma reserva presencial e um pedido online no mesmo período concorrem; apenas um pode vencer.
- Reserva temporária expirada deixa de bloquear o horário sem alterar uma reserva confirmada.
- Reenvio do mesmo webhook aprovado não cria um segundo evento no Google Agenda.
- Falha no Google após pagamento aprovado mantém a consulta bloqueada e deixa a sincronização elegível para nova tentativa.

---

### Task 1: Banco — disponibilidade online, presencial revisado e conflito cruzado

**Files:**
- Create: `supabase/migrations/202609240006_shared_schedule_and_calendar.sql`
- Create: `supabase/tests/shared_schedule.sql`
- Modify: `supabase/migrations/202609210005_payment_checkout.sql` only if migration ordering requires moving a shared function; otherwise leave historical migrations immutable.

**Interfaces:**
- Produces `public.get_available_slots(p_mode text, p_academy uuid default null)`, returning `(id uuid, mode text, starts_at timestamptz, ends_at timestamptz)`.
- Produces revised `public.create_temporary_reservation(p_slot uuid, p_name text, p_email text, p_phone text, p_academy uuid default null)`.
- Produces `public.calendar_event_payload(p_reservation uuid)` for the webhook, returning reservation, patient, slot and stable event ID.

- [ ] **Step 1: Write the SQL verification script first**

```sql
-- supabase/tests/shared_schedule.sql
begin;
do $$
begin
  if not exists (
    select 1 from public.get_available_slots('online', null)
    where extract(isodow from starts_at at time zone 'America/Sao_Paulo') between 1 and 5
      and extract(hour from starts_at at time zone 'America/Sao_Paulo') = 18
  ) then
    raise exception 'online must expose an 18:00 business-day slot';
  end if;

  if exists (
    select 1 from public.availability_slots
    where mode = 'presencial'
      and extract(isodow from starts_at at time zone 'America/Sao_Paulo') = 1
      and starts_at > now()
  ) then
    raise exception 'future Monday presencial slots must not exist';
  end if;
end $$;
rollback;
```

- [ ] **Step 2: Run the script before the migration exists**

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -f supabase/tests/shared_schedule.sql`

Expected: FAIL because `public.get_available_slots` does not exist.

- [ ] **Step 3: Implement the schedule and atomic conflict guard**

In `202609240006_shared_schedule_and_calendar.sql`:

```sql
create or replace function public.reservation_is_live(r public.reservations)
returns boolean language sql stable as $$
  select r.status = 'confirmed'
      or (r.status in ('temporary', 'payment_pending') and r.expires_at > now())
$$;

create or replace function public.get_available_slots(p_mode text, p_academy uuid default null)
returns table (id uuid, mode text, starts_at timestamptz, ends_at timestamptz)
language sql security definer set search_path = public as $$
  select s.id, s.mode, s.starts_at, s.ends_at
  from availability_slots s
  where s.active
    and s.mode = p_mode
    and s.academy_id is not distinct from p_academy
    and s.starts_at >= now() + interval '24 hours'
    and s.starts_at <= now() + interval '60 days'
    and not exists (
      select 1 from reservations r join availability_slots used on used.id = r.slot_id
      where reservation_is_live(r)
        and tstzrange(used.starts_at, used.ends_at, '[)') && tstzrange(s.starts_at, s.ends_at, '[)')
    )
  order by s.starts_at
$$;
```

Generate 60 days of online slots for ISO weekdays 1–5 and hours 9–18. Deactivate, rather than delete, future Monday Team Caetano slots when no live reservation references them; preserve booked historical data. Generate only Wednesday and Thursday Team Caetano slots according to the approved windows. In `create_temporary_reservation`, expire stale temporary/payment-pending records, acquire a transaction advisory lock based on the candidate interval, and reject if a live reservation overlaps the candidate interval before inserting.

- [ ] **Step 4: Extend the SQL tests for conflicts and expiry**

```sql
select throws_ok(
  $$select public.create_temporary_reservation(:online_same_time, 'Paciente Um', 'um@example.com', '21999999999', null)$$,
  'slot_unavailable',
  'online is rejected while presencial owns the same interval'
);

select lives_ok(
  $$select public.create_temporary_reservation(:online_after_expiry, 'Paciente Dois', 'dois@example.com', '21988888888', null)$$,
  'expired temporary reservation no longer blocks the interval'
);
```

Use fixture IDs chosen from generated Wednesday/Thursday slots at the same `starts_at`; create the conflicting presencial reservation first, then set its `expires_at` in the expiry case.

- [ ] **Step 5: Run database verification**

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -f supabase/tests/shared_schedule.sql`

Expected: PASS with no raised exception, including no future Monday presencial slots and cross-mode rejection.

### Task 2: Edge Function — listar somente slots livres

**Files:**
- Modify: `supabase/functions/public-booking/index.ts:26-33`
- Create: `supabase/functions/public-booking/index.test.ts`

**Interfaces:**
- Consumes `get_available_slots(p_mode text, p_academy uuid)` from Task 1.
- Produces unchanged browser response: `Array<{ id: string; mode: 'online' | 'presencial'; startsAt: string; endsAt: string }>`.

- [ ] **Step 1: Write the failing function test**

```ts
Deno.test('get-slots calls the shared availability RPC with the Team Caetano academy id', async () => {
  const rpc = stubSupabaseRpc({
    data: [{ id: 'slot-1', mode: 'presencial', starts_at: '2026-10-01T21:00:00Z', ends_at: '2026-10-01T21:45:00Z' }],
  })
  const response = await requestBooking({ action: 'get-slots', mode: 'presencial', academyCode: 'team-caetano' })
  assertEquals(response.status, 200)
  assertEquals(rpc.calls[0].name, 'get_available_slots')
  assertEquals(await response.json(), [{ id: 'slot-1', mode: 'presencial', startsAt: '2026-10-01T21:00:00Z', endsAt: '2026-10-01T21:45:00Z' }])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-env --allow-net supabase/functions/public-booking/index.test.ts`

Expected: FAIL because `public-booking` still queries `availability_slots` directly.

- [ ] **Step 3: Replace the direct slot query with the RPC**

```ts
const { data, error } = await db.rpc('get_available_slots', {
  p_mode: body.mode,
  p_academy: academyId,
})
if (error) throw error
return json((data ?? []).map((slot) => ({
  id: slot.id, mode: slot.mode, startsAt: slot.starts_at, endsAt: slot.ends_at,
})), 200, origin)
```

Do not alter the input contract, CORS behavior, partner requirement, or public error names.

- [ ] **Step 4: Run the function test and frontend suite**

Run: `deno test --allow-env --allow-net supabase/functions/public-booking/index.test.ts && npm test -- --run`

Working directory for the second command: `frontend`.

Expected: PASS.

### Task 3: Google Calendar client and persistent event state

**Files:**
- Modify: `supabase/migrations/202609240006_shared_schedule_and_calendar.sql`
- Create: `supabase/functions/_shared/google-calendar.ts`
- Create: `supabase/functions/_shared/google-calendar.test.ts`

**Interfaces:**
- Consumes secrets `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_CALENDAR_ID`.
- Produces `createOrGetCalendarEvent(input: CalendarEventInput): Promise<{ eventId: string }>`.
- Produces `calendar_event_payload(p_reservation uuid)` and storage fields `calendar_event_id`, `calendar_sync_status`, `calendar_sync_error`, `calendar_synced_at` on `reservations`.

- [ ] **Step 1: Write failing JWT and idempotency tests**

```ts
Deno.test('creates a calendar event with São Paulo timestamps and a deterministic event id', async () => {
  const fetchMock = mockGoogleFetch({ insertStatus: 200 })
  const event = await createOrGetCalendarEvent({
    reservationId: '7a71ee84-0b9c-4fe7-9600-b5b62a0d5132', name: 'Ana',
    startsAt: '2026-10-01T21:00:00.000Z', endsAt: '2026-10-01T21:45:00.000Z', mode: 'presencial',
  })
  assertEquals(event.eventId, 'nb7a71ee840b9c4fe79600b5b62a0d5132')
  assertEquals(fetchMock.event.timeZone, 'America/Sao_Paulo')
})

Deno.test('treats an existing deterministic Google event as success', async () => {
  const fetchMock = mockGoogleFetch({ insertStatus: 409, getStatus: 200 })
  await createOrGetCalendarEvent(calendarInput)
  assertEquals(fetchMock.getCalls, 1)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/google-calendar.test.ts`

Expected: FAIL because the Google Calendar client does not exist.

- [ ] **Step 3: Implement the Google client and migration state**

Implement OAuth service-account JWT exchange with `https://oauth2.googleapis.com/token`, scope `https://www.googleapis.com/auth/calendar.events`, and a one-hour assertion. Use a deterministic event ID consisting of `nb` plus the reservation UUID without hyphens. Call `events.insert` with `calendarId`, the event ID, summary `Consulta Nutri Broow — <modalidade>`, private visibility, São Paulo time zone, 45-minute bounds and minimal patient information. On HTTP 409, `events.get` the deterministic ID and treat an existing event as success. Add calendar sync columns to `reservations` and RPC `calendar_event_payload` that returns only a confirmed reservation and sets its sync state to `syncing` under row lock.

- [ ] **Step 4: Run Google client tests**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/google-calendar.test.ts`

Expected: PASS.

### Task 4: Webhook — sync calendar only after approved payment

**Files:**
- Modify: `supabase/functions/mercado-pago-webhook/index.ts:18-23`
- Create: `supabase/functions/mercado-pago-webhook/index.test.ts`
- Modify: `supabase/functions/mercado-pago-webhook/README.md`

**Interfaces:**
- Consumes `apply_mercado_pago_payment`, `calendar_event_payload`, and `createOrGetCalendarEvent`.
- Produces existing Mercado Pago response `{ received: true }` and persistent calendar sync state.

- [ ] **Step 1: Write failing webhook behavior tests**

```ts
Deno.test('syncs one calendar event only after an approved payment', async () => {
  const response = await webhookRequest(approvedPaymentWebhook)
  assertEquals(response.status, 200)
  assertEquals(calendarSpy.calls.length, 1)
})

Deno.test('does not sync the calendar for a pending payment', async () => {
  const response = await webhookRequest(pendingPaymentWebhook)
  assertEquals(response.status, 200)
  assertEquals(calendarSpy.calls.length, 0)
})

Deno.test('keeps an approved reservation blocked when Google is unavailable', async () => {
  const response = await webhookRequest(approvedPaymentWebhook, { googleFails: true })
  assertEquals(response.status, 202)
  assertEquals(syncState(), 'failed')
})
```

- [ ] **Step 2: Run the webhook tests to verify they fail**

Run: `deno test --allow-env --allow-net supabase/functions/mercado-pago-webhook/index.test.ts`

Expected: FAIL because the webhook only records the payment today.

- [ ] **Step 3: Add post-confirmation synchronization without weakening payment handling**

After `apply_mercado_pago_payment`, stop early for non-approved payment statuses. For approved payments, request `calendar_event_payload`; if no row is returned because it was already synced, return `{ received: true }`. Otherwise call `createOrGetCalendarEvent`, mark the reservation `synced` only after success, and mark it `failed` with a generic error code on a Google failure. Return `202` for a sync retry condition, never changing `reservations.status = 'confirmed'` back to available.

- [ ] **Step 4: Run all Edge Function tests**

Run: `deno test --allow-env --allow-net supabase/functions/_shared/google-calendar.test.ts supabase/functions/public-booking/index.test.ts supabase/functions/mercado-pago-webhook/index.test.ts`

Expected: PASS.

### Task 5: Deploy configuration and end-to-end validation

**Files:**
- Modify: `supabase/functions/mercado-pago-webhook/README.md`
- Modify: `README.md` if it contains deployment instructions.

**Interfaces:**
- Consumes a Google service-account JSON and calendar ID supplied by the account owner.
- Produces deployed migration and Edge Functions with Google secrets stored in Supabase.

- [ ] **Step 1: Add the configuration checklist to documentation**

Document exact required secrets:

```text
GOOGLE_SERVICE_ACCOUNT_JSON=<entire JSON key serialized on one line>
GOOGLE_CALENDAR_ID=<calendar ID from Google Calendar settings>
```

Document that the `Nutri Broow – Consultas` calendar must be shared with the service-account email as **Fazer alterações em eventos**, and that secrets must never be placed in `frontend/.env` or committed.

- [ ] **Step 2: Verify all local project checks**

Run: `npm run typecheck && npm run lint && npm test -- --run && npm run build`

Working directory: `frontend`.

Expected: all commands exit 0.

- [ ] **Step 3: Apply the migration and deploy functions after explicit authorization**

Run only after the user provides the Google configuration values and explicitly authorizes production changes:

```powershell
supabase db push
supabase functions deploy public-booking
supabase functions deploy mercado-pago-webhook
```

- [ ] **Step 4: Set secrets after explicit authorization**

```powershell
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='<one-line-json>'
supabase secrets set GOOGLE_CALENDAR_ID='<calendar-id>'
```

- [ ] **Step 5: Run production smoke test**

Create an online reservation at a time that also exists as presencial, confirm it using a Mercado Pago test payment, and assert all of the following:

```text
1. The overlapping presencial slot disappears before payment while the temporary reservation is live.
2. The payment-approved reservation remains unavailable in both modes.
3. Exactly one 45-minute event appears in Nutri Broow – Consultas.
4. Replaying the Mercado Pago webhook does not create a second event.
```
