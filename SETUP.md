# Publicar o Aulora completo no Cloudflare

## 1. Atualizar o repositório

No repositório `Silassantiago/Aulora`, envie/substitua todos os arquivos deste pacote, inclusive:

- `index.html`
- `styles.css`
- `app.js`
- `worker.js`
- `wrangler.jsonc`
- `.assetsignore`
- `_headers`
- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`

O `wrangler.jsonc` passa a ser a configuração principal do mesmo Worker `aulora`.

## 2. Deploy

O comando usado pelo Cloudflare deve continuar sendo:

`npx wrangler deploy`

O projeto agora possui:
- Static Assets
- Worker de API
- Workers AI
- D1 (`DB`)

O D1 pode ser criado automaticamente pelo Wrangler no primeiro deploy. As tabelas são criadas pelo próprio Aulora na primeira chamada à API.

## 3. Testar o gratuito

Depois do deploy:

1. Abra o Aulora.
2. Clique em `Entrar`.
3. Crie uma conta com e-mail e senha.
4. Gere um plano de aula.
5. Salve o material.
6. Saia e entre novamente para confirmar a sincronização.

O plano gratuito funciona sem Stripe.

## 4. Ativar cobrança Pro (quando quiser vender)

Crie na Stripe um produto `Aulora Pro` com preço recorrente mensal de R$ 14,90.

No Cloudflare, no Worker `aulora`, adicione secrets/variables:

- `STRIPE_SECRET_KEY` = chave secreta da Stripe
- `STRIPE_PRICE_PRO` = ID do preço, por exemplo `price_...`
- `STRIPE_WEBHOOK_SECRET` = segredo do webhook `whsec_...`

Configure na Stripe o webhook apontando para:

`https://SEU-ENDERECO/api/billing/webhook`

Eventos necessários:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Depois disso, o botão `Assinar Pro` abre o Checkout e o webhook atualiza o plano da conta.

## 5. Portal de assinatura

Ative o Customer Portal no painel da Stripe. Usuários Pro poderão usar o botão `Gerenciar assinatura`.

## 6. Secret administrativo opcional

Se quiser testar uma conta Pro sem pagamento, crie o secret:

- `AULORA_ADMIN_KEY`

Existe uma rota administrativa protegida `POST /api/admin/set-plan`. Não coloque essa chave no front-end nem em repositório público.

## 7. Antes de divulgar em escala

Recomendado:
- domínio próprio;
- política de privacidade e termos;
- proteção anti-bot no cadastro/login;
- e-mail de recuperação/verificação de conta;
- monitoramento de consumo do Workers AI;
- testes de cobrança em modo teste antes de usar chaves de produção.
