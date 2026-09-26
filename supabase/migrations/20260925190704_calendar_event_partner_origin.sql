drop function public.calendar_event_payload(uuid);

create function public.calendar_event_payload(p_reservation uuid)
returns table (
  reservation_id uuid,
  patient_name text,
  mode text,
  partner_name text,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select
    reservation.id,
    patient.name,
    reservation.mode,
    academy.name,
    slot.starts_at,
    slot.ends_at
  from public.reservations as reservation
  join public.patients as patient on patient.id = reservation.patient_id
  join public.availability_slots as slot on slot.id = reservation.slot_id
  left join public.partner_academies as academy on academy.id = reservation.academy_id
  where reservation.id = p_reservation
    and reservation.status = 'confirmed'
    and reservation.calendar_synced_at is null;
end;
$$;

revoke all on function public.calendar_event_payload(uuid) from public;
