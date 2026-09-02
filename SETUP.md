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

O Plano Básico funciona mesmo sem configurar o Mercado Pago. É obrigatório entrar para acessar o aplicativo.

## 4. Ativar cobrança Pro via Pix (Mercado Pago)

O Aulora está preparado para vender **30 dias de Pro por R$ 14,90 via Pix**, com QR Code e Pix Copia e Cola. A ativação do Pro é automática depois que o Mercado Pago confirma o pagamento.

1. Tenha uma conta Mercado Pago com uma chave Pix cadastrada.
2. No painel Mercado Pago Developers, crie/abra sua aplicação e copie o **Access Token de produção**.
3. No Cloudflare, abra o Worker `aulora` > Settings > Variables and Secrets.
4. Adicione como **Secret**:

- `MERCADO_PAGO_ACCESS_TOKEN` = seu Access Token de produção.

**Nunca coloque esse token em `app.js`, `worker.js`, GitHub ou código público.** O segredo deve existir somente no painel da Cloudflare.

Depois disso, o botão `Pagar com Pix`:
- gera um QR Code único;
- oferece Pix Copia e Cola;
- consulta o status do pagamento;
- recebe notificações do Mercado Pago em `/api/billing/mercadopago/webhook`;
- ativa o Aulora Pro por 30 dias após um pagamento aprovado.

A URL do Worker já usa HTTPS, requisito para a `notification_url` do pagamento.

## 5. Renovação do Pro

O Pix é uma cobrança avulsa. Cada pagamento aprovado adiciona 30 dias de Pro. Não há débito automático via Pix nesta integração. Se futuramente quiser renovação automática, adicione assinatura recorrente por cartão como uma segunda forma de pagamento.

## 6. Definir sua conta de administrador

O painel administrativo do Aulora **não usa senha administrativa separada** e não existe senha hardcoded no código. Você entra com a sua conta normal do Aulora; o Worker reconhece como administrador somente os e-mails autorizados na Cloudflare.

1. Crie ou use a sua conta normal no Aulora.
2. No Cloudflare, abra o Worker `aulora` > Settings > Variables and Secrets.
3. Adicione a variável/secret:

- `ADMIN_EMAILS` = o e-mail da sua conta no Aulora.

Para autorizar mais de um administrador, separe por vírgula, por exemplo: `voce@dominio.com,socio@dominio.com`.

Depois faça um novo deploy ou reinicie a sessão. A opção **Administração** aparecerá no menu lateral. Contas administrativas têm acesso completo aos recursos para gestão e testes, sem precisar comprar Pro.

No painel administrativo você pode:
- ver total de usuários, contas Pro, materiais e receita aprovada registrada;
- pesquisar usuários por nome ou e-mail;
- adicionar 30 dias de Pro a uma conta;
- retornar uma conta ao Plano Básico.

O painel nunca exibe senhas ou hashes de senha.

## 7. Antes de divulgar em escala

Recomendado:
- domínio próprio;
- política de privacidade e termos;
- proteção anti-bot no cadastro/login;
- e-mail de recuperação/verificação de conta;
- monitoramento de consumo do Workers AI;
- testes de cobrança em modo teste antes de usar chaves de produção.


## Base curricular local
Defina um segredo `CURRICULUM_ADMIN_TOKEN` no Worker para habilitar a importação de fontes curriculares oficiais. O D1 cria automaticamente as tabelas `aulora_curriculum_sources` e `aulora_curriculum_queries`.

Exemplo de corpo JSON para `POST /api/curriculum/source`:
```json
{
  "scope": "municipal",
  "uf": "SC",
  "municipalityId": "4218905",
  "municipalityName": "Urubici",
  "title": "Currículo/Documento curricular oficial",
  "sourceUrl": "https://...",
  "sourceExcerpt": "Trecho conferido do documento oficial...",
  "verifiedAt": "2026-09-01"
}
```
O Aulora nunca deve inferir que segue um currículo municipal quando não há fonte oficial cadastrada.


## Conta, senha e cópias por e-mail

O Aulora agora possui menu de conta no cabeçalho, alteração de senha autenticada, encerramento de sessão e preferências de cópia por e-mail.

Para ativar o envio real de e-mails, configure no Worker da Cloudflare:

- `RESEND_API_KEY` como **Secret**.
- `EMAIL_FROM` como variável/secret com um remetente autorizado, por exemplo `Aulora <noreply@seudominio.com>`.

Sem essas duas configurações, as preferências continuam salvas, mas o sistema informa que o envio ainda não está configurado e não bloqueia a geração de materiais.


## Cartão de crédito / débito

O cartão usa o Checkout Pro do Mercado Pago e o mesmo secret `MERCADO_PAGO_ACCESS_TOKEN`. Não é necessário colocar dados de cartão no frontend do Aulora. Consulte também `PAGAMENTOS.md`.


## RECUPERAÇÃO DE SENHA

O botão **Esqueci minha senha** usa o mesmo serviço de e-mail do Aulora. No Cloudflare, configure como secrets/variáveis de runtime:

- `RESEND_API_KEY` — chave privada da conta Resend.
- `EMAIL_FROM` — remetente verificado, por exemplo `Aulora <contato@seudominio.com.br>`.

O link de redefinição expira em 30 minutos, é armazenado no D1 somente como hash e é invalidado após o primeiro uso. A redefinição encerra todas as sessões antigas da conta.
