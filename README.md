# Aulora

Aulora é uma aplicação web/PWA para professores com planejamento de aula, atividades, avaliações, apoio acadêmico/ABNT, geração inteligente, login, biblioteca na nuvem e planos Free/Pro.

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
- Limites mensais Free/Pro
- Checkout e portal de assinatura preparados para Stripe
- Webhook Stripe para ativar/rebaixar plano automaticamente
- Backup JSON local

## Planos definidos no código

### Gratuito
- 5 gerações inteligentes por mês
- 25 materiais na nuvem
- Atividades e avaliações com até 10 questões
- Plano de aula, atividade, avaliação e Acadêmico/ABNT
- Exportação Word/PDF e backup local

### Pro
- 200 gerações inteligentes por mês
- 1.000 materiais na nuvem
- Atividades e avaliações com até 20 questões
- Todos os recursos atuais com limites ampliados
- Preço exibido no app: R$ 14,90/mês

O valor real cobrado é definido pelo Price criado na Stripe e informado em `STRIPE_PRICE_PRO`.

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

- Não coloque segredos de Stripe no JavaScript do navegador.
- As chaves de cobrança ficam apenas como secrets/variables do Worker.
- Evite inserir dados pessoais desnecessários de estudantes na geração inteligente.
- Antes de abrir o produto ao público em escala, recomenda-se adicionar proteção anti-bot/rate limiting ao cadastro e login.


## Interface de convidado e cache
- Visitantes veem Entrar + Criar conta grátis no topo.
- Geração inteligente não cria conteúdo genérico quando não há sessão.
- O service worker prioriza a rede para HTML/JS/CSS para evitar interface antiga após deploy.
- O backend migra colunas de bancos D1 criados por versões anteriores.

## Atividades inclusivas
O módulo de Atividade possui presets e controles pedagógicos para TEA/autismo, educação especial, alfabetização, atividades visuais, desenho guiado, associação, sequência, marcar/pintar e múltiplas formas de resposta. Esses recursos apoiam o planejamento docente e não realizam diagnóstico ou substituem AEE/plano individualizado quando aplicável.


## Relatórios pedagógicos
O Aulora inclui gerador de relatório pedagógico individual, parecer descritivo, evolução, AEE, coordenação, família, adaptação escolar, alfabetização e acompanhamento. Contextos como TEA, TDAH, dislexia, disgrafia, discalculia e deficiências são usados somente como informações pedagógicas fornecidas pelo educador. O gerador não realiza diagnóstico clínico e inclui aviso de natureza pedagógica no documento final.
