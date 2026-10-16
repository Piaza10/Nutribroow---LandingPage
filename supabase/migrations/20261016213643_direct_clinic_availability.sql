alter table public.availability_slots
  drop constraint availability_slots_check1,
  add constraint availability_slots_check1 check (
    (mode = 'online' and academy_id is null)
    or mode = 'presencial'
  );

update public.availability_slots as slot
set active = false,
    updated_at = now()
from public.partner_academies as academy
where slot.academy_id = academy.id
  and academy.code = 'team-caetano'
  and slot.mode = 'presencial'
  and slot.starts_at >= now()
  and extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 3
  and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') = 19;

with clinic_days as (
  select day::date as day
  from generate_series(current_date, current_date + interval '60 days', interval '1 day') as day
  where extract(isodow from day) between 1 and 6
), clinic_appointments as (
  select
    ((clinic_days.day + make_time(hour, 0, 0)) at time zone 'America/Sao_Paulo') as starts_at
  from clinic_days
  cross join lateral unnest(
    case extract(isodow from clinic_days.day)::int
      when 4 then array[8, 9, 10]
      when 6 then array[8, 9, 10]
      else array[8, 9, 10, 13, 14, 15, 16, 17, 18]
    end
  ) as schedule(hour)
)
insert into public.availability_slots (mode, academy_id, starts_at, ends_at, active)
select 'presencial', null, appointment.starts_at, appointment.starts_at + interval '45 minutes', true
from clinic_appointments as appointment
where appointment.starts_at >= now() + interval '24 hours'
  and appointment.starts_at <= now() + interval '60 days'
  and not exists (
    select 1
    from public.availability_slots as existing
    where existing.mode = 'presencial'
      and existing.academy_id is null
      and existing.starts_at = appointment.starts_at
  );

create or replace function public.create_temporary_reservation(
  p_slot uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_birth_date date,
  p_age smallint,
  p_academy uuid default null
)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  slot public.availability_slots;
  patient_id uuid;
  reservation public.reservations;
begin
  if p_birth_date > current_date or p_birth_date < date '1900-01-01' or p_age not between 1 and 120 then
    raise exception 'invalid_patient_data';
  end if;

  select * into slot from public.availability_slots where id = p_slot and active for update;
  if not found
    or slot.starts_at < now() + interval '24 hours'
    or slot.starts_at > now() + interval '60 days'
    or (slot.mode = 'online' and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') = 12 and extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') <> 6)
    or (slot.mode = 'online' and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') = 19 and extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 3) then
    raise exception 'slot_unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtext(slot.starts_at::text));
  update public.reservations set status = 'expired' where status in ('temporary', 'payment_pending') and expires_at <= now();

  if exists (
    select 1 from public.reservations as existing_reservation
    join public.availability_slots as used_slot on used_slot.id = existing_reservation.slot_id
    where (existing_reservation.status = 'confirmed' or existing_reservation.status in ('temporary', 'payment_pending'))
      and tstzrange(used_slot.starts_at, used_slot.ends_at, '[)') && tstzrange(slot.starts_at, slot.ends_at, '[)')
  ) then raise exception 'slot_unavailable'; end if;

  if slot.mode = 'presencial' and (
    (slot.academy_id is null and p_academy is not null)
    or (slot.academy_id is not null and p_academy is distinct from slot.academy_id)
  ) then raise exception 'slot_unavailable'; end if;

  insert into public.patients(name, email, phone, birth_date, age)
  values (trim(p_name), lower(trim(p_email)), p_phone, p_birth_date, p_age)
  returning id into patient_id;

  insert into public.reservations(slot_id, patient_id, academy_id, mode, status, expires_at)
  values (slot.id, patient_id, coalesce(p_academy, slot.academy_id), slot.mode, 'temporary', now() + interval '15 minutes')
  returning * into reservation;
  return reservation;
end;
$$;
