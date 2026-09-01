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
