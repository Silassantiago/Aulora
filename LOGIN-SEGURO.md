# Login seguro do Aulora

O login utiliza um desafio de uso único:

1. O navegador solicita sal + custo PBKDF2 + nonce.
2. A senha é processada no navegador com PBKDF2-SHA256.
3. O navegador envia apenas uma prova HMAC-SHA256 ligada ao nonce.
4. O nonce expira em 5 minutos e só pode ser usado uma vez.
5. O Worker compara a prova com o verificador já armazenado no D1 e cria a sessão.

Isso mantém compatibilidade com contas antigas que usaram diferentes custos de PBKDF2 e evita executar o KDF pesado no Worker durante o login.
