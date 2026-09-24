# Nutri Broow — Especificação de design

## Objetivo

Entregar uma landing page responsiva e acessível que apresenta o acompanhamento nutricional Nutri Broow e conduz uma pessoa por uma jornada de agendamento com reserva temporária, checkout simulado e pré-avaliação local.

## Limites do produto

- O checkout é demonstrativo: não coleta dados financeiros e não realiza cobranças.
- A pré-avaliação é mantida somente no estado React da aba; não usa URL, cookies, localStorage, analytics, WhatsApp automático ou Supabase.
- Reservas reais somente existem no modo Supabase e são criadas pela Edge Function. O modo demo é explicitamente identificado e funciona sem variáveis externas.
- A academia parceira somente recebe os dados operacionais necessários após consentimento; nenhuma integração de compartilhamento será feita nesta versão.

## Arquitetura

O projeto terá quatro fronteiras claras:

1. `frontend/` é uma aplicação Vite com React, TypeScript e Tailwind. Ela exibe a landing e o wizard, mantém estados de UI e depende apenas do contrato `BookingGateway`.
2. `frontend/src/booking/` contém tipos, validações, formatação para `America/Sao_Paulo`, gateways demo e Supabase e um factory que seleciona o modo por `VITE_BOOKING_MODE`.
3. `supabase/` contém o esquema PostgreSQL, políticas RLS e a Edge Function `public-booking`. A função chama uma RPC transacional para obter e bloquear o slot antes de criar a reserva.
4. `docs/` contém instruções de configuração, arquitetura e aceitação manual. Nenhuma credencial é versionada.

## Jornada do usuário

1. A query `?unidade=<codigo>` é lida uma única vez. Uma unidade ativa libera presencial e permanece como origem comercial mesmo no modo online. Código ausente, inativo ou inválido deixa apenas online disponível e explica o motivo sem expor dados pessoais na URL.
2. O wizard exibe modalidade, horários, identificação e consentimentos, resumo, reserva, checkout demonstrativo, pré-avaliação e resultado.
3. Horários elegíveis têm 45 minutos, ficam entre 24 horas e 60 dias no futuro e são renderizados no fuso de São Paulo. Carregamento, vazio e erro recuperável são estados explícitos.
4. Depois de confirmados os dados, uma reserva temporária válida por 15 minutos é criada. No modo Supabase, o servidor calcula a expiração; em demo, a simulação segue a mesma interface e deixa o status visível.
5. O checkout oferece somente os estados simular aprovado, pendente e recusado. Apenas aprovado libera a pré-avaliação. Expiração retorna à seleção de horários.
6. O resultado organiza, sem diagnosticar, as respostas da pré-avaliação. Um clique voluntário abre uma mensagem pré-preenchida no WhatsApp para revisão antes de qualquer envio.

## Modelo de dados e concorrência

As tabelas são `partner_academies`, `availability_slots`, `patients` e `reservations`, com UUIDs e timestamps. Constraints garantem códigos normalizados, modalidades válidas, presencial com academia e slots exatamente de 45 minutos.

A RPC de reserva bloqueia o slot com `FOR UPDATE`, transforma reservas temporárias vencidas daquele slot em `expired`, verifica a janela temporal e a inexistência de reserva temporária vigente, cria ou localiza o paciente sem divulgar sua existência e insere uma reserva `temporary` cuja expiração é `now() + interval '15 minutes'`. Uma constraint/índice parcial garante no máximo uma reserva temporária vigente por slot. Conflitos retornam somente `slot_unavailable`.

RLS fica habilitado em todas as tabelas. O público não tem acesso direto a pacientes ou reservas, e a Edge Function usa `service_role` exclusivamente no ambiente seguro. Slots e parceiros tampouco serão expostos diretamente: a função retorna apenas dados mínimos de unidade e disponibilidade elegível.

## Edge Function e contrato público

`public-booking` aceita apenas `OPTIONS` e `POST`, limita corpo a 16 KiB, aplica CORS para `ALLOWED_ORIGINS`, valida mensagens discriminadas por `action` e nunca registra nome, e-mail, telefone ou corpo da requisição.

As ações são `get-partner`, `get-slots` e `reserve`. Os únicos erros públicos são `invalid_request`, `partner_required`, `partner_not_found`, `slot_unavailable`, `configuration_error` e `service_unavailable`. O frontend traduz cada um para linguagem clara em português e preserva os dados do formulário após erros recuperáveis.

O contrato do frontend é:

```ts
interface BookingGateway {
  getPartner(code: string | null): Promise<PartnerAcademy | null>
  getSlots(mode: BookingMode, academyCode?: string): Promise<Slot[]>
  reserve(input: ReservationInput): Promise<Reservation>
}
```

`createBookingGateway` seleciona demo por padrão; `supabase` exige URL e chave publishable. Um valor desconhecido falha claramente durante desenvolvimento. Erros no modo Supabase nunca alternam silenciosamente para demo.

## Interface e acessibilidade

A identidade alterna blocos off-white e preto profundo, com laranja como chamada principal e âmbar como acento. O hero usa uma composição própria de gradientes e formas, com área isolada para fotografia futura. As seções incluem contexto, benefícios, etapas, oferta configurável, wizard, privacidade e rodapé.

Toda interação tem HTML semântico, rótulo explícito, foco visível, área de toque adequada, contraste suficiente e operação por teclado. Erros são ligados aos campos e anunciados. Transições Framer Motion são curtas e respeitam `prefers-reduced-motion`. Links externos usam `target="_blank" rel="noopener noreferrer"`.

## Testes e validação

Regras puras de janela, normalização, validação, conflitos, expiração, factory do gateway e resumo do WhatsApp serão desenvolvidas por TDD com Vitest. Testes de componentes cobrirão fluxo, QR, bloqueio presencial, validações, checkout, pré-avaliação, mensagens de falha e redução de movimento.

Testes SQL e de função estarão preparados para Supabase CLI/Deno. Se a ferramenta não estiver instalada, a documentação indicará o comando e o relatório final diferenciará testes executados de testes preparados. A revisão visual será feita em browser em 390×844, 768×1024, 1280×720 e desktop amplo, cobrindo o fluxo completo e estados de exceção.

## Configuração e segurança

Arquivos `.env.example` conterão somente nomes de variáveis. `.env.local` e equivalentes serão ignorados. O frontend valida a configuração antes de criar o cliente Supabase. A função exige `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ALLOWED_ORIGINS`; o frontend usa somente variáveis públicas `VITE_*`.

Os dados demonstrativos incluem exclusivamente `academia-centro`, `Academia Centro`, endereço de exemplo e slots futuros fictícios. Não há segredos, dados pessoais reais ou imagens remotas.
