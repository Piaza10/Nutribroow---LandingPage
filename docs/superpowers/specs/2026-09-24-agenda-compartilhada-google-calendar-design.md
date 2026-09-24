# Agenda compartilhada e Google Agenda

## Objetivo

Disponibilizar consultas online de segunda a sexta-feira, das 09:00 às 19:00, e manter os horários presenciais da Team Caetano. Um atendimento em qualquer modalidade ocupa o mesmo intervalo de 45 minutos para todas as modalidades. Depois da confirmação do pagamento, a consulta cria um evento no calendário exclusivo `Nutri Broow – Consultas` do nutricionista.

## Regras de disponibilidade

- Consultas têm duração fixa de 45 minutos, no fuso `America/Sao_Paulo`.
- Online: segunda a sexta-feira; inícios de hora entre 09:00 e 18:00, para que a última consulta termine às 18:45 dentro da janela até 19:00.
- Presencial Team Caetano: quarta-feira, 18:00–22:00; quinta-feira, 13:00–18:00. Os inícios serão gerados em intervalos de uma hora cujo término fique dentro de cada janela.
- A reserva temporária, o pagamento pendente e uma reserva confirmada bloqueiam todo horário que se sobreponha ao intervalo da consulta, independentemente de ser online ou presencial.
- Uma reserva temporária expira em 15 minutos; após isso, deixa de bloquear a agenda. Uma reserva confirmada permanece bloqueada.

## Arquitetura

Uma migração do Supabase gerará a disponibilidade online futura e criará funções SQL para consultar horários livres e reservar um horário de modo transacional. A consulta de horários excluirá todos os slots que se sobreponham a reservas vivas. A criação da reserva aplicará a mesma regra sob bloqueio de banco, evitando duas confirmações concorrentes para o mesmo período.

A Edge Function continuará atendendo a landing, mas passará a chamar a função SQL de horários disponíveis. A confirmação vinda do webhook do Mercado Pago será o único momento que dispara a criação do evento no Google Calendar. Falhas no envio ao Google serão registradas para tentativa posterior e nunca poderão liberar o horário já pago.

## Google Agenda

Será usado um calendário exclusivo chamado `Nutri Broow – Consultas`, compartilhado com uma conta de serviço do Google Cloud com permissão para criar e alterar eventos. A credencial privada ficará somente nos secrets do Supabase, junto com o identificador do calendário. Nenhuma credencial será exposta no frontend.

Cada evento confirmado terá início e término do slot, fuso de São Paulo, identificação da modalidade e dados mínimos do paciente necessários para a consulta. O evento será criado uma única vez por reserva confirmada; processamento repetido do webhook não gerará duplicatas.

## Configuração necessária

1. Criar ou escolher um projeto no Google Cloud e ativar a Google Calendar API.
2. Criar uma service account e gerar uma chave JSON.
3. Criar o calendário `Nutri Broow – Consultas` na conta do nutricionista.
4. Compartilhar esse calendário com o e-mail da service account como editor.
5. Informar o ID do calendário e cadastrar os secrets da credencial no Supabase.

## Verificação

Testes cobrirão a geração das janelas, a exclusão cruzada entre presencial e online, a expiração da reserva temporária e a idempotência da confirmação. Um ambiente de teste usará uma reserva aprovada para confirmar a criação de exatamente um evento de 45 minutos no calendário de testes.
