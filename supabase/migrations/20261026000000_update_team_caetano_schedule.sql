with academy as (
  select id from public.partner_academies where code = 'team-caetano'
)
update public.availability_slots as slot
set active = false,
    updated_at = now()
from academy
where slot.mode = 'presencial'
  and slot.academy_id = academy.id
  and slot.active
  and slot.starts_at >= now() + interval '24 hours'
  and slot.starts_at <= now() + interval '60 days'
  and not (
    (extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 3
      and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') between 18 and 21)
    or
    (extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 4
      and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') between 7 and 11)
  )
  and not exists (
    select 1
    from public.reservations as reservation
    where reservation.slot_id = slot.id
      and (
        reservation.status = 'confirmed'
        or (reservation.status in ('temporary', 'payment_pending') and reservation.expires_at > now())
      )
  );

with academy as (
  select id from public.partner_academies where code = 'team-caetano'
)
update public.availability_slots as slot
set active = true,
    updated_at = now()
from academy
where slot.mode = 'presencial'
  and slot.academy_id = academy.id
  and not slot.active
  and slot.starts_at >= now() + interval '24 hours'
  and slot.starts_at <= now() + interval '60 days'
  and (
    (extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 3
      and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') between 18 and 21)
    or
    (extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 4
      and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') between 7 and 11)
  )
  and not exists (
    select 1
    from public.reservations as reservation
    where reservation.slot_id = slot.id
      and (
        reservation.status = 'confirmed'
        or (reservation.status in ('temporary', 'payment_pending') and reservation.expires_at > now())
      )
  );

with academy as (
  select id from public.partner_academies where code = 'team-caetano'
), clinic_days as (
  select day::date as day
  from generate_series(current_date, current_date + interval '60 days', interval '1 day') as day
  where extract(isodow from day) in (3, 4)
), desired_slots as (
  select
    ((clinic_days.day + make_time(hour, 0, 0)) at time zone 'America/Sao_Paulo') as starts_at
  from clinic_days
  cross join lateral unnest(
    case extract(isodow from clinic_days.day)::int
      when 3 then array[18, 19, 20, 21]
      when 4 then array[7, 8, 9, 10, 11]
    end
  ) as schedule(hour)
)
insert into public.availability_slots (mode, academy_id, starts_at, ends_at, active)
select 'presencial', academy.id, desired.starts_at, desired.starts_at + interval '45 minutes', true
from academy
cross join desired_slots as desired
where desired.starts_at >= now() + interval '24 hours'
  and desired.starts_at <= now() + interval '60 days'
  and not exists (
    select 1
    from public.availability_slots as existing
    where existing.mode = 'presencial'
      and existing.academy_id = academy.id
      and existing.starts_at = desired.starts_at
  );
