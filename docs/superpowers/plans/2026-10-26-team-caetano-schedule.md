# Team Caetano Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oferecer para a Team Caetano somente horários presenciais futuros de quarta, das 18h às 21h, e quinta, das 7h às 11h.

**Architecture:** Uma migração de dados atualiza somente as vagas presenciais associadas ao código `team-caetano` dentro da janela pública de 60 dias. Ela desativa vagas fora da grade sem reserva ativa, reativa as vagas desejadas que já existem e insere apenas as ausentes; a landing continua consumindo `get_available_slots`, portanto não requer alteração de frontend.

**Tech Stack:** PostgreSQL/Supabase migrations, funções RPC existentes de disponibilidade.

**Spec:** `docs/superpowers/specs/2026-10-26-team-caetano-schedule-design.md`

## Global Constraints

- Alterar apenas vagas `presencial` da academia com código `team-caetano` nos próximos 60 dias.
- Horários permitidos: quarta-feira às 18h, 19h, 20h e 21h; quinta-feira às 7h, 8h, 9h, 10h e 11h, no fuso `America/Sao_Paulo`.
- Preservar reservas `confirmed`, `temporary` ainda válidas e `payment_pending` ainda válidas.
- Não alterar horários online, demais academias, preços, pagamentos ou reservas existentes.
- Cada vaga deve manter duração de 45 minutos.

## Review Focus

- Uma reserva confirmada em horário que deixa de ser ofertado permanece intacta e a vaga não é desativada.
- Uma reserva temporária ou pendente expirada não impede a correção da grade.
- Uma vaga desejada previamente desativada volta a ficar ativa, sem duplicação no mesmo início.
- Conversão de dia e hora usa `America/Sao_Paulo`, não UTC.
- A RPC pública retorna somente a nova grade disponível da Team Caetano depois da migração.

---

### Task 1: Atualizar a grade futura da Team Caetano

**Files:**
- Create: `supabase/migrations/20261026000000_update_team_caetano_schedule.sql`

**Interfaces:**
- Consumes: `public.availability_slots`, `public.reservations`, `public.partner_academies` e a RPC `public.get_available_slots(text, uuid)` existentes.
- Produces: vagas presenciais ativas da Team Caetano na janela de 24 horas a 60 dias, com a grade de quarta e quinta definida no objetivo.

- [x] **Step 1: Registrar a falha da grade atual com uma consulta somente de leitura**

Execute uma consulta por `academy.code = 'team-caetano'` que agrupe as vagas públicas futuras por `extract(isodow from starts_at at time zone 'America/Sao_Paulo')` e hora local. A consulta deve provar que qualquer dia/horário fora de quarta 18–21 e quinta 7–11 precisa ser removido ou que há horários desejados ausentes.

- [x] **Step 2: Criar a migração seletiva**

Escreva `supabase/migrations/20261026000000_update_team_caetano_schedule.sql` para:

1. localizar a academia por `code = 'team-caetano'`;
2. desativar somente vagas presenciais futuras da academia fora da nova grade, desde que não tenham reserva `confirmed`, `temporary` com `expires_at > now()` ou `payment_pending` com `expires_at > now()`;
3. reativar vagas existentes que pertençam à nova grade e não tenham uma dessas reservas ativas;
4. gerar cada quarta e quinta de `current_date` até 60 dias, converter a hora local com `at time zone 'America/Sao_Paulo'`, e inserir somente vagas desejadas inexistentes entre `now() + interval '24 hours'` e `now() + interval '60 days'`;
5. definir `ends_at` como `starts_at + interval '45 minutes'` e `active = true`.

- [x] **Step 3: Aplicar a migração no projeto Supabase `dcvvmkrmgtzccalhnruo`**

Use o mecanismo de migração do projeto com o nome `update_team_caetano_schedule`. Esperado: a operação conclui sem modificar RPCs, tabelas ou dados de outras academias.

- [x] **Step 4: Verificar o resultado pela mesma interface da landing**

Consulte `public.get_available_slots('presencial', <id da Team Caetano>)`, converta os resultados para `America/Sao_Paulo` e confirme que todos os horários retornados são quarta 18h, 19h, 20h ou 21h, ou quinta 7h, 8h, 9h, 10h ou 11h. Confirme também que há exemplos futuros de ambos os dias.

- [x] **Step 5: Verificar reservas preservadas e ausência de duplicatas**

Execute consultas que confirmem: (a) nenhuma vaga com reserva ativa foi desativada por esta mudança; (b) não existe mais de uma vaga presencial da Team Caetano com o mesmo `starts_at`; e (c) todas as vagas ativas têm intervalo de 45 minutos.

- [x] **Step 6: Registrar a alteração no Git**

Run: `git diff --check`

Expected: saída vazia.

```bash
git add docs/superpowers/specs/2026-10-26-team-caetano-schedule-design.md docs/superpowers/plans/2026-10-26-team-caetano-schedule.md supabase/migrations/20261026000000_update_team_caetano_schedule.sql
git commit -m "feat: update Team Caetano schedule"
git push origin master
git push origin master:main
```
