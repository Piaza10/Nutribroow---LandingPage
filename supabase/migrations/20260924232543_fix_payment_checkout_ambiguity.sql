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
  on conflict on constraint reservation_payments_reservation_id_key do update set
    plan_code = excluded.plan_code,
    amount_cents = excluded.amount_cents,
    discount_origin = excluded.discount_origin,
    updated_at = now()
  where reservation_payments.preference_id is null;

  update reservations set status = 'payment_pending', updated_at = now() where id = p_reservation;

  return query select booking.id, booking.email, booking.name, p_plan_code, resolved_title, price, booking.expires_at;
end;
$$;
