# Backlog - App de Finanças Pessoais (baseado no Minhas Economias)

Documento gerado a partir do mapeamento funcional do site Minhas Economias, para servir de base de implementação de uma versão própria do produto.

## Mapeamento funcional observado

### Transações
Tela com navegação por mês (anterior/próximo), saldo anterior consolidado, lista de lançamentos agrupada por dia com saldo acumulado do dia. Permite adicionar transação inline (sem abrir página nova) com tipo Despesa/Receita/Transferência, data, descrição, categoria (com sugestão automática e busca), conta, valor e uma seção "mais opções" com lembrete por e-mail, nota livre, e repetição (parcelamento mensal com número de parcelas, ou modo avançado com frequência configurável em dias/semanas/meses/anos e repetição indefinida). Transações existentes são editadas com um clique direto na linha (mesmo formulário, pré-preenchido). Há seleção múltipla com ações em lote: excluir, consolidar (marcar como conferida), desmarcar consolidação e alterar categoria. Existe filtro por status (todas / consolidadas / não consolidadas), busca rápida por texto, filtro lateral por conta e por categoria (árvore hierárquica de grupos), e exportação para PDF/XLS com seleção de período e orientação da página. Na tela inicial (Início) aparece o resumo do mês (saldo anterior, entradas, saídas, saldo final), gráfico de despesas por categoria e duas listas de pendências: "anteriores não consolidadas" e "próximas não consolidadas".

### Orçamento
Permite criar orçamentos por ano, define valor previsto por categoria (aplicando o mesmo valor a todos os meses ou um valor específico por mês), mostra gráfico "Realizado x Previsto" acumulado ao longo dos dias do mês e uma tabela por categoria (agrupada por grupos de categoria) comparando realizado x previsto, com destaque visual (barra vermelha) quando o realizado ultrapassa o previsto. Também existe um recurso de "Convites" para adicionar outra pessoa (ex.: cônjuge) à conta/orçamento.

### Contas (saldo)
Painel lateral lista todas as contas com saldo atual, permite criar nova conta (nome, valor inicial, ativo sim/não), editar e excluir uma conta existente (via links que aparecem ao passar o mouse), possui seção de "contas inativas" (arquivamento) e calcula automaticamente o saldo consolidado somando todas as contas ativas. Contas também servem de filtro para a lista de transações.

### Categorias
Organizadas em uma árvore de grupos (ex.: ECONOMIA, FIXO, EXTERNO) contendo categorias/subcategorias. A categorização é assistida por um motor de regras ("Categorização automática"): cada categoria tem uma lista de palavras-chave; ao lançar uma transação cuja descrição contenha uma palavra-chave cadastrada, o sistema sugere/aplica automaticamente a categoria correspondente. Essas regras podem ser criadas e editadas (adicionar/remover palavras-chave) a partir da tela de Configurações.

---

## Épico 1 — Gestão de Contas (saldo)

### US1.1 — Criar conta financeira
Como usuário, eu quero cadastrar uma nova conta (carteira, conta corrente, poupança, cartão de crédito, investimento etc.) para poder organizar meu dinheiro entre diferentes locais.

Critérios de aceite:
- Dado que estou na tela de contas, quando clico em "Nova conta", então um formulário é exibido com os campos Nome (texto obrigatório), Saldo inicial (numérico, aceita negativo, default 0,00) e Status Ativa (sim/default | não).
- Dado que preenchi o formulário corretamente, quando clico em Salvar, então a conta é criada e passa a aparecer na lista lateral com o saldo inicial informado.
- Dado que deixei o campo Nome vazio, quando tento salvar, então o sistema exibe erro de validação e não cria a conta.
- Dado que clico em Cancelar, quando o formulário está aberto, então nenhuma conta é criada e o formulário é fechado.

### US1.2 — Editar conta existente
Como usuário, eu quero editar o nome, o saldo inicial ou o status de uma conta para corrigir informações cadastradas incorretamente.

