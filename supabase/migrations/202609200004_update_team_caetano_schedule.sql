delete from public.availability_slots
where mode = 'presencial'
  and academy_id = (select id from public.partner_academies where code = 'team-caetano')
  and starts_at >= now() - interval '1 day';

with academy as (
  select id from public.partner_academies where code = 'team-caetano'
), business_days as (
  select day::date as day
  from generate_series(current_date, current_date + interval '60 days', interval '1 day') as generated(day)
), schedule as (
  select * from (values
    (1, 7, 11),
    (3, 18, 21),
    (4, 13, 17)
  ) as slots(isodow, first_hour, last_hour)
), appointments as (
  select
    academy.id as academy_id,
    make_timestamptz(
      extract(year from business_days.day)::int,
      extract(month from business_days.day)::int,
      extract(day from business_days.day)::int,
      hour,
      0,
      0,
      'America/Sao_Paulo'
    ) as starts_at
  from academy
  cross join business_days
  join schedule on schedule.isodow = extract(isodow from business_days.day)
  cross join lateral generate_series(schedule.first_hour, schedule.last_hour) as hours(hour)
)
insert into public.availability_slots (mode, academy_id, starts_at, ends_at, active)
select 'presencial', academy_id, starts_at, starts_at + interval '45 minutes', true
from appointments
where starts_at >= now() + interval '24 hours'
  and starts_at <= now() + interval '60 days';
