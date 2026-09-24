# Nutri Broow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, accessible Nutri Broow landing page with demo and Supabase-backed temporary bookings.

**Architecture:** The React frontend depends on a small `BookingGateway` contract so demo and Supabase behavior are interchangeable. Supabase exposes only an Edge Function, which invokes validated SQL/RPC operations under service credentials; RLS denies direct public access to private data.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, React Hook Form, Zod, Lucide React, Framer Motion, Vitest, Testing Library, Supabase JS, PostgreSQL, Deno Edge Functions.

**Spec:** `docs/superpowers/specs/2026-09-16-nutri-broow-design.md`

## Global Constraints

- Use no payment provider, financial inputs, automatic WhatsApp messages, secrets, or personal data in URLs/logs.
- Default `VITE_BOOKING_MODE` to `demo`; Supabase failures never fall back to demo.
- Persist only bookings in Supabase; keep pre-assessment data only in React state.
- Use `America/Sao_Paulo`; expose only future 45-minute slots from 24 hours through 60 days.
- RLS denies anonymous direct access to patients and reservations.
- Do not commit automatically; leave changes uncommitted for user review.

---

### Task 1: Scaffold the frontend and quality tooling

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tailwind.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/index.css`
- Create: `frontend/src/test/setup.ts`, `frontend/.env.example`, `.gitignore`

**Interfaces:**
- Produces a Vite test/build/lint environment for all later frontend tasks.

- [ ] **Step 1: Add a smoke test**

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the Nutri Broow brand', () => {
  render(<App />)
  expect(screen.getByText(/Nutri Broow/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run it to verify initial failure**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because the application entry has not been created.

- [ ] **Step 3: Configure Vite, Vitest, Tailwind and a minimal App**

```tsx
export default function App() {
  return <main><h1>Nutri Broow</h1></main>
}
```

- [ ] **Step 4: Verify the smoke test and base checks**

Run: `npm test -- --run src/App.test.tsx && npm run typecheck && npm run build`

Expected: PASS, zero TypeScript errors and production bundle generated.

### Task 2: Define and test booking domain rules

**Files:**
- Create: `frontend/src/booking/types.ts`, `frontend/src/booking/validation.ts`, `frontend/src/booking/time.ts`, `frontend/src/booking/errors.ts`
- Test: `frontend/src/booking/validation.test.ts`, `frontend/src/booking/time.test.ts`

**Interfaces:**
- Produces: `BookingMode`, `PartnerAcademy`, `Slot`, `Reservation`, `ReservationInput`, `identitySchema`, `normalizePhone`, `isBookableSlot`, `toSaoPauloLabel`, `bookingErrorMessage`.

- [ ] **Step 1: Write failing tests for identity and time boundaries**

```ts
expect(normalizePhone('(21) 98096-6678')).toBe('21980966678')
expect(identitySchema.safeParse(validIdentity).success).toBe(true)
expect(identitySchema.safeParse({ ...validIdentity, consentBooking: false }).success).toBe(false)
expect(isBookableSlot(atExactly24Hours, now)).toBe(true)
expect(isBookableSlot(before24Hours, now)).toBe(false)
expect(isBookableSlot(after60Days, now)).toBe(false)
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/booking/validation.test.ts src/booking/time.test.ts`

Expected: FAIL because domain modules do not exist.

- [ ] **Step 3: Implement the minimal pure domain modules**

```ts
export const normalizePhone = (value: string) => value.replace(/\D/g, '')
export const isBookableSlot = (startsAt: string, now: Date) => {
  const ms = new Date(startsAt).getTime() - now.getTime()
  return ms >= 24 * 60 * 60_000 && ms <= 60 * 24 * 60 * 60_000
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/booking/validation.test.ts src/booking/time.test.ts`

Expected: PASS for normalisation, consent validation, date window and public error translations.

### Task 3: Build and test gateways

**Files:**
- Create: `frontend/src/booking/gateway.ts`, `frontend/src/booking/demo-gateway.ts`, `frontend/src/booking/supabase-gateway.ts`, `frontend/src/booking/create-gateway.ts`
- Test: `frontend/src/booking/demo-gateway.test.ts`, `frontend/src/booking/create-gateway.test.ts`

**Interfaces:**
- Consumes: domain types from Task 2.
- Produces: `BookingGateway`, `DemoBookingGateway`, `SupabaseBookingGateway`, `createBookingGateway`.

- [ ] **Step 1: Write failing behavior tests**

```ts
await expect(gateway.getPartner('academia-centro')).resolves.toMatchObject({ active: true })
await expect(gateway.getPartner('missing')).resolves.toBeNull()
await expect(gateway.reserve(input)).resolves.toMatchObject({ status: 'temporary' })
await expect(gateway.reserve(inputForSameSlot)).rejects.toMatchObject({ code: 'slot_unavailable' })
expect(() => createBookingGateway({ mode: 'broken' })).toThrow(/VITE_BOOKING_MODE/)
expect(() => createBookingGateway({ mode: 'supabase' })).toThrow(/configuração/i)
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/booking/demo-gateway.test.ts src/booking/create-gateway.test.ts`

Expected: FAIL because gateway implementations are absent.

- [ ] **Step 3: Implement gateways and factory**

```ts
export interface BookingGateway {
  getPartner(code: string | null): Promise<PartnerAcademy | null>
  getSlots(mode: BookingMode, academyCode?: string): Promise<Slot[]>
  reserve(input: ReservationInput): Promise<Reservation>
}
```

The demo gateway contains only safe fictitious academy/slot data and tracks active temporary slots in memory. The Supabase gateway posts discriminated requests to `/functions/v1/public-booking`, translates stable errors, and rejects malformed responses.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/booking/demo-gateway.test.ts src/booking/create-gateway.test.ts`

Expected: PASS; no silent mode or backend fallback exists.

### Task 4: Implement the database schema, RLS and atomic RPC

**Files:**
- Create: `supabase/migrations/202609160001_booking_schema.sql`, `supabase/seed.sql`, `supabase/tests/booking.sql`

**Interfaces:**
- Produces: tables, constraints, RLS policies and `public.create_temporary_reservation(...)` RPC.

- [ ] **Step 1: Write SQL assertions before the migration**

```sql
select throws_like(
  $$ insert into availability_slots(mode, starts_at, ends_at) values ('online', now()+interval '2 days', now()+interval '2 days 44 minutes') $$,
  '%45 minutes%',
  'slot duration must be 45 minutes'
);
```

- [ ] **Step 2: Verify RED with Supabase local test command**

Run: `supabase test db`

Expected: FAIL because migrations and schema are absent.

- [ ] **Step 3: Add schema, index and RPC**

The migration enables `pgcrypto`, creates all four UUID/timestamp tables, checks normalized academy code and valid mode, requires academy for presencial, enforces 45-minute duration, enables RLS and grants no anonymous policy for patients/reservations. The RPC locks the requested slot, expires only prior temporary holds for it, validates slot/mode/academy/window, upserts the patient safely, and inserts a temporary reservation with server-side `now() + interval '15 minutes'`.

- [ ] **Step 4: Verify SQL rules and concurrency**

Run: `supabase test db`

Expected: PASS for active/inactive academy, slot window, duration, direct-access denial, one-winner concurrent reservation and expired-slot release.

### Task 5: Create the public booking Edge Function

**Files:**
- Create: `supabase/functions/public-booking/index.ts`, `supabase/functions/public-booking/deno.json`, `supabase/functions/public-booking/index.test.ts`

**Interfaces:**
- Consumes: Task 4 RPC and service credentials only through runtime environment.
- Produces: POST actions `get-partner`, `get-slots`, `reserve` and public error envelope `{ error: PublicBookingError }`.

- [ ] **Step 1: Write failing HTTP tests**

```ts
expect(await handler(new Request(url, { method: 'GET' }))).toHaveProperty('status', 405)
expect(await jsonResponse({ action: 'reserve' })).toEqual({ error: 'invalid_request' })
expect(await oversizedRequest()).toEqual({ error: 'invalid_request' })
```

- [ ] **Step 2: Verify RED**

Run: `deno test --allow-env --allow-net supabase/functions/public-booking/index.test.ts`

Expected: FAIL because the handler is absent.

- [ ] **Step 3: Implement function and strict input validation**

Use `OPTIONS` and allowed origins only, reject bodies above 16 KiB, parse JSON once, validate with discriminated schemas, use the service client only after configuration checks, return minimal partner/slot/reservation shapes, and log only event category and error code.

- [ ] **Step 4: Verify GREEN**

Run: `deno test --allow-env --allow-net supabase/functions/public-booking/index.test.ts`

Expected: PASS for CORS, method/body validation, partner rules, unavailable slot and internal-error redaction.

### Task 6: Build the landing sections and booking wizard

**Files:**
- Create: `frontend/src/components/Header.tsx`, `Hero.tsx`, `ValueSections.tsx`, `BookingWizard.tsx`, `BookingSteps.tsx`, `Privacy.tsx`, `Footer.tsx`, `frontend/src/App.tsx`
- Test: `frontend/src/App.test.tsx`, `frontend/src/components/BookingWizard.test.tsx`

**Interfaces:**
- Consumes: `BookingGateway`, domain validators and formatted slots.
- Produces: accessible embedded scheduling journey through reservation creation.

- [ ] **Step 1: Write failing UI-flow tests**

```tsx
render(<App gateway={demoGateway} locationSearch="?unidade=academia-centro" />)
expect(await screen.findByRole('button', { name: /presencial/i })).toBeEnabled()
await user.click(screen.getByRole('button', { name: /presencial/i }))
expect(await screen.findByText(/45 minutos/i)).toBeInTheDocument()
```

Include tests for absent/invalid QR, disabled presencial, field-specific errors, recoverable slot loading errors, consent requirements and accessible status announcements.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/App.test.tsx src/components/BookingWizard.test.tsx`

Expected: FAIL because landing components are absent.

- [ ] **Step 3: Implement semantic responsive sections and wizard**

Build the header, dark/light landing sections, gradients/future-photo frame, CTAs, benefits, how-it-works, offer and privacy notice. Use React Hook Form + Zod for identity/consents, `aria-live` for async states and Framer Motion only for reduced-motion-safe decoration/step transitions.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/App.test.tsx src/components/BookingWizard.test.tsx`

Expected: PASS for all QR, scheduling and validation routes.

### Task 7: Checkout simulation, pre-assessment and WhatsApp handoff

**Files:**
- Create: `frontend/src/components/DemoCheckout.tsx`, `PreAssessment.tsx`, `AssessmentResult.tsx`, `frontend/src/assessment/summary.ts`
- Test: `frontend/src/components/DemoCheckout.test.tsx`, `frontend/src/assessment/summary.test.ts`

**Interfaces:**
- Consumes: created `Reservation` and React-only assessment form state.
- Produces: assessment unlock state and locally generated WhatsApp text.

- [ ] **Step 1: Write failing state tests**

```tsx
await user.click(screen.getByRole('button', { name: /simular pagamento pendente/i }))
expect(screen.queryByText(/pré-avaliação nutricional/i)).not.toBeInTheDocument()
await user.click(screen.getByRole('button', { name: /simular pagamento aprovado/i }))
expect(await screen.findByText(/pré-avaliação nutricional/i)).toBeInTheDocument()
expect(createWhatsappSummary(answers)).toContain(answers.goal)
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/components/DemoCheckout.test.tsx src/assessment/summary.test.ts`

Expected: FAIL because the checkout and summary modules are absent.

- [ ] **Step 3: Implement explicit demo-only checkout and session-only assessment**

Render countdown from reservation expiration, return to slots on expiry, offer only the three simulation outcomes, and provide a short multi-step assessment with local state. Create a cautious non-diagnostic result and an explicit external-link click that opens the WhatsApp compose URL.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/components/DemoCheckout.test.tsx src/assessment/summary.test.ts`

Expected: PASS for approved/pending/refused/expired paths and WhatsApp summary output.

### Task 8: Complete documentation, security checks and visual review

**Files:**
- Create: `README.md`, `docs/architecture.md`, `docs/supabase-setup.md`, `docs/manual-acceptance.md`, `supabase/.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Documents all executable commands, environment variables and remaining credential-bound setup.

- [ ] **Step 1: Add documentation acceptance assertions**

```ts
expect(readme).toMatch(/VITE_BOOKING_MODE=demo/)
expect(readme).toMatch(/\?unidade=academia-centro/)
expect(supabaseGuide).toMatch(/ALLOWED_ORIGINS/)
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/docs.test.ts`

Expected: FAIL because required documentation files are absent.

- [ ] **Step 3: Write documents and harden ignored files**

Document installation, demo/Supabase modes, CLI setup, migrations, seeds, function secrets, RLS inspection, no-real-payment limitation, external credential steps and full manual acceptance list. Ignore `.env`, `.env.*`, except example files, and verify no values occur in examples.

- [ ] **Step 4: Run final automated, security and visual checks**

Run: `npm test -- --run && npm run lint && npm run typecheck && npm run build`

Run when installed: `deno test --allow-env --allow-net supabase/functions/public-booking/index.test.ts && supabase test db`

Inspect: 390×844, 768×1024, 1280×720 and desktop wide; hero, navigation, all wizard outcomes, error/empty states, privacy, no horizontal scroll, keyboard focus and reduced motion.

Expected: all available checks PASS; unavailable Deno/Supabase tools are reported precisely rather than treated as passing.