Critérios de aceite:
- Dado que existe uma conta cadastrada, quando aciono a opção "Editar" dessa conta, então o formulário abre pré-preenchido com os dados atuais.
- Dado que altero o nome ou o saldo inicial e salvo, então a lista de contas e o saldo consolidado são recalculados imediatamente.
- Dado que altero o status para "Não" (inativa), quando salvo, então a conta some da lista principal e passa a aparecer apenas em "Contas inativas".

### US1.3 — Excluir conta
Como usuário, eu quero excluir uma conta que não uso mais para manter minha lista organizada.

Critérios de aceite:
- Dado que aciono "Excluir" em uma conta, então o sistema pede confirmação antes de excluir.
- Dado que a conta possui transações vinculadas, quando confirmo a exclusão, então o sistema informa quantas transações serão afetadas e pergunta se devo excluí-las junto ou realocá-las para outra conta.
- Dado que confirmo a exclusão, então a conta não aparece mais em nenhuma lista, filtro ou dropdown de seleção de conta.

### US1.4 — Arquivar/reativar conta (contas inativas)
Como usuário, eu quero inativar contas que não uso mais sem perder o histórico, e poder reativá-las depois.

Critérios de aceite:
- Dado que uma conta está marcada como inativa, então ela aparece em uma seção colapsável "Contas inativas" e não entra no cálculo do saldo consolidado padrão nem nos filtros de lançamento de novas transações.
- Dado que reativo uma conta inativa, então ela volta a aparecer na lista principal e volta a ser somada ao saldo consolidado.

### US1.5 — Visualizar saldo consolidado e saldo por conta
Como usuário, eu quero ver o saldo total de todas as minhas contas e também o saldo individual de cada uma, para entender minha posição financeira.

Critérios de aceite:
- Dado que tenho múltiplas contas ativas, quando acesso a tela principal, então vejo o "saldo atual" somando os saldos de todas as contas ativas (saldo inicial + soma de todas as transações da conta até a data corrente).
- Dado que uma conta está com o checkbox desmarcado no filtro lateral, quando isso ocorre, então essa conta é excluída do somatório e das listagens de transações exibidas.
- Dado que marco/desmarco o checkbox "Todos", então todas as contas são selecionadas/desmarcadas de uma vez.

### US1.6 — Transferência entre contas
Como usuário, eu quero registrar uma transferência entre duas das minhas contas (ex.: pagamento de fatura de cartão puxando da conta corrente) sem que isso seja contado como despesa ou receita real.

Critérios de aceite:
- Dado que crio uma transação do tipo "Transferência", então o formulário pede conta de origem e conta de destino, valor e data, sem exigir categoria (ou usando categoria fixa "Transferência").
- Dado que salvo a transferência, então duas transações espelhadas são criadas automaticamente: um débito na conta de origem e um crédito de igual valor na conta de destino.
- Dado que excluo uma transferência, então ambos os lançamentos espelhados (origem e destino) são removidos juntos.
- Dado que uma transferência existe, então ela não é contabilizada no total de "Entradas" nem "Saídas" do resumo do mês, nem no orçamento por categoria.

---

## Épico 2 — Gestão de Categorias

### US2.1 — Estrutura hierárquica de categorias
Como usuário, eu quero organizar minhas categorias em grupos (ex.: Moradia, Alimentação, Lazer, Reservas) para ter uma visão mais organizada dos meus gastos.

Critérios de aceite:
- Dado que acesso a lista de categorias, então elas são exibidas agrupadas por um "grupo" pai, com subcategorias filhas indentadas abaixo de cada grupo.
- Dado que uma categoria não pertence a nenhum grupo específico, então ela pode ser exibida em um grupo padrão (ex.: "Outros" ou "Sem Categoria").

### US2.2 — Criar categoria (e grupo)
Como usuário, eu quero criar novas categorias e, se necessário, novos grupos de categoria, para refletir minha realidade financeira (ex.: "Escola dos filhos", "Terapias").

