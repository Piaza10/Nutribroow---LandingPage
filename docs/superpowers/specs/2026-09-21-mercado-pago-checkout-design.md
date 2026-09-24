# Checkout Mercado Pago — Nutri Broow

## Objetivo

Cobrar consultas agendadas com Mercado Pago, mantendo o cartão fora da landing, confirmando a reserva somente por webhook e aplicando automaticamente o desconto da Team Caetano.

## Produtos e preços

| Produto | Preço | Regra |
| --- | ---: | --- |
| Plano Consulta Trimensal | R$ 250,00 | Preço padrão. |
| Plano Consulta Trimensal — parceiro | R$ 200,00 | Aplicado apenas quando a origem for `team-caetano`. |
| Consulta Mensal (30 dias de acompanhamento) | R$ 100,00 | Preço padrão e parceiro. |

O paciente pode pagar por Pix ou cartão. Cartão permite até 3 parcelas, com juros calculados e cobrados pelo Mercado Pago ao paciente.

## Jornada do paciente

1. Escolhe um plano antes de selecionar o horário.
2. Seleciona modalidade e horário de 45 minutos.
3. Informa nome, e-mail, telefone e consentimentos.
4. Cria uma reserva temporária de 15 minutos com o plano e preço selecionados.
5. A landing solicita ao backend uma preferência do Checkout Pro e redireciona o paciente ao Mercado Pago.
6. O Mercado Pago retorna o paciente para uma página de status, mas essa tela é apenas informativa.
7. O webhook validado no servidor confirma ou recusa o pagamento. Somente uma confirmação por webhook torna a reserva confirmada.

Se a reserva vencer antes da aprovação, o pagamento não pode confirmar um horário já liberado; a equipe trata o caso manualmente.

## Backend e dados

- Nova tabela ou campos de pagamento vinculados à reserva: produto, valor em centavos, origem do desconto, `mercado_pago_preference_id`, `mercado_pago_payment_id`, status e timestamps.
- Status de reserva: `temporary`, `payment_pending`, `confirmed`, `expired`, `cancelled`.
- Edge Function `create-checkout`: recebe uma reserva temporária válida, recalcula o preço no servidor, cria a preferência do Checkout Pro e devolve somente a URL de inicialização.
- Edge Function `mercado-pago-webhook`: recebe a notificação, busca o pagamento no Mercado Pago usando o token privado, confere valor, moeda, referência externa e reserva; então atualiza o status de modo idempotente.
- O cliente nunca decide que um pagamento foi aprovado.

## Segurança

- `MERCADO_PAGO_ACCESS_TOKEN` será um segredo do Supabase e só será lido pelas Edge Functions.
- `VITE_MERCADO_PAGO_PUBLIC_KEY` poderá ser usada no frontend somente se necessária; Checkout Pro por redirecionamento não depende dela no primeiro corte.
- A preferência guarda `external_reference` igual ao ID da reserva, sem dados clínicos.
- O webhook aceita apenas o formato esperado, consulta o pagamento na API do Mercado Pago e ignora notificações inválidas ou duplicadas.
- Nenhuma credencial entra em Git, mensagens do chat ou logs.

## Política apresentada no checkout

- Não há reembolso automático.
- Após pagamento, o paciente pode solicitar reagendamento para outra data e horário disponíveis.
- A política aparece antes do redirecionamento ao Mercado Pago.

## Limites do primeiro corte

- Não há reembolso, estorno ou reagendamento automático pelo site.
- Não há assinatura recorrente: os três produtos são cobranças únicas.
- A ativação em produção só ocorre depois de compra de teste aprovada e autorização explícita do responsável.

## Critérios de aceite

- A origem `team-caetano` mostra R$ 200 no trimestral; as demais mostram R$ 250.
- O backend rejeita preço ou plano enviados pelo navegador que não correspondam às regras do servidor.
- Uma reserva aprovada por webhook é confirmada uma única vez.
- Pix pendente não confirma a consulta.
- Pagamento recusado ou reserva expirada não confirma a consulta.
- Testes cobrem preços, criação de checkout, validação de webhook e transições de status.
