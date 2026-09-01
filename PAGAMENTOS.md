# Aulora — Pagamentos Mercado Pago

O Aulora Pro custa **R$ 14,90 por 30 dias**.

## Formas disponíveis

- **Pix**: o Aulora gera QR Code e Pix Copia e Cola dentro do app.
- **Cartão**: o cliente é redirecionado para o Checkout Pro seguro do Mercado Pago.

As duas formas usam o mesmo segredo no Cloudflare:

`MERCADO_PAGO_ACCESS_TOKEN`

Não coloque esse token no GitHub nem no código do navegador.

## Ativação do Pro

O backend valida o pagamento no Mercado Pago, confere:

- conta Aulora vinculada (`external_reference`);
- valor de R$ 14,90;
- moeda BRL;
- status `approved`.

Após confirmação, adiciona 30 dias ao período Pro. Um pagamento aprovado é aplicado somente uma vez.

## Cartão

O cartão usa Checkout Pro hospedado pelo Mercado Pago. O Aulora não recebe nem armazena número do cartão, CVV ou validade.

Nesta versão o pagamento é **único por 30 dias**, sem renovação automática. Para cobrança recorrente será necessário integrar uma assinatura recorrente em uma etapa futura.

## Plano Básico

- 3 gerações inteligentes/mês;
- 5 materiais sincronizados;
- até 5 questões por atividade/avaliação;
- plano de aula, atividade e avaliação;
- sem imagens geradas por IA;
- Henry em modo de orientação básica.

## Plano Pro

- 200 gerações inteligentes/mês;
- 1.000 materiais sincronizados;
- até 20 questões;
- imagens pedagógicas geradas por IA;
- relatórios pedagógicos com IA;
- Acadêmico/ABNT com IA;
- Henry com assistência pedagógica completa.
