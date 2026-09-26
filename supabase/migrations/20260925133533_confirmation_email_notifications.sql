create table public.reservation_notifications (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  kind text not null check (kind = 'payment_confirmation'),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  provider_message_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, kind)
);

alter table public.reservation_notifications enable row level security;
revoke all on table public.reservation_notifications from public, anon, authenticated;

create or replace function public.claim_confirmation_email_payload(p_reservation uuid)
returns table (
  notification_id uuid,
  reservation_id uuid,
  patient_name text,
  patient_email text,
  mode text,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  insert into public.reservation_notifications (reservation_id, kind)
  values (p_reservation, 'payment_confirmation')
  on conflict (reservation_id, kind) do nothing;

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
    slot.starts_at,
    slot.ends_at
  from claimed
  join public.reservations as reservation on reservation.id = claimed.reservation_id
  join public.patients as patient on patient.id = reservation.patient_id
  join public.availability_slots as slot on slot.id = reservation.slot_id;
end;
$$;

create or replace function public.complete_confirmation_email(
  p_notification uuid,
  p_provider_id text,
  p_error text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.reservation_notifications
  set
    status = case when p_error is null then 'sent' else 'failed' end,
    provider_message_id = p_provider_id,
    sent_at = case when p_error is null then now() else null end,
    last_error = p_error,
    updated_at = now()
  where id = p_notification
    and status = 'sending';
end;
$$;

revoke all on function public.claim_confirmation_email_payload(uuid) from public;
revoke all on function public.complete_confirmation_email(uuid, text, text) from public;