Critérios de aceite:
- Dado que acesso a tela de gestão de categorias, quando clico em "Nova categoria", então posso informar nome, grupo (existente ou novo) e tipo (receita/despesa, ou ambos).
- Dado que salvo a nova categoria, então ela passa a aparecer imediatamente em todos os seletores de categoria (transações, orçamento, filtros e regras de categorização).
- Dado que tento criar uma categoria com nome já existente no mesmo grupo, então o sistema impede duplicidade e avisa o usuário.

### US2.3 — Editar/renomear categoria
Como usuário, eu quero renomear ou mover uma categoria entre grupos para reorganizar minha estrutura financeira sem perder o histórico associado.

Critérios de aceite:
- Dado que edito o nome de uma categoria, quando salvo, então todas as transações e orçamentos que já usavam essa categoria continuam associados a ela, apenas exibindo o novo nome.
- Dado que movo uma categoria para outro grupo, então ela some do grupo antigo e passa a ser exibida no novo grupo, mantendo o histórico de lançamentos.

### US2.4 — Excluir categoria
Como usuário, eu quero excluir uma categoria que não uso mais, sem perder os lançamentos históricos.

Critérios de aceite:
- Dado que tento excluir uma categoria com transações vinculadas, então o sistema alerta quantas transações serão afetadas e oferece a opção de reclassificá-las para "Sem Categoria" ou para outra categoria escolhida, antes de concluir a exclusão.
- Dado que a categoria está associada a algum orçamento ativo, quando excluída, então também é removida da grade de orçamento correspondente.

### US2.5 — Categorização automática por regras
Como usuário, eu quero cadastrar palavras-chave associadas a uma categoria para que novas transações com descrições semelhantes sejam categorizadas automaticamente, economizando tempo.

Critérios de aceite:
- Dado que edito as regras de uma categoria, então posso adicionar uma ou mais palavras-chave (tags) e remover palavras-chave existentes individualmente.
- Dado que cadastro uma nova transação cuja descrição contém uma palavra-chave já associada a uma categoria, então o sistema pré-seleciona automaticamente essa categoria no formulário (podendo ser sobrescrita manualmente pelo usuário antes de salvar).
- Dado que a mesma palavra-chave está associada a duas categorias diferentes (conflito), então o sistema deve priorizar de forma determinística (ex.: correspondência mais específica) e permitir que o usuário corrija manualmente.

### US2.6 — Alterar categoria em lote
Como usuário, eu quero selecionar várias transações ao mesmo tempo e alterar a categoria de todas de uma vez, para corrigir categorizações erradas rapidamente.

Critérios de aceite:
- Dado que seleciono duas ou mais transações via checkbox, então o controle "Alterar categoria" fica habilitado.
- Dado que escolho uma categoria e confirmo, então todas as transações selecionadas são atualizadas para a categoria escolhida em uma única ação, e a mudança é refletida imediatamente no orçamento do mês.

---

## Épico 3 — Transações

### US3.1 — Listar transações do mês agrupadas por dia
Como usuário, eu quero ver minhas transações organizadas por dia dentro do mês, com o saldo acumulado ao final de cada dia, para acompanhar a evolução do meu saldo.

Critérios de aceite:
- Dado que acesso a tela de Transações, então vejo as transações do mês corrente agrupadas por data (mais antiga para mais recente), cada grupo mostrando descrição, categoria, conta e valor (negativo em vermelho para despesas, positivo para receitas).
- Dado que um dia possui uma ou mais transações, então ao final do grupo do dia é exibido o "saldo do dia" (saldo anterior acumulado ± transações do dia).
- Dado que não há transações em um dia, então esse dia não gera um grupo vazio na lista.

### US3.2 — Navegar entre meses
Como usuário, eu quero navegar para o mês anterior ou seguinte para consultar meu histórico ou planejar o futuro.

