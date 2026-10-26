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
    and not (slot.mode = 'online' and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') = 12 and extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') <> 6)
    and not (slot.mode = 'online' and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') = 19 and extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 3)
    and not exists (
      select 1
      from public.partner_academies as academy
      where academy.id = slot.academy_id
        and academy.code = 'team-caetano'
        and not (
          (extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 3
            and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') between 18 and 21)
          or
          (extract(isodow from slot.starts_at at time zone 'America/Sao_Paulo') = 4
            and extract(hour from slot.starts_at at time zone 'America/Sao_Paulo') between 7 and 11)
        )
    )
    and not exists (
      select 1 from public.reservations as reservation
      join public.availability_slots as used_slot on used_slot.id = reservation.slot_id
      where (reservation.status = 'confirmed' or (reservation.status in ('temporary', 'payment_pending') and reservation.expires_at > now()))
        and tstzrange(used_slot.starts_at, used_slot.ends_at, '[)') && tstzrange(slot.starts_at, slot.ends_at, '[)')
    )
  order by slot.starts_at;
$$;
