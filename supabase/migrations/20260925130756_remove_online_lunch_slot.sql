update public.availability_slots as slot
set active = false,
    updated_at = now()
where slot.mode = 'online'
  and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') = 12
  and slot.starts_at >= now()
  and not exists (
    select 1
    from public.reservations as reservation
    where reservation.slot_id = slot.id
      and (
        reservation.status = 'confirmed'
        or (reservation.status in ('temporary', 'payment_pending') and reservation.expires_at > now())
      )
  );

create or replace function public.get_available_slots(p_mode text, p_academy uuid default null)
returns table (id uuid, mode text, starts_at timestamptz, ends_at timestamptz)
language sql security definer set search_path = public as $$
  select slot.id, slot.mode, slot.starts_at, slot.ends_at
  from public.availability_slots as slot
  where slot.active
    and slot.mode = p_mode
    and slot.academy_id is not distinct from p_academy
    and slot.starts_at >= now() + interval '24 hours'
    and slot.starts_at <= now() + interval '60 days'
    and not (
      slot.mode = 'online'
      and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') = 12
    )
    and not exists (
      select 1
      from public.reservations as reservation
      join public.availability_slots as used_slot on used_slot.id = reservation.slot_id
      where (
        reservation.status = 'confirmed'
        or (reservation.status in ('temporary', 'payment_pending') and reservation.expires_at > now())
      )
        and tstzrange(used_slot.starts_at, used_slot.ends_at, '[)') && tstzrange(slot.starts_at, slot.ends_at, '[)')
    )
  order by slot.starts_at;
$$;

create or replace function public.create_temporary_reservation(
  p_slot uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_academy uuid default null
)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  slot public.availability_slots;
  patient_id uuid;
  reservation public.reservations;
begin
  select * into slot from public.availability_slots where id = p_slot and active for update;
  if not found
    or slot.starts_at < now() + interval '24 hours'
    or slot.starts_at > now() + interval '60 days'
    or (slot.mode = 'online' and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') = 12) then
    raise exception 'slot_unavailable';
  end if;

  perform pg_advisory_xact_lock(hashtext(slot.starts_at::text));
  update public.reservations
  set status = 'expired'
  where status in ('temporary', 'payment_pending') and expires_at <= now();

  if exists (
    select 1
    from public.reservations as existing_reservation
    join public.availability_slots as used_slot on used_slot.id = existing_reservation.slot_id
    where (existing_reservation.status = 'confirmed' or existing_reservation.status in ('temporary', 'payment_pending'))
      and tstzrange(used_slot.starts_at, used_slot.ends_at, '[)') && tstzrange(slot.starts_at, slot.ends_at, '[)')
  ) then
    raise exception 'slot_unavailable';
  end if;

  if slot.mode = 'presencial' and (p_academy is null or p_academy <> slot.academy_id) then
    raise exception 'slot_unavailable';
  end if;

  insert into public.patients(name, email, phone)
  values (trim(p_name), lower(trim(p_email)), p_phone)
  returning id into patient_id;

  insert into public.reservations(slot_id, patient_id, academy_id, mode, status, expires_at)
  values (slot.id, patient_id, coalesce(p_academy, slot.academy_id), slot.mode, 'temporary', now() + interval '15 minutes')
  returning * into reservation;

  return reservation;
end;
$$;
