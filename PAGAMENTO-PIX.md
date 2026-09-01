# Aulora Pro — pagamento via Pix ou cartão

O projeto usa Mercado Pago no backend do Cloudflare Worker.

## Configuração necessária

Crie o secret `MERCADO_PAGO_ACCESS_TOKEN` no Worker `aulora` usando o Access Token de **produção** da sua aplicação Mercado Pago.

Não envie o token por mensagem e não grave o token no GitHub.

A conta Mercado Pago deve possuir uma chave Pix cadastrada para oferecer Pix.

## Fluxo

1. Usuário entra no Aulora.
2. Em Perfil e dados > Planos, clica em `Pagar com Pix`.
3. O Worker cria um pagamento Pix de R$ 14,90 no Mercado Pago.
4. O Aulora exibe QR Code + Pix Copia e Cola.
5. O navegador consulta o status e o Mercado Pago também chama o webhook do Aulora.
6. Quando o pagamento aparece como `approved`, o D1 ativa o plano Pro por 30 dias.
7. O mesmo pagamento não pode conceder o período duas vezes.

## Segurança

- Access Token só no secret da Cloudflare.
- Criação de pagamento exige sessão autenticada.
- O backend consulta o pagamento diretamente no Mercado Pago antes de liberar o Pro.
- Valor, moeda e usuário de referência são validados no backend.
- Pagamentos ficam registrados na tabela `aulora_payments` para evitar concessão duplicada.
