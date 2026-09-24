insert into public.partner_academies (code, name, address, active)
values (
  'team-caetano',
  'Team Caetano',
  'Estrada do Mato Alto, 808, Campo Grande, Rio de Janeiro — RJ',
  true
)
on conflict (code) do update
set name = excluded.name, address = excluded.address, active = true, updated_at = now();

with academy as (
  select id from public.partner_academies where code = 'team-caetano'
), business_days as (
  select day::date as day
  from generate_series(
    current_date,
    current_date + interval '60 days',
    interval '1 day'
  ) as day
  where extract(isodow from day) between 1 and 5
), appointments as (
  select
    academy.id as academy_id,
    ((business_days.day + make_time(hour, 0, 0)) at time zone 'America/Sao_Paulo') as starts_at
  from academy
  cross join business_days
  cross join generate_series(9, 18) as hour
)
insert into public.availability_slots (mode, academy_id, starts_at, ends_at, active)
select 'presencial', academy_id, starts_at, starts_at + interval '45 minutes', true
from appointments
where starts_at >= now() + interval '24 hours'
  and starts_at <= now() + interval '60 days'
  and not exists (
    select 1
    from public.availability_slots existing
    where existing.mode = 'presencial'
      and existing.academy_id = appointments.academy_id
      and existing.starts_at = appointments.starts_at
  );
