revoke execute on function public.get_available_slots(text, uuid) from public, anon, authenticated;
revoke execute on function public.create_temporary_reservation(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.create_temporary_reservation(uuid, text, text, text, date, smallint, uuid) from public, anon, authenticated;
