# QR codes para futuras academias — desenho curto

## Intenção

Criar dois cartazes neutros e imprimíveis para serem deixados em academias ainda não identificadas. Cada QR code deve manter uma identidade própria desde já, para que a origem possa ser vinculada posteriormente sem reimpressão.

## Objetivo

- Gerar dois QR codes funcionais para `parceiro-01` e `parceiro-02`.
- Fazer cada QR abrir o agendamento da NutriBroow.
- Entregar um cartaz visualmente neutro, com logo, chamada para falar com o nutricionista e área para escrever o nome da academia à mão.

## Fora de escopo

- Não criar registros de academias ativas, descontos ou regras de repasse agora.
- Não alterar o fluxo de agendamento nem o banco de dados nesta etapa.

## Abordagens consideradas

1. **QR genérico para a home:** mais simples, mas não permite identificar a academia depois.
2. **QR únicos pré-reservados (escolhida):** cada cartaz aponta para `https://nutribroow.com/?unidade=parceiro-01` ou `parceiro-02`. Hoje funciona como acesso comum; no futuro, esses mesmos códigos poderão ser associados à academia correspondente no banco.

## Entregáveis e decisões

- Dois arquivos SVG de QR code, preservando leitura nítida em impressão.
- Dois cartazes SVG A4, um para cada código, com a identidade NutriBroow e área de preenchimento manual do nome da academia.
- Os QR codes terão margem de leitura e URL explícita; não serão gerados por IA para evitar qualquer risco de erro nos módulos.

## Verificação

- Confirmar que os dois QR codes decodificam para URLs distintas.
- Renderizar os cartazes para inspeção visual antes de entregar.