Critérios de aceite:
- Dado que clico na seta "anterior" ou "próximo" ao lado do seletor de mês, então a lista de transações e o saldo são recarregados para o mês selecionado.
- Dado que troco de mês, então o "saldo anterior" exibido é o saldo consolidado ao final do último dia do mês imediatamente anterior.

### US3.3 — Adicionar transação rápida
Como usuário, eu quero lançar uma nova transação rapidamente informando tipo, data, descrição, categoria, conta e valor, sem sair da tela de listagem.

Critérios de aceite:
- Dado que clico em "Adicionar transação", então um formulário inline é aberto no topo (ou na posição da data escolhida) com os campos: tipo (Despesa/Receita/Transferência, default Despesa), data (default dia atual), descrição, categoria (com autocomplete e sugestões), conta e valor.
- Dado que preencho os campos obrigatórios (data, conta, valor) e salvo, então a transação aparece imediatamente na listagem, no grupo do dia correspondente, e os saldos são recalculados.
- Dado que não informo uma categoria, então a transação é salva como "Sem Categoria".
- Dado que clico em Cancelar ou pressiono Esc, então nenhuma transação é criada.

### US3.4 — Detalhes adicionais da transação (lembrete e nota)
Como usuário, eu quero adicionar uma nota livre e configurar um lembrete por e-mail em uma transação, para não esquecer de pagamentos futuros ou registrar observações.

Critérios de aceite:
- Dado que abro "mais opções" no formulário de transação, então vejo um campo de texto livre "Nota" e uma opção de lembrete por e-mail com opções de antecedência (ex.: nenhum, no dia, 1 dia antes, etc.).
- Dado que configuro um lembrete e salvo a transação com data futura, então um e-mail de lembrete é agendado para ser enviado antes da data da transação, conforme a antecedência escolhida.

### US3.5 — Transação recorrente e parcelada
Como usuário, eu quero lançar uma transação parcelada (ex.: compra em 12x) ou recorrente (ex.: assinatura mensal) de uma só vez, em vez de cadastrar cada ocorrência manualmente.

Critérios de aceite:
- Dado que seleciono "Parcelamento (Mensal)", então informo em qual parcela iniciar, o total de parcelas e o valor total (ou valor por parcela), e o sistema calcula e cria uma transação por mês, uma para cada parcela, mantendo a mesma descrição com indicação da parcela (ex.: "Compra (3/12)").
- Dado que seleciono o modo "Avançado", então posso definir a frequência (repetir a cada N dia/semana/mês/ano), se a repetição é indefinida ou tem número fixo de ocorrências, e a partir de qual ocorrência começar.
- Dado que configuro uma repetição, então o sistema avisa que a transação deixará de poder ser consolidada individualmente como lançamento único, sendo necessário editar apenas aquela ocorrência específica caso deseje uma exceção.
- Dado que edito "apenas esta ocorrência" de uma transação recorrente, então as demais ocorrências passadas e futuras não são alteradas.
- Dado que edito "esta e as futuras ocorrências", então apenas as ocorrências a partir da data editada são alteradas, preservando o histórico passado.

### US3.6 — Editar transação existente
Como usuário, eu quero clicar em uma transação já lançada para corrigir dados como valor, categoria, conta ou descrição.

Critérios de aceite:
- Dado que clico sobre uma linha de transação, então o mesmo formulário de criação é aberto inline, pré-preenchido com os dados atuais daquela transação.
- Dado que altero um valor e salvo, então o saldo do dia e os saldos subsequentes são recalculados automaticamente.

### US3.7 — Excluir transações
Como usuário, eu quero excluir uma ou mais transações lançadas incorretamente.

Critérios de aceite:
- Dado que nenhuma transação está selecionada, quando clico no botão de excluir, então o sistema exibe uma mensagem pedindo para selecionar ao menos uma transação.
- Dado que seleciono uma ou mais transações e confirmo a exclusão, então elas são removidas da listagem e os saldos são recalculados.
- Dado que a exclusão é permanente, então o sistema deve pedir confirmação explícita antes de executar.

