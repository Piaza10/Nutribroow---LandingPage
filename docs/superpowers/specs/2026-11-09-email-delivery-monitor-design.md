# Monitor de entrega de e-mails — Design

## Intenção

Detectar pagamentos aprovados que não tiveram uma tentativa de e-mail de confirmação registrada e avisar o nutricionista por e-mail, sem usar informações de pacientes no alerta.

## Objetivo

- Identificar confirmações de pagamento com mais de 15 minutos que não possuam uma notificação `payment_confirmation` em estado `sent`.
- Enviar um alerta resumido ao destinatário configurado no segredo `EMAIL_ALERT_TO`, por meio do Resend.
- Evitar alertas repetidos para o mesmo problema, registrando o alerta emitido internamente.

## Fora de escopo

- Reenviar automaticamente a confirmação ao paciente.
- Incluir nome, e-mail, telefone ou qualquer outro dado pessoal no alerta.
- Criar mensagens automáticas por WhatsApp.

## Abordagens consideradas

1. **Monitor no banco + alerta por e-mail — escolhida.** Uma rotina agendada consulta pagamentos confirmados sem confirmação enviada e chama uma Edge Function interna que envia um resumo pelo Resend. É independente do fluxo de pagamento e permite detectar falhas de execução.
2. **Teste sintético de pagamento/e-mail.** Cobriria o provedor ponta a ponta, mas exige uma transação de teste e uma caixa de monitoramento.
3. **Alerta por WhatsApp.** Descartada porque o projeto só possui links de conversa, não uma API de envio.

## Componentes

- Uma tabela privada de alertas de monitoramento, com a reserva como identificador interno, estado e instante de envio.
- Uma consulta/RPC que localiza somente reservas aprovadas há mais de 15 minutos sem e-mail `sent`, sem retornar dados do paciente.
- Uma Edge Function agendada que chama essa consulta e envia, pelo Resend, um e-mail com apenas a quantidade de falhas e identificadores internos de reserva.
- Um workflow de testes automatizados que verifica os casos: confirmação enviada, pendência acima do limite, falha do Resend e idempotência do alerta.

## Segurança e operação

- `EMAIL_ALERT_TO`, `RESEND_API_KEY` e `RESEND_FROM_EMAIL` permanecem exclusivamente nos secrets do Supabase.
- O destinatário recebe somente contagem e IDs internos de reservas, nunca dados de pacientes.
- A agenda será configurada para verificar a cada 15 minutos.

## Verificação

- Testes automatizados devem falhar quando uma confirmação aprovada fica sem tentativa de e-mail e passar quando o alerta é registrado uma única vez.
- A rotina deve ser verificada com uma consulta de dados agregados, sem disparar e-mails a pacientes.
