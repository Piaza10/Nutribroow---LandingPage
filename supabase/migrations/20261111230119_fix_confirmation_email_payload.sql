drop function public.claim_confirmation_email_payload(uuid);

create or replace function public.claim_confirmation_email_payload(p_reservation uuid)
returns table (
  notification_id uuid,
  reservation_id uuid,
  patient_name text,
  patient_email text,
  mode text,
  unit_name text,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reservation_notifications (reservation_id, kind)
  values (p_reservation, 'payment_confirmation')
  on conflict on constraint reservation_notifications_reservation_id_kind_key do nothing;

  return query
  with claimed as (
    update public.reservation_notifications as notification
    set status = 'sending', last_error = null, updated_at = now()
    from public.reservations as reservation
    where notification.reservation_id = p_reservation
      and notification.kind = 'payment_confirmation'
      and notification.status in ('pending', 'failed')
      and reservation.id = notification.reservation_id
      and reservation.status = 'confirmed'
    returning notification.id, notification.reservation_id
  )
  select
    claimed.id,
    claimed.reservation_id,
    patient.name,
    patient.email,
    reservation.mode,
    coalesce(academy.name, 'Consultório próprio'),
    slot.starts_at,
    slot.ends_at
  from claimed
  join public.reservations as reservation on reservation.id = claimed.reservation_id
  join public.patients as patient on patient.id = reservation.patient_id
  join public.availability_slots as slot on slot.id = reservation.slot_id
  left join public.partner_academies as academy on academy.id = reservation.academy_id;
end;
$$;

revoke all on function public.claim_confirmation_email_payload(uuid) from public, anon, authenticated;
