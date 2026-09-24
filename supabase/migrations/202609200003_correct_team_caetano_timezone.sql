delete from public.availability_slots
where mode = 'presencial'
  and academy_id = (select id from public.partner_academies where code = 'team-caetano')
  and starts_at >= now() - interval '1 day';

with academy as (
  select id from public.partner_academies where code = 'team-caetano'
), business_days as (
  select day::date as day
  from generate_series(current_date, current_date + interval '60 days', interval '1 day') as generated(day)
  where extract(isodow from day) between 1 and 5
), appointments as (
  select
    academy.id as academy_id,
    make_timestamptz(
      extract(year from business_days.day)::int,
      extract(month from business_days.day)::int,
      extract(day from business_days.day)::int,
      slot_hour,
      0,
      0,
      'America/Sao_Paulo'
    ) as starts_at
  from academy
  cross join business_days
  cross join generate_series(9, 18) as generated_hours(slot_hour)
)
insert into public.availability_slots (mode, academy_id, starts_at, ends_at, active)
select 'presencial', academy_id, starts_at, starts_at + interval '45 minutes', true
from appointments
where starts_at >= now() + interval '24 hours'
  and starts_at <= now() + interval '60 days';
