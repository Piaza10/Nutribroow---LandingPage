create table public.email_delivery_alerts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_delivery_alerts enable row level security;
revoke all on table public.email_delivery_alerts from public, anon, authenticated;

create or replace function public.claim_email_delivery_alerts()
returns table (reservation_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select reservation.id
    from public.reservations as reservation
    where reservation.status = 'confirmed'
      and reservation.updated_at <= now() - interval '15 minutes'
      and not exists (
        select 1 from public.reservation_notifications as notification
        where notification.reservation_id = reservation.id
          and notification.kind = 'payment_confirmation'
          and notification.status = 'sent'
      )
  ), inserted as (
    insert into public.email_delivery_alerts (reservation_id)
    select id from candidates
    on conflict (reservation_id) do nothing
    returning email_delivery_alerts.reservation_id
  )
  select inserted.reservation_id from inserted;
end;
$$;

create or replace function public.complete_email_delivery_alerts(
  p_reservations uuid[],
  p_provider_id text,
  p_error text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.email_delivery_alerts
  set status = case when p_error is null then 'sent' else 'failed' end,
      provider_message_id = p_provider_id,
      sent_at = case when p_error is null then now() else null end,
      last_error = p_error,
      updated_at = now()
  where reservation_id = any (p_reservations)
    and status = 'pending';
end;
$$;

revoke all on function public.claim_email_delivery_alerts() from public, anon, authenticated;
revoke all on function public.complete_email_delivery_alerts(uuid[], text, text) from public, anon, authenticated;
