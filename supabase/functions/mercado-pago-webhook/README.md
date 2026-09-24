# Webhook Mercado Pago

Configure o evento **Pagamentos** para `https://<seu-projeto>.supabase.co/functions/v1/mercado-pago-webhook` e guarde a assinatura gerada como `MERCADO_PAGO_WEBHOOK_SECRET` nos secrets do Supabase.

Teste com credenciais de teste antes de produção:

- pagamento aprovado, valor e referência corretos: reserva vira `confirmed`;
- Pix pendente: reserva permanece `payment_pending`;
- cartão recusado: reserva não é confirmada;
- notificação aprovada repetida: resposta 200 sem segunda confirmação;
- `x-signature` inválido: resposta 401;
- referência, valor ou moeda divergente: resposta 409 e reserva não confirmada;
- reserva expirada: resposta 409 e reserva fica `expired`.

O endpoint usa a API do Mercado Pago para buscar o pagamento; não confia no status enviado no corpo da notificação.
