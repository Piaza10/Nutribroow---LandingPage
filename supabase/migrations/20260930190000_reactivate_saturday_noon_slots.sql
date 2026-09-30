update public.availability_slots as slot
set active = true,
    updated_at = now()
where slot.mode = 'online'
  and slot.starts_at >= now() + interval '24 hours'
  and extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 6
  and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') = 12
  and not exists (
    select 1 from public.reservations as reservation
    where reservation.slot_id = slot.id
      and (reservation.status = 'confirmed' or (reservation.status in ('temporary', 'payment_pending') and reservation.expires_at > now()))
  );

with days as (
  select generated.booking_day::date as booking_day
  from generate_series(current_date, current_date + interval '60 days', interval '1 day') as generated(booking_day)
  where extract(isodow from generated.booking_day) = 6
)
insert into public.availability_slots (mode, academy_id, starts_at, ends_at, active)
select 'online', null, starts_at, starts_at + interval '45 minutes', true
from (
  select make_timestamptz(extract(year from booking_day)::int, extract(month from booking_day)::int, extract(day from booking_day)::int, 12, 0, 0, 'America/Sao_Paulo') as starts_at
  from days
) as saturday_noon
where saturday_noon.starts_at >= now() + interval '24 hours'
  and not exists (
    select 1 from public.availability_slots as existing
    where existing.mode = 'online' and existing.starts_at = saturday_noon.starts_at
  );
