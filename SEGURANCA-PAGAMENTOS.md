# Aulora — Segurança para pagamentos em produção

## Arquitetura de pagamento

- **Cartão:** usa Checkout Pro hospedado pelo Mercado Pago. O Aulora não recebe, processa nem grava número do cartão, CVV ou validade.
- **Pix:** o backend cria a cobrança no Mercado Pago e entrega apenas o QR Code / código Pix ao usuário autenticado.
- O valor e a moeda são conferidos novamente no backend antes de liberar o Plano Pro.
- A liberação do Pro é idempotente: o mesmo pagamento aprovado não concede dias duas vezes.

## Secrets obrigatórios no Cloudflare

Cadastre em **Workers e Pages → aulora → Configurações → Runtime variables and secrets**. Use o tipo **Secret**:

1. `MERCADO_PAGO_ACCESS_TOKEN` — Access Token de produção.
2. `MERCADO_PAGO_WEBHOOK_SECRET` — chave secreta gerada em **Mercado Pago → Suas integrações → aplicação Aulora → Webhooks → Configurar notificações**.

Nunca coloque esses valores no GitHub, `wrangler.jsonc`, screenshots ou mensagens.

## Webhook Mercado Pago

Configure o evento **Pagamentos** com a URL HTTPS:

`https://aulora.silassantiago-sh.workers.dev/api/billing/mercadopago/webhook`

O Aulora valida `x-signature` e `x-request-id` por HMAC-SHA256 antes de processar a notificação. Se a assinatura não conferir, responde 401 e não altera plano de usuário.

## Verificação antes de vender

Abra `/api/health`. Para produção, confirme:

- `"billing": true`
- `"paymentSecurity":{"webhookSignature":true,"hostedCardCheckout":true}`

Se `webhookSignature` estiver `false`, não considere a configuração de produção concluída.

## Proteções adicionais no Aulora

- Sessão em cookie `HttpOnly`, `Secure` em HTTPS e `SameSite=Lax`.
- Senhas novas protegidas com PBKDF2-HMAC-SHA256 com 600.000 iterações e salt aleatório; contas antigas são atualizadas no próximo login.
- Rate limit em cadastro, login, alteração de senha, geração de IA e início de pagamentos.
- Verificação de origem para requisições de alteração.
- Headers: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, COOP e CORP.
- Access Token enviado ao Mercado Pago somente no header `Authorization` pelo backend.
- URL de checkout aceita somente HTTPS em domínio Mercado Pago.
- Alterar a senha encerra todas as sessões anteriores.

## Operação recomendada

- Teste primeiro com credenciais de teste e simulação de webhook.
- Ative produção somente depois de configurar os dois secrets.
- Renove credenciais do Mercado Pago periodicamente e atualize o Secret no Cloudflare.
- Ative 2FA na conta Cloudflare, GitHub e Mercado Pago.
- Restrinja quem tem acesso administrativo a essas contas.
- Não armazene dados de cartão no Aulora.


## RECUPERAÇÃO DE SENHA

O botão **Esqueci minha senha** usa o mesmo serviço de e-mail do Aulora. No Cloudflare, configure como secrets/variáveis de runtime:

- `RESEND_API_KEY` — chave privada da conta Resend.
- `EMAIL_FROM` — remetente verificado, por exemplo `Aulora <contato@seudominio.com.br>`.

O link de redefinição expira em 30 minutos, é armazenado no D1 somente como hash e é invalidado após o primeiro uso. A redefinição encerra todas as sessões antigas da conta.
