# Motor de IA pedagógica do Aulora

## Variedade real entre gerações
- Cada atividade e avaliação recebe um identificador de variação interno e aleatório.
- O servidor escolhe uma combinação de perfil pedagógico, contexto e operações cognitivas.
- A temperatura de geração foi ajustada para permitir diversidade sem abandonar as regras de qualidade.
- O identificador interno nunca é exibido ao aluno ou professor.

## Histórico anti-repetição
- O D1 mantém somente um histórico curto das últimas gerações da conta para atividades e avaliações.
- As três gerações recentes são usadas como referência do que NÃO deve ser repetido na próxima geração.
- O histórico é limitado às 20 entradas mais recentes por usuário.

## Validação pedagógica
- Atividade e avaliação passam por uma checagem adicional de disciplina e tema.
- Se Ciências gerar conteúdo de Língua Portuguesa, por exemplo, a tentativa é rejeitada e refeita.
- Materiais com aparência excessivamente genérica/de demonstração também podem ser rejeitados pelo validador.

## Controles novos
### Atividade
- Estilo de criação
- Finalidade
- Contexto das tarefas
- Nível cognitivo
- Nível de variedade

### Avaliação
- Perfil da prova
- Construção das questões
- Versão automática, A, B ou C
- Nível de variedade

## Nova versão
Na prévia de atividade e avaliação há o botão “Nova versão”. Ele reaproveita os mesmos dados do formulário e solicita uma geração nova e diferente.

## Pesquisa factual antes da geração

Aulora consulta fontes antes de criar planos, atividades e avaliações. A pesquisa combina:
- texto-base fornecido pelo professor (quando houver);
- fontes curriculares verificadas já cadastradas no D1;
- pesquisa enciclopédica de apoio via API pública da Wikipédia em português.

Depois da pesquisa, há duas barreiras automáticas:
1. validação de compatibilidade entre disciplina, tema e fontes recuperadas;
2. validação factual do material gerado contra as evidências recuperadas.

Se o tema estiver ambíguo ou incompatível com a disciplina, o Aulora deve pedir maior especificação em vez de fabricar conteúdo. As fontes consultadas aparecem apenas na versão do professor e são removidas da versão do aluno.

Observação técnica: Workers AI não deve ser apresentado como navegador de internet por si só. Pesquisa web ampla exige um provedor de busca/tooling específico; esta versão usa fontes reais acessíveis sem uma chave adicional e não finge ter consultado a web quando não consultou.
