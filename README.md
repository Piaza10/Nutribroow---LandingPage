# Nutri Broow

Landing page de nutrição com agendamento demonstrativo, em `frontend/`. Rode `cd frontend`, `npm install`, `npm run dev`. O modo padrão é demo; use `?unidade=academia-centro` para habilitar atendimento presencial. `npm test -- --run --maxWorkers=1`, `npm run typecheck` e `npm run build` validam o frontend.

Para reservas persistentes, aplique `supabase/migrations/202609160001_booking_schema.sql`, configure as variáveis do arquivo exemplo e implemente/deploy a Edge Function descrita na especificação. O checkout não processa cobrança e a pré-avaliação fica só na memória da aba.
