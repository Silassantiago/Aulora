# Aulora

Aulora é uma aplicação web/PWA para professores com planejamento de aula, atividades, avaliações, apoio acadêmico/ABNT, geração inteligente, login obrigatório, biblioteca na nuvem e planos Básico/Pro.

## O que já está implementado

- Plano de aula, atividade, avaliação e gabarito
- Módulo acadêmico / ABNT e formatador de referências
- Exportação para Word e impressão/PDF
- PWA instalável no celular/computador
- Conta por e-mail e senha
- Senha derivada com PBKDF2; sessão em cookie HttpOnly
- Banco Cloudflare D1
- Materiais vinculados à conta e cache local por usuário
- Geração inteligente via Cloudflare Workers AI
- Limites mensais Básico/Pro
- Checkout Pix integrado ao Mercado Pago
- QR Code + Pix Copia e Cola dentro do Aulora
- Confirmação automática e ativação do Pro por 30 dias
- Backup JSON local

## Planos definidos no código

### Básico
- 2 gerações inteligentes por mês
- 3 materiais na nuvem
- Atividades e avaliações com até 5 questões
- Plano de aula, atividade e avaliação básicos
- Sem imagens geradas por IA
- Sem relatórios, Acadêmico/ABNT, Henry IA ou exportação Word/PDF
- Backup local disponível

### Pro
- 200 gerações inteligentes por mês
- 1.000 materiais na nuvem
- Atividades e avaliações com até 20 questões
- Imagens pedagógicas por IA
- Relatórios e Acadêmico/ABNT com IA
- Henry IA
- Modelos avançados de educação inclusiva
- Exportação Word/PDF
- Cópias por e-mail quando configuradas
- Preço: R$ 14,90 por 30 dias via Pix ou cartão
- Cada novo pagamento aprovado adiciona 30 dias de acesso Pro

A cobrança é criada no backend com o valor definido pelo Aulora. O segredo de integração é `MERCADO_PAGO_ACCESS_TOKEN` e fica somente na Cloudflare.

## Infraestrutura

- Front-end: `index.html`, `styles.css`, `app.js`
- PWA: `manifest.webmanifest`, `sw.js`
- Backend: `worker.js`
- Banco: Cloudflare D1, binding `DB`
- IA: Cloudflare Workers AI, binding `AI`
- Deploy: `wrangler.jsonc`

O Wrangler atual pode provisionar automaticamente o D1 quando o binding é enviado sem um ID. O próprio Worker cria as tabelas com `CREATE TABLE IF NOT EXISTS` na primeira chamada da API.

## ABNT

O Aulora usa como referência geral:
- ABNT NBR 14724:2024 — apresentação de trabalhos acadêmicos
- ABNT NBR 10520:2023 — citações
- ABNT NBR 6023:2018 — referências

O manual específico da instituição continua prevalecendo quando houver exigências próprias.

## Segurança e privacidade

- Não coloque segredos de Mercado Pago no JavaScript do navegador.
- As chaves de cobrança ficam apenas como secrets/variables do Worker.
- Evite inserir dados pessoais desnecessários de estudantes na geração inteligente.
- Antes de abrir o produto ao público em escala, recomenda-se adicionar proteção anti-bot/rate limiting ao cadastro e login.


## Acesso e cache
- É obrigatório entrar ou criar conta para acessar a interface do Aulora.
- Visitantes veem apenas a tela de acesso.
- O service worker prioriza a rede para HTML/JS/CSS para evitar interface antiga após deploy.
- O backend migra colunas de bancos D1 criados por versões anteriores.

## Atividades inclusivas
O módulo de Atividade possui presets e controles pedagógicos para TEA/autismo, educação especial, alfabetização, atividades visuais, desenho guiado, associação, sequência, marcar/pintar e múltiplas formas de resposta. Esses recursos apoiam o planejamento docente e não realizam diagnóstico ou substituem AEE/plano individualizado quando aplicável.


## Relatórios pedagógicos
O Aulora inclui gerador de relatório pedagógico individual, parecer descritivo, evolução, AEE, coordenação, família, adaptação escolar, alfabetização e acompanhamento. Contextos como TEA, TDAH, dislexia, disgrafia, discalculia e deficiências são usados somente como informações pedagógicas fornecidas pelo educador. O gerador não realiza diagnóstico clínico e inclui aviso de natureza pedagógica no documento final.


## Base curricular por Estado e Município
O Aulora consulta a API de Localidades do IBGE para listar UFs e municípios. A geração cruza o território selecionado com a tabela D1 `aulora_curriculum_sources`. O motor só afirma alinhamento municipal/estadual quando existe trecho de fonte oficial cadastrado; caso contrário, sinaliza fallback e não inventa códigos ou regras locais.

## Figuras em atividades e provas
Atividades e avaliações podem gerar uma imagem de apoio ou um painel de três cenas pelo Workers AI (`@cf/black-forest-labs/flux-1-schnell`). A imagem entra nas versões do aluno e do professor.

## Cadastro de fontes curriculares
Existe o endpoint administrativo `POST /api/curriculum/source`, protegido pela variável secreta `CURRICULUM_ADMIN_TOKEN`. Cadastre somente trechos conferidos de documentos oficiais.


## Conta, senha e cópias por e-mail

O Aulora agora possui menu de conta no cabeçalho, alteração de senha autenticada, encerramento de sessão e preferências de cópia por e-mail.

Para ativar o envio real de e-mails, configure no Worker da Cloudflare:

- `RESEND_API_KEY` como **Secret**.
- `EMAIL_FROM` como variável/secret com um remetente autorizado, por exemplo `Aulora <noreply@seudominio.com>`.

Cópias automáticas por e-mail são recurso Pro. Sem essas duas configurações, o sistema informa que o envio ainda não está configurado.

## Avaliações profissionais

- Questões objetivas saem prontas para marcar, com opção `(   ) A)`, `[   ] A)` ou `A)`.
- Questões discursivas podem reservar 2, 4, 6 ou 8 linhas de resposta.
- A geração usa validação extra de coerência entre disciplina, tema e prova para evitar troca de componente curricular.
- O gerador rejeita avaliações excessivamente genéricas e tenta refazer automaticamente quando o padrão mínimo não é atingido.


## Administração
A conta administrativa é definida pela variável `ADMIN_EMAILS` no Worker. O administrador entra com a própria conta normal do Aulora e recebe acesso completo aos recursos, além do painel de usuários, planos e receita aprovada. Veja `ADMINISTRACAO.md`.


## Motor de variedade pedagógica
Atividades e avaliações agora recebem uma variante interna única em cada geração. O Aulora combina perfis pedagógicos, contexto e operações cognitivas diferentes e mantém um histórico curto das últimas gerações da conta para reduzir repetição de enunciados e estruturas. O plano Pro também oferece perfis avançados e versões A/B/C de avaliações.
