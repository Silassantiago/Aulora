# Administração do Aulora

## Qual é o login do administrador?

O administrador usa **a própria conta normal do Aulora**. Não há usuário ou senha padrão no código.

Configure no Worker da Cloudflare:

`ADMIN_EMAILS=seu-email-da-conta@exemplo.com`

Após entrar com esse mesmo e-mail e a senha que você cadastrou no Aulora, o menu **Administração** será liberado automaticamente.

A conta administrativa recebe acesso completo aos recursos do Aulora para gestão e testes.

## Segurança

- Não coloque senha de administrador no GitHub.
- Não compartilhe o `MERCADO_PAGO_ACCESS_TOKEN`.
- Se quiser mais administradores, adicione os e-mails em `ADMIN_EMAILS`, separados por vírgula.
- Remover um e-mail de `ADMIN_EMAILS` remove o acesso administrativo na próxima sessão/consulta da conta.
