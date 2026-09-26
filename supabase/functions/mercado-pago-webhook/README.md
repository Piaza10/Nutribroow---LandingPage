# Webhook Mercado Pago

Configure o evento **Pagamentos** para `https://<seu-projeto>.supabase.co/functions/v1/mercado-pago-webhook` e guarde a assinatura gerada como `MERCADO_PAGO_WEBHOOK_SECRET` nos secrets do Supabase.

## E-mail de confirmação

Após um pagamento aprovado, a função envia a confirmação da consulta pelo Resend. Antes de habilitar o envio em produção, verifique o domínio `nutribroow.com` no painel do Resend e publique os registros DNS solicitados na Hostinger.

Cadastre estes secrets em **Supabase Dashboard > Edge Functions > Secrets**:

```text
RESEND_API_KEY=<api-key criada no Resend>
RESEND_FROM_EMAIL=Nutri Broow <agendamento@nutribroow.com>
```

Não coloque a API key em arquivos do projeto, GitHub ou no frontend.

Teste com credenciais de teste antes de produção:

- pagamento aprovado, valor e referência corretos: reserva vira `confirmed`;
- Pix pendente: reserva permanece `payment_pending`;
- cartão recusado: reserva não é confirmada;
- notificação aprovada repetida: resposta 200 sem segunda confirmação;
- `x-signature` inválido: resposta 401;
- referência, valor ou moeda divergente: resposta 409 e reserva não confirmada;
- reserva expirada: resposta 409 e reserva fica `expired`.

O endpoint usa a API do Mercado Pago para buscar o pagamento; não confia no status enviado no corpo da notificação.
