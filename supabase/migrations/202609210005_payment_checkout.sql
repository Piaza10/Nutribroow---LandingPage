alter table public.reservations drop constraint reservations_status_check;
alter table public.reservations add constraint reservations_status_check check (status in ('temporary', 'payment_pending', 'confirmed', 'expired', 'cancelled'));

drop index public.reservations_one_live_slot;
create unique index reservations_one_live_slot on public.reservations(slot_id) where status in ('temporary', 'payment_pending');

create table public.reservation_payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id),
  plan_code text not null check (plan_code in ('consulta_trimensal', 'consulta_mensal')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  discount_origin text,
  preference_id text unique,
  payment_id text unique,
  payment_status text,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reservation_payments enable row level security;
revoke all on public.reservation_payments from anon, authenticated;

create or replace function public.create_payment_checkout(p_reservation uuid, p_plan_code text)
returns table (
  reservation_id uuid,
  email text,
  name text,
  plan_code text,
  title text,
  amount_cents integer,
  expires_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  booking record;
  price integer;
  resolved_title text;
  origin text := null;
begin
  select r.id, r.status, r.expires_at, p.email, p.name, pa.code as academy_code
    into booking
    from reservations r
    join patients p on p.id = r.patient_id
    left join partner_academies pa on pa.id = r.academy_id
    where r.id = p_reservation
    for update of r;

  if not found then raise exception 'reservation_not_found'; end if;

  if booking.expires_at <= now() and booking.status in ('temporary', 'payment_pending') then
    update reservations set status = 'expired', updated_at = now() where id = p_reservation;
    raise exception 'reservation_expired';
  end if;

  if booking.status not in ('temporary', 'payment_pending') then raise exception 'reservation_unavailable'; end if;

  if p_plan_code = 'consulta_trimensal' and booking.academy_code = 'team-caetano' then
    price := 20000; resolved_title := 'Plano Consulta Trimensal (com desconto de parceiros)'; origin := 'team-caetano';
  elsif p_plan_code = 'consulta_trimensal' then
    price := 25000; resolved_title := 'Plano Consulta Trimensal';
  elsif p_plan_code = 'consulta_mensal' then
    price := 10000; resolved_title := 'Consulta Mensal';
  else
    raise exception 'invalid_plan';
  end if;

  insert into reservation_payments (reservation_id, plan_code, amount_cents, discount_origin)
    values (p_reservation, p_plan_code, price, origin)
  on conflict (reservation_id) do update set
    plan_code = excluded.plan_code,
    amount_cents = excluded.amount_cents,
    discount_origin = excluded.discount_origin,
    updated_at = now()
  where reservation_payments.preference_id is null;

  update reservations set status = 'payment_pending', updated_at = now() where id = p_reservation;

  return query select booking.id, booking.email, booking.name, p_plan_code, resolved_title, price, booking.expires_at;
end;
$$;

create or replace function public.apply_mercado_pago_payment(
  p_reservation uuid,
  p_payment_id text,
  p_status text,
  p_amount_cents integer,
  p_currency text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  booking record;
begin
  select r.id, r.status, r.expires_at, rp.amount_cents, rp.currency, rp.payment_id
    into booking
    from reservations r
    join reservation_payments rp on rp.reservation_id = r.id
    where r.id = p_reservation
    for update of r, rp;

  if not found then raise exception 'payment_not_found'; end if;
  if booking.currency <> p_currency or booking.amount_cents <> p_amount_cents then raise exception 'payment_mismatch'; end if;
  if booking.payment_id is not null and booking.payment_id <> p_payment_id then raise exception 'payment_mismatch'; end if;

  if booking.status in ('temporary', 'payment_pending') and booking.expires_at <= now() then
    update reservations set status = 'expired', updated_at = now() where id = p_reservation;
    raise exception 'reservation_expired';
  end if;

  update reservation_payments
    set payment_id = p_payment_id, payment_status = p_status, updated_at = now()
    where reservation_id = p_reservation;

  if p_status = 'approved' and booking.status in ('temporary', 'payment_pending', 'confirmed') then
    update reservations set status = 'confirmed', updated_at = now() where id = p_reservation;
    return 'confirmed';
  end if;

  return booking.status;
end;
$$;

revoke all on function public.create_payment_checkout(uuid, text) from public;
revoke all on function public.apply_mercado_pago_payment(uuid, text, text, integer, text) from public;
