# Supabase

Instale a CLI, execute `supabase login`, `supabase link --project-ref SEU_REF` e `supabase db push`. Use `supabase/seed.sql` apenas para desenvolvimento. Defina `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ALLOWED_ORIGINS` somente nos secrets da Edge Function; no navegador use apenas variáveis `VITE_*`. Confirme RLS com `supabase test db` e nunca exponha a service role.
