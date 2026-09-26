# E-mail de Confirmação de Consulta — Design

## Objetivo

Enviar ao paciente um e-mail transacional de confirmação somente depois que o Mercado Pago informar pagamento aprovado, sem expor credenciais no navegador e sem comprometer a confirmação do pagamento ou a sincronização com Google Agenda.

## Escopo

- Provedor: Resend, usando sua API HTTPS diretamente da Edge Function do Supabase.
- Gatilho: webhook `mercado-pago-webhook`, após a aplicação do pagamento aprovado na reserva.
- Destinatário: e-mail já coletado no formulário da reserva.
- Conteúdo: nome do paciente, data e horário em `America/Sao_Paulo`, duração de 45 minutos, modalidade, contato por WhatsApp `(21) 98096-6678`, e orientação de reagendamento sujeita à disponibilidade.
- Remetente configurável pelo secret `RESEND_FROM_EMAIL`, no formato `Nutri Broow <agendamento@nutribroow.com>`.
- Segredos exclusivos do Supabase: `RESEND_API_KEY` e `RESEND_FROM_EMAIL`. Nenhuma chave é enviada ao frontend ou incluída no Git.

## Fora de escopo

- Lembretes automáticos, campanhas, anexos, newsletter e resposta automática.
- Cancelamento/reagendamento por e-mail.
- Alterações no checkout, na página pública ou nas regras de horário.

## Fluxo

1. O paciente cria a reserva e conclui o Checkout Pro normalmente.
2. Mercado Pago envia um webhook autenticado; a função consulta o pagamento na API do Mercado Pago e confirma a reserva no banco.
3. Para uma reserva confirmada, a função cria ou reivindica de forma atômica um registro de notificação `payment_confirmation`.
4. A função monta versões HTML e texto simples do e-mail, com escape dos dados do paciente, e faz `POST https://api.resend.com/emails` com `Authorization: Bearer` e a chave de idempotência `nutri-broow-confirmation-<reservation-id>`.
5. Em sucesso, grava o ID retornado pelo Resend e o instante de envio. Reentregas do webhook não reenviam a confirmação já marcada como enviada.
6. Em falha, grava o erro técnico sem dados sensíveis, deixa a notificação apta a nova tentativa e responde ao Mercado Pago sem desfazer o pagamento confirmado. A sincronização do Google Agenda continua independente.

## Banco de dados

Criar `public.reservation_notifications` com:

- `id uuid` primário;
- `reservation_id uuid` com chave estrangeira para `reservations`;
- `kind text` restrito a `payment_confirmation`;
- `status text` restrito a `pending`, `sending`, `sent`, `failed`;
- `provider_message_id text`, `sent_at timestamptz`, `last_error text`, `created_at`, `updated_at`;
- unicidade em `(reservation_id, kind)`.

RLS fica habilitada sem políticas públicas. Funções `SECURITY DEFINER` não ficam executáveis por `PUBLIC`; somente a Edge Function autenticada com a service role pode chamá-las.

As funções SQL privadas fazem duas tarefas:

- `claim_confirmation_email_payload(reservation)` insere ou reivindica uma notificação não enviada para uma reserva com status `confirmed`, retorna nome, e-mail, modalidade e horários apenas ao processo que venceu a disputa.
- `complete_confirmation_email(notification, provider_id, error)` marca `sent` após resposta 2xx ou `failed` após erro para permitir retentativa segura.

## Edge Function

Adicionar um módulo compartilhado `resend.ts`, responsável apenas por validar secrets, chamar a API e devolver o ID da mensagem. O webhook obtém o payload do banco, chama o módulo e atualiza o status da notificação. O código não registra API key, e-mail completo do paciente ou HTML nos logs.

Se os secrets ainda não estiverem configurados, o webhook registra `confirmation_email_config_missing` e continua o restante do processamento. Isso mantém pagamentos e agenda funcionando durante a configuração inicial.

## Resiliência e segurança

- O webhook continua verificando a assinatura do Mercado Pago e buscando o pagamento pelo access token; nunca confia no corpo recebido para confirmar uma consulta.
- O Resend recebe uma chave de idempotência por reserva, reduzindo duplicidades nas reentregas do webhook dentro da janela do provedor.
- O banco impede mais de uma notificação do mesmo tipo por reserva.
- Falhas de e-mail não revertem o pagamento e não expõem dados pessoais na resposta HTTP.
- O HTML escapa conteúdo dinâmico antes de interpolar nome ou modalidade.

## Testes e verificação

- Teste unitário do módulo Resend: payload correto, cabeçalho de autorização, chave de idempotência, tratamento de erro e ausência de secret em erros.
- Teste da Edge Function: pagamento aprovado cria/usa uma única notificação, envia o e-mail e marca como enviado; reentrega não envia novamente; falha do Resend não invalida o pagamento ou a agenda.
- Migração testada no banco remoto, com RLS e revogações verificadas.
- Teste manual final com uma compra de teste: confirmar recebimento, conteúdo, horário em Brasília e link/telefone de contato.

## Configuração necessária do proprietário

1. Criar conta no Resend.
2. Adicionar e verificar o domínio `nutribroow.com` no Resend, publicando os registros DNS que ele fornecer na Hostinger.
3. Criar uma API key de envio no Resend.
4. Cadastrar no Supabase os secrets `RESEND_API_KEY` e `RESEND_FROM_EMAIL`.

O valor exato das chaves nunca deve ser enviado por chat, colocado em `.env` versionado ou publicado no GitHub.