### US3.8 — Consolidar (conciliar) transações
Como usuário, eu quero marcar uma transação como "consolidada" (conferida no extrato do banco) para diferenciar o que já é fato do que ainda é previsão.

Critérios de aceite:
- Dado que seleciono uma ou mais transações não consolidadas, quando clico em "consolidar", então o status delas muda para consolidado e o ícone de check é atualizado visualmente.
- Dado que quero reverter, quando seleciono transações consolidadas e clico em "desmarcar consolidação", então elas voltam ao status pendente.
- Dado que uma transação está com data passada e ainda não foi consolidada, então ela aparece na lista "Anteriores não consolidadas" da tela inicial.
- Dado que uma transação tem data futura e ainda não foi consolidada, então ela aparece na lista "Próximas não consolidadas" da tela inicial.

### US3.9 — Filtrar transações por status, conta, categoria e texto
Como usuário, eu quero filtrar minhas transações por diferentes critérios para encontrar rapidamente o que procuro.

Critérios de aceite:
- Dado que seleciono o filtro "Transações consolidadas" ou "Transações não consolidadas", então a lista exibe apenas transações com aquele status.
- Dado que desmarco uma ou mais contas no painel lateral, então apenas transações das contas marcadas são exibidas.
- Dado que digito um texto na "Busca rápida" e clico em Buscar, então apenas transações cuja descrição contém o texto pesquisado são exibidas.
- Dado que aplico múltiplos filtros ao mesmo tempo (conta + status + categoria), então todos são combinados com operador "E" (interseção).

### US3.10 — Exportar transações
Como usuário, eu quero exportar minhas transações filtradas em PDF ou XLS para guardar um relatório ou compartilhar com minha esposa.

Critérios de aceite:
- Dado que clico em "Exportar", então posso escolher período (data inicial e final), formato do arquivo (PDF ou XLS), orientação da folha (retrato ou paisagem, aplicável ao PDF) e se deseja imprimir os filtros ativos no cabeçalho do relatório.
- Dado que confirmo a exportação, então um arquivo é gerado somente com as transações que atendem aos filtros e ao período selecionados.
- Nota de implementação: toda ação de download deve pedir confirmação explícita do usuário antes de ser executada.

### US3.11 — Painel resumo na tela inicial
Como usuário, eu quero ver um resumo rápido do mês ao entrar no sistema, sem precisar navegar até Transações.

Critérios de aceite:
- Dado que acesso a tela inicial, então vejo o saldo anterior, total de entradas, total de saídas e saldo final do mês corrente, com opção de incluir ou não o saldo anterior no cálculo exibido.
- Dado que existem transações passadas não consolidadas, então elas aparecem em destaque na lista "Anteriores não consolidadas", com atalho para editar rapidamente cada uma.
- Dado que existem transações futuras não consolidadas, então elas aparecem na lista "Próximas não consolidadas".
- Dado que acesso o gráfico de despesas por categoria, então vejo a distribuição percentual dos gastos do mês corrente em um gráfico do tipo pizza/rosca.

---

## Épico 4 — Orçamento

### US4.1 — Criar orçamento anual
Como usuário, eu quero criar um orçamento para um ano específico para planejar meus gastos com antecedência.

Critérios de aceite:
- Dado que clico em "Novo orçamento", então posso escolher o ano para o qual o orçamento será criado (não pode haver dois orçamentos ativos para o mesmo ano).
- Dado que crio o orçamento, então ele passa a aparecer na lista de orçamentos disponíveis, podendo ser selecionado para visualização/edição.

### US4.2 — Definir valor previsto por categoria
Como usuário, eu quero definir quanto pretendo gastar em cada categoria por mês, podendo repetir o mesmo valor todo mês ou personalizar mês a mês.

