alter table public.reservations add column if not exists calendar_event_id text;
alter table public.reservations add column if not exists calendar_synced_at timestamptz;

create or replace function public.calendar_event_payload(p_reservation uuid)
returns table (reservation_id uuid, patient_name text, mode text, starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  return query select r.id,p.name,r.mode,s.starts_at,s.ends_at
  from reservations r join patients p on p.id=r.patient_id join availability_slots s on s.id=r.slot_id
  where r.id=p_reservation and r.status='confirmed' and r.calendar_synced_at is null;
end $$;
revoke all on function public.calendar_event_payload(uuid) from public;
