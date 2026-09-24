create or replace function public.get_available_slots(p_mode text, p_academy uuid default null)
returns table (id uuid, mode text, starts_at timestamptz, ends_at timestamptz)
language sql security definer set search_path=public as $$
  select s.id,s.mode,s.starts_at,s.ends_at from availability_slots s
  where s.active and s.mode=p_mode and s.academy_id is not distinct from p_academy
  and s.starts_at >= now()+interval '24 hours' and s.starts_at <= now()+interval '60 days'
  and not exists (select 1 from reservations r join availability_slots used on used.id=r.slot_id
    where (r.status='confirmed' or (r.status in ('temporary','payment_pending') and r.expires_at>now()))
    and tstzrange(used.starts_at,used.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)'))
  order by s.starts_at;
$$;

update availability_slots set active=false where mode='presencial' and starts_at>now()
and extract(isodow from starts_at at time zone 'America/Sao_Paulo')=1;

with days as (select generated.booking_day::date as booking_day from generate_series(current_date,current_date+interval '60 days',interval '1 day') as generated(booking_day)), slots as (
 select make_timestamptz(extract(year from booking_day)::int,extract(month from booking_day)::int,extract(day from booking_day)::int,h,0,0,'America/Sao_Paulo') starts_at from days cross join generate_series(9,18) h where extract(isodow from booking_day) between 1 and 5)
insert into availability_slots(mode,academy_id,starts_at,ends_at,active)
select 'online',null,starts_at,starts_at+interval '45 minutes',true from slots
where starts_at>=now()+interval '24 hours' and not exists(select 1 from availability_slots x where x.mode='online' and x.starts_at=slots.starts_at);

create or replace function public.create_temporary_reservation(p_slot uuid,p_name text,p_email text,p_phone text,p_academy uuid default null) returns public.reservations language plpgsql security definer set search_path=public as $$
declare s availability_slots; pat uuid; res reservations; begin
 select * into s from availability_slots where id=p_slot and active for update; if not found or s.starts_at<now()+interval '24 hours' or s.starts_at>now()+interval '60 days' then raise exception 'slot_unavailable'; end if;
 perform pg_advisory_xact_lock(hashtext(s.starts_at::text));
 update reservations set status='expired' where status in ('temporary','payment_pending') and expires_at<=now();
 if exists(select 1 from reservations r join availability_slots u on u.id=r.slot_id where (r.status='confirmed' or r.status in ('temporary','payment_pending')) and tstzrange(u.starts_at,u.ends_at,'[)') && tstzrange(s.starts_at,s.ends_at,'[)')) then raise exception 'slot_unavailable'; end if;
 if s.mode='presencial' and (p_academy is null or p_academy<>s.academy_id) then raise exception 'slot_unavailable'; end if;
 insert into patients(name,email,phone) values(trim(p_name),lower(trim(p_email)),p_phone) returning id into pat;
 insert into reservations(slot_id,patient_id,academy_id,mode,status,expires_at) values(p_slot,pat,coalesce(p_academy,s.academy_id),s.mode,'temporary',now()+interval '15 minutes') returning * into res; return res;
end $$;
revoke all on function public.get_available_slots(text,uuid) from public;