Critérios de aceite:
- Dado que adiciono uma categoria ao orçamento, então posso escolher entre "aplicar o valor a todos os meses" (um único valor replicado para os 12 meses) ou "aplicar um valor específico para cada mês" (12 campos editáveis, um por mês).
- Dado que salvo os valores previstos, então a tabela de orçamento passa a exibir a coluna "Previsto" atualizada para a categoria e mês correspondentes.
- Dado que removo uma categoria do orçamento (sem excluir a categoria em si), então ela deixa de ser exibida na grade de orçamento, mas continua disponível normalmente em Transações.

### US4.3 — Visualizar realizado x previsto
Como usuário, eu quero comparar visualmente quanto já gastei em relação ao que planejei, por categoria e no total do mês.

Critérios de aceite:
- Dado que acesso a tela de Orçamento de um mês, então vejo um gráfico de linha comparando o valor "Realizado" acumulado dia a dia versus o valor "Previsto" total do mês.
- Dado que acesso a tabela por categoria, então cada linha mostra uma barra com o valor Realizado sobreposta a uma barra de fundo representando o Previsto, e a barra fica destacada em vermelho quando o Realizado ultrapassa o Previsto daquela categoria.
- Dado que as categorias estão agrupadas por grupo (ex.: Alimentação, Moradia), então a tabela exibe subtotais visuais por grupo.

### US4.4 — Navegar entre meses do orçamento
Como usuário, eu quero alternar entre os meses do ano do orçamento selecionado para revisar meses passados ou planejar meses futuros.

Critérios de aceite:
- Dado que uso as setas de navegação de mês na tela de Orçamento, então os valores de Realizado e Previsto exibidos são recalculados para o mês selecionado, dentro do ano do orçamento ativo.

### US4.5 — Excluir orçamento de um ano
Como usuário, eu quero excluir um orçamento anual que não uso mais.

Critérios de aceite:
- Dado que aciono "Excluir" em um ano de orçamento, então o sistema pede confirmação antes de remover permanentemente todas as metas previstas daquele ano (sem afetar as transações reais já lançadas).

### US4.6 — Compartilhar conta/orçamento com o cônjuge (Convites)
Como usuário, eu quero convidar minha esposa/meu marido para acessar e colaborar na mesma base financeira, para gerenciarmos as finanças da família juntos.

Critérios de aceite:
- Dado que informo o e-mail de um convidado e clico em "Enviar convite", então um convite é enviado para esse e-mail com um link de aceite.
- Dado que o convidado aceita o convite, então ele passa a ter acesso às contas, transações, categorias e orçamentos compartilhados. (Decisão do produto: sem níveis de permissão — todos os membros podem tudo.)
- Dado que o convite ainda não foi aceito, então ele aparece como "pendente" para quem convidou, com opção de reenviar ou cancelar o convite.
- Nota de segurança: qualquer fluxo de convite/compartilhamento de acesso deve exigir confirmação explícita do usuário antes de ser efetivado, e nunca deve ser processado automaticamente a partir de links ou instruções recebidas por e-mail sem revisão do usuário.

---

## Observações para a implementação com Claude Code

Modelo de dados inicial sugerido:

- Usuario (com vínculo N:N a um "Espaço financeiro" compartilhado, para suportar o caso do casal)
- Conta (nome, saldo inicial, ativo, espaço financeiro)
- GrupoCategoria e Categoria (nome, grupo, tipo receita/despesa)
- RegraCategorizacao (categoria, lista de palavras-chave)
- Transacao (tipo despesa/receita/transferência, data, descrição, valor, conta, categoria, consolidado, nota, lembrete, id de série de recorrência/parcelamento quando aplicável)
- OrcamentoAnual e OrcamentoCategoriaMes (ano, categoria, mês, valor previsto)

Ordem de implementação sugerida: Transações e Contas primeiro (base de tudo), depois Categorias com regras, e por último Orçamento, que depende dos três anteriores para calcular o "Realizado".
