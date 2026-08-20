# Plano de Implementação — "Septet"

> Companheiro operacional de `plano-modelo-jogo-septet.md` (modelo de jogo) e
> `spec-motor-septet.md` (motor). Referências `[M x.y]` apontam para o plano do
> modelo; `[E x.y]` para a spec do motor.
>
> Este documento responde a *como e por que ordem se constrói*. Não redefine
> regras nem decisões — quando houver conflito, os outros dois documentos ganham.

---

## 0. Enquadramento

**Repositório:** `seven-dice` (monorepo, estrutura de `[E 1.3]`).
**Stack:** TypeScript em toda a linha. Node ≥ 20, pnpm workspaces.
**Documentação:** versionada no próprio repo, em `documentation/`, para que
qualquer máquina que clone tenha as specs — e não só esta.
**Estado corrente:** `estado-atual.md` — onde estamos, o que está por decidir, e
as quatro conclusões medidas que contrariam os documentos de origem.

### 0.1 A tese que este plano protege

Toda a arquitetura existe para garantir **uma** propriedade: *nenhum nível
publicado é impossível*. Essa garantia vem de duas coisas e mais nenhuma:

1. A construção reversa validada por simulação direta `[E 6.3]`.
2. O teste de ida-e-volta sobre milhares de tabuleiros `[E 9.3]`.

Por isso a ordem das fases não é negociável até à Fase 4. Tudo antes existe para
tornar a Fase 4 verificável; tudo depois assume-a provada.

### 0.2 Marcos

| Marco | Fase | Significado |
|---|---|---|
| **M1 — Regras corretas** | 3 | O motor sabe jogar e sabe responder "tem solução?" |
| **M2 — Garantia provada** | 4 | Os níveis são sempre resolúveis. *A ideia está provada.* |
| **M3 — Dificuldade medível** | 5 | Existe um corpus classificado por bandas |
| **M4 — Mecânica validada** | 6 | Playtest de consola responde ao risco nº 1 `[M 8]` |
| **M5 — Jogável** | 8 | Build web com os dois modos |
| **M6 — Empacotado** | 9 | iOS + Android |

**M2 é o marco real.** Se a Fase 4 não fechar, nada do resto vale a pena
construir. **M4 é o gate de design:** se o colapso de colunas se revelar
impossível de antecipar mentalmente, reconsidera-se a mecânica *antes* de existir
uma linha de UI.

### 0.3 Esforço relativo

`S` ≈ meio dia · `M` ≈ 1–2 dias · `L` ≈ 3–5 dias · `XL` ≈ mais de uma semana.
São ordens de grandeza para sequenciar, não compromissos.

---

## Fase 0 — Andaime · `S` · ✅ **CONCLUÍDA**

Sem esta fase, as regras de higiene do projeto (determinismo, pureza da engine)
ficam dependentes de disciplina em vez de ferramenta.

### Entregáveis

```
seven-dice/
  package.json            scripts: lint · typecheck · test · check
  pnpm-workspace.yaml     packages/* + allowBuilds: esbuild
  tsconfig.base.json      strict, noUncheckedIndexedAccess, noEmit
  tsconfig.json           raiz: test/ e vitest.config.ts
  vitest.config.ts
  eslint.config.js        regras de pureza da engine
  .gitignore
  .github/workflows/ci.yml
  CLAUDE.md
  test/hygiene.test.ts    invariantes que lint e compilador não exprimem
  packages/engine/        tsconfig sem DOM e sem @types/node
  packages/tools/
  packages/game/
```

### Toolchain efetivo

Node 24 · pnpm 11 · TypeScript 5.9 · Vitest 3 · ESLint 9 (flat config) ·
typescript-eslint 8 · fast-check 4.

Duas notas de instalação: `corepack enable` falha sem admin nesta máquina, pelo
que o pnpm foi instalado por `npm install -g pnpm`; e o pnpm 11 renomeou
`onlyBuiltDependencies` para `allowBuilds`, necessário para o esbuild.

### Decisões tomadas na execução

- **Sem passo de build no monorepo.** Cada pacote expõe `"exports": "./src/index.ts"`
  e os consumidores importam código-fonte; o bundler e o Vitest tratam do TS. O
  `tsc` corre só com `--noEmit`, para verificação de tipos. Menos uma camada onde
  gerador e jogo poderiam divergir.
- **Todo o tooling na raiz, nenhum por pacote.** Versões duplicadas de TypeScript
  ou Vitest entre `engine` e `tools` seriam exatamente o tipo de divergência que
  `[E 1.2]` existe para impedir. O `hygiene.test.ts` verifica-o.

### Requisitos não óbvios

- **`noUncheckedIndexedAccess: true`.** Numa representação por listas de
  comprimento variável `[E 2.1]`, `board[c][r]` é legitimamente `undefined` fora
  da silhueta. Deixar o compilador exigir a verificação é o que impede a classe
  de bugs que a representação foi escolhida para evitar.
- **Pureza da engine imposta em duas camadas independentes.** O `tsconfig` da
  engine tem `lib: ["ES2022"]` (sem DOM) e `types: []` (sem `@types/node`), o que
  torna `document`, `window` e `process` **invisíveis ao compilador** — mais forte
  que lint, porque não se silencia com um comentário. O lint duplica a proibição
  para dar a mensagem certa em vez de um "Cannot find name", e acrescenta o que o
  compilador não vê: `Math.random()`, incluindo as formas `Math["random"]` e
  `const { random } = Math`.
- `packages/engine/package.json` sem `dependencies`. Não é estética: é a
  propriedade que permite correr exatamente a mesma engine no browser, em Node e
  nos workers — e é daí que vem a impossibilidade de divergência `[E 1.2]`.

### Critério de aceitação — verificado

`pnpm check` (lint + typecheck + test) verde, 3 testes de higiene a passar.

Um ficheiro de violação escrito à mão em `packages/engine/src` produziu **10
erros de lint** — `Math.random()` nas três formas, `node:fs`, `path`, `process`,
`document`, `crypto` — e **5 erros de compilação** independentes. Os mesmos
construtos em `packages/tools` e `packages/game` passam sem erro: as regras
restringem a engine, não o repo.

---

## Fase 1 — Tabuleiro, adjacência e jogada · `M` · ✅ **CONCLUÍDA**

> Prova: **as regras estão certas.** `[E 10, fase 1]`
>
> Branch `fase-1-tabuleiro-e-jogada`. 64 testes, `pnpm check` verde.

### Entregáveis

| Ficheiro | Conteúdo |
|---|---|
| `engine/src/types.ts` | `Cell`, `Column`, `Board`, `Group`, `packed`/`colOf`/`rowOf`, `toGroup` `[E 2.1, 2.5]` |
| `engine/src/board.ts` | `width`, `height`, `cellAt`, `neighbours`, `totalSum`, `pieceCount`, `jokerAt`, `boardKey`, `checkInvariants` |
| `engine/src/groups.ts` | `isValidGroup`, `isConnected`, `groupSum`, `groupJokerValue` `[E 3.1]` |
| `engine/src/moves.ts` | `applyMove`, `InvalidMoveError` `[E 4.1]` |
| `engine/test/support/reference.ts` | Enumeração por força bruta — oráculo da fase 2 |
| `engine/test/support/arbitraries.ts` | Arbitrários fast-check de tabuleiro e de jogada |
| `engine/test/moves.example.test.ts` | Os casos de `[E 9.1]` |
| `engine/test/board.test.ts` · `groups.validity.test.ts` · `moves.properties.test.ts` | |

### Desvio ao plano original

`isValidGroup` estava atribuída à fase 2, mas `applyMove` tem de validar o grupo
`[E 4.1, passo 1]` e não podia esperar. A divisão que ficou é mais limpa do que a
prevista: `[E 3.1]` (*validade* — este conjunto é uma jogada legal?) fica na fase
1, e `[E 3.2]` (*enumeração* — quais são todas as jogadas?) fica na fase 2.
`isConnected` é exportada desde já porque o gerador precisa dela em `[E 6.3]`.

### Decisões tomadas na execução

- **`isValidGroup` exige forma canónica.** Um grupo fora de ordem ou com células
  repetidas é rejeitado, em vez de normalizado em silêncio. A ordenação passa a
  ser uma propriedade real e não uma convenção, o que é o que permite comparar e
  desduplicar sem esforço `[E 3.3]`. A UI normaliza a ordem de toque com
  `toGroup` antes de chamar — a normalização vive na fronteira, não no motor.
- **Rejeitar grupos com dois jokers.** Não pode acontecer num tabuleiro canónico,
  mas o valor do joker deixaria de estar determinado `[M 2.6]` e a ambiguidade
  não pode entrar por aqui.
- **Anotar `: Board` em todos os literais de teste.** O Vitest não faz typecheck,
  portanto sem anotação os literais inferem `number[][]` e passariam valores fora
  de `Cell` sem ninguém dar por isso. O `tsc` apanhou-o.

### Notas de implementação

- `neighbours(b, p)` implementa literalmente as quatro condições de `[E 2.4]`,
  **incluindo a condição de altura na vizinhança lateral** — é ela que faz as
  silhuetas funcionarem, e é o ponto exato onde uma implementação distraída passa
  em todos os testes de retângulo e falha em pirâmides. Teste dedicado.
- `applyMove` copia apenas as colunas afetadas e partilha as restantes por
  referência `[E 4.1]`. Uma jogada toca em 1–4 colunas: o custo é proporcional ao
  grupo, não ao tabuleiro.
- `checkInvariants` é função de teste/debug, fora do caminho quente. Verifica as
  três invariantes de `[E 2.2]`.
- **Cascatas não eliminam automaticamente** `[E 4.3]`. `applyMove` faz uma jogada
  e devolve. Combos pertencem à `GameSession` (Fase 7).

### Testes

Os exemplos de `[E 9.1]` escrevem-se como literais JSON legíveis — o `Board` *é*
JSON `[E 2.1]` — e servem de documentação executável. Além deles, as quatro
pós-condições de `[E 4.2]` como testes de propriedade, em particular **"a ordem
relativa das peças não removidas é preservada"**, que é a propriedade de que toda
a Fase 4 depende.

### Critério de aceitação — verificado

Os exemplos passam; as 4 pós-condições passam com `fast-check`; a silhueta tem
teste próprio.

Como 64 testes verdes à primeira não provam nada sobre se os testes *mordem*,
correram-se quatro mutações deliberadas na engine. Todas foram apanhadas, e pelos
testes certos:

| Mutação | Apanhada por |
|---|---|
| Adjacência lateral sem a condição de altura | os 2 testes de silhueta |
| Gravidade que reordena as peças restantes | *a ordem relativa é preservada* |
| Colapso de colunas desligado | 11 testes, exemplos e propriedades |
| Joker sem fronteira inferior (grupo sozinho) | os 2 testes de joker sozinho |

A segunda é a que interessa: falhou **exatamente um** teste, o da pós-condição de
que depende toda a construção reversa `[E 4.2]`. Sem ele, uma gravidade que
reordenasse peças passaria despercebida até a fase 4 produzir níveis impossíveis.

---

## Fase 2 — Deteção de grupos · `M` · ✅ **CONCLUÍDA**

> Prova: **a deteção é completa e sem duplicados.** `[E 10, fase 2]`
>
> Branch `fase-2-deteccao-de-grupos`. 82 testes, `pnpm check` verde.

### Entregáveis

`engine/src/groups.ts` — `findAllGroups` (generator) e `hasAnyGroup`, a juntar à
validade da fase 1. `engine/test/groups.enumeration.test.ts`.

### Decisões tomadas na execução

- **Duas estruturas, não uma.** A enumeração por célula mínima precisa de `ext`
  (por onde o grupo ainda pode crescer, passando adiante só o que vem *depois* da
  célula escolhida) **e** de `proibidas` (`grupo ∪ vizinhança(grupo)`). A segunda
  é fácil de omitir e o efeito é subtil: sem ela um triângulo de adjacências
  produz o mesmo grupo duas vezes, o que num tabuleiro retangular quase não se
  nota e corrompe silenciosamente o branching factor `[M 5.2]`.
- **`hasAnyGroup` tem mesmo implementação própria** `[E 3.3]`, e a justificação
  acabou por ser mais forte do que "evitar o generator": percorrendo a mesma
  árvore só para responder *existe?*, não constrói nem ordena grupo nenhum, e
  evita a delegação `yield*`, cujo custo é proporcional à profundidade a cada
  emissão. A duplicação de estrutura está guardada por um teste de equivalência
  com `findAllGroups`.
- **A poda é uma só condição.** `fixas >= 7` corta os dois casos: sem joker
  passaria de 7, com joker violaria `fixas <= 6`. É também de onde vem o limite
  de 7 células, sem precisar de o impor.

### Notas de implementação

- Enumeração **por célula mínima** `[E 3.2]`. A abordagem ingénua (DFS a partir
  de cada célula) emite o mesmo grupo uma vez por ordem de visita; a diferença
  não é de performance, é de correção — duplicados corrompem o branching factor
  `[M 5.2]` e inflacionam a contagem de estados `[M 5.3]`.
- `findAllGroups` é **generator**: quase todos os consumidores param cedo
  `[E 3.3]`.
- `hasAnyGroup` tem implementação própria com saída imediata. É o caminho mais
  quente do pipeline inteiro — chamado a cada passo de cada playout.
- `Group` é `readonly number[]` **ordenado** `[E 3.3]`. A ordenação canónica é o
  que permite comparar e desduplicar sem esforço.
- Joker conta como 0 na soma; um ramo que o contenha continua até a soma fixa
  chegar a 6 `[E 3.2]`. Joker sozinho é inválido `[M 2.6]`.
- **Não reutilizar buffers nesta fase** `[E 3.4]`. Arrays novos por expansão. A
  otimização entra só se o profiler da Fase 5 acusar pressão de GC — o código com
  buffers é bastante mais difícil de manter correto, e a correção aqui é a
  garantia central do projeto.

### Testes

Os quatro primeiros testes de propriedade de `[E 9.2]`, mais:

- **Paridade contra implementação de referência ingénua** (força bruta sobre
  todos os subconjuntos, filtrando por conexão e soma) em tabuleiros ≤ 3x3.
  Lenta, mas é a única forma honesta de provar completude.
- Nenhum grupo excede 7 células.

### Critério de aceitação — verificado

Paridade total com a implementação de referência sobre 600 tabuleiros gerados
(300 sem joker, 300 com), zero duplicados, zero grupos inválidos, nenhum grupo
acima de 7 células.

Cinco mutações deliberadas, todas apanhadas:

| Mutação | Apanhada por |
|---|---|
| Sem a guarda `proibidas` | 8 testes, incluindo *não devolve duplicados* |
| Extensão inteira em vez de "só o que vem depois" | 10 testes |
| Sem o filtro `u > raiz` | paridade + duplicados |
| Poda a cortar em 6 em vez de 7 | paridade + *grupo de 7 peças* |
| `hasAnyGroup` a não descer na árvore | *concorda com findAllGroups* |

Há também uma rede contra regressões exponenciais: um 6x6 denso de 1s e 2s tem de
enumerar em menos de 200 ms — três ordens de grandeza acima do que `[E 3.2]`
estima, portanto não mede velocidade, só apanha uma explosão.

---

## Fase 3 — Solver · `M` · **M1** · ✅ **CONCLUÍDA**

> Prova: **dá para responder "tem solução?"** `[E 10, fase 3]`
>
> Branch `fase-3-solver`. 110 testes, `pnpm check` verde.

### Entregáveis

`engine/src/solver.ts` — `isSolvable`, `findSolution`, `isGreedySafe`, tipos
`Verdict` e `Limits`. `engine/test/solver.test.ts`.

### Conflito resolvido na spec: o orçamento de tempo

`[E 5.2]` exige "número máximo de estados visitados **e** orçamento de tempo".
`[E 1.1]` diz que a engine não tem relógio. E há um problema maior do que a
contradição literal: **um limite de tempo torna o veredicto dependente da
máquina.** Um candidato aceite no portátil rápido seria descartado no lento, e a
mesma seed deixaria de produzir o mesmo nível — que é exatamente a propriedade
que `[E 7.1]` existe para garantir, e de que dependem o puzzle diário e os
leaderboards.

Resolução: `maxStates` é obrigatório e **determinístico**; o orçamento de tempo é
opcional e vem **em par com o relógio injetado**, de modo que não se pode pedir
sem o fornecer. O pipeline offline não o usa. É para consumidores interativos —
uma dica pedida a meio de um nível — onde um teto de latência vale mais do que a
reprodutibilidade.

### Decisões tomadas na execução

- **`isGreedySafe` é iterativo, os outros dois recursivos.** Não é gosto: a
  pesquisa de solução é profunda e limitada a `peças/2 ≈ 25` `[E 5.2]`, enquanto
  o grafo de estados alcançáveis é largo. Uma pilha explícita evita depender do
  stack para uma travessia cuja forma não se controla.
- **O relógio consulta-se a cada 1024 estados.** Consultá-lo a cada estado
  custaria mais do que o problema que resolve.

### Notas de implementação

- DFS com memoização de **estados falhados** `[E 5.2]`. A memoização não é
  otimização — é o que torna o solver viável, porque jogadas independentes
  comutam e o mesmo estado chega por muitos caminhos `[M 5.3]`.
- `boardKey` diretamente como chave: o tabuleiro está sempre em forma canónica
  `[E 2.6]`. **Não aplicar redução por simetria** — um tabuleiro espelhado é um
  estado distinto e a redução falsearia a contagem de estados.
- Recursão direta é segura: profundidade máxima ≈ peças/2 ≈ 25 `[E 5.2]`. Não é
  preciso versão iterativa.
- `Verdict` de três valores, não `boolean`. `Limits` (estados máximos + orçamento
  de tempo) é **obrigatório**, não opcional-na-prática: o gerador chama isto
  milhares de vezes e um caso patológico não pode parar o pipeline. Limite
  excedido → `"inconclusive"` → candidato descartado.
- `findSolution` experimenta grupos maiores primeiro `[E 5.4]`. `isGreedySafe`
  ignora a ordem — tem de visitar tudo.

### Testes

- Tabuleiros resolúveis conhecidos → `"yes"`; bloqueados → `"no"`.
- Limites artificialmente baixos → `"inconclusive"`, nunca exceção, nunca
  estouro de tempo.
- `findSolution` devolve uma sequência que, aplicada, esvazia o tabuleiro.
- "Um tabuleiro greedy-safe nunca bloqueia em 10 000 playouts" `[E 9.2]` fica em
  `skip` com referência explícita — fecha na Fase 5, quando existirem playouts.

### Critério de aceitação — verificado

O tabuleiro-âncora dos testes é `[[1,2,4],[6,5,3]]`, que é o jogo inteiro em seis
peças: as faces 1 a 6, soma 21, cuja única partição é `{1,6}`, `{2,5}`, `{3,4}` —
os três pares horizontais. Mas a coluna da esquerda, `1+2+4`, também soma 7 e é
conexa; quem a jogar fica com `{6,5,3}`, soma 14 e sem nenhum subconjunto a somar
7. **É solúvel mas não greedy-safe** — a distinção que separa os corpora dos dois
modos `[M 6.1]`, num exemplo que cabe num comentário.

Cinco mutações, quatro apanhadas:

| Mutação | Apanhada por |
|---|---|
| `isGreedySafe` ignora o beco sem saída | 4 testes |
| `isGreedySafe` só segue um sucessor | *nunca bloqueia, escolha-se o que escolher* |
| `esgotado` confunde-se com `no` | os 2 testes de limites |
| `findSolution` sem backtracking | 6 testes |
| **Memoizar estados abortados por limite** | **nenhum — ver abaixo** |

A quinta não é um teste fraco, é uma garantia que não existe: depois de
`esgotado`, nenhum veredicto pode ser `"no"`, portanto uma entrada a mais no memo
não muda resposta nenhuma enquanto o memo viver só durante a chamada. A linha
fica na mesma, agora com um comentário que diz exatamente isso — porque partilhar
o memo entre chamadas é a otimização óbvia a tentar na fase 5, e é aí que passa a
ser uma garantia a sério.

### Nota sobre a qualidade dos testes de propriedade

`arbBoard` cru quase não exercitava o solver: em 200 tabuleiros, 178 eram
insolúveis (a soma tem 1/7 de hipóteses de ser múltipla de 7) e **nenhum** era
solúvel-mas-não-seguro, que é o caso interessante. Acrescentou-se
`arbBoardSomavel`, condicionado à soma:

| Arbitrário | greedy-safe | solúvel mas não | insolúvel |
|---|---|---|---|
| `arbBoard` | 22 | **0** | 178 |
| `arbBoardSomavel` | 159 | **8** | 33 |

Os testes que dependem de uma condição passaram a **contar quantas vezes ela se
verificou e a falhar se for zero**. Uma propriedade vacuamente verdadeira é pior
do que nenhuma, porque parece cobertura.

---

## Fase 4 — Gerador · `L` · **M2 · MARCO REAL** · ✅ **CONCLUÍDA**

> Prova: **os níveis são sempre resolúveis.** `[E 10, fase 4]`
>
> Branch `fase-4-gerador`. 132 testes, `pnpm check` verde.

É a fase que justifica todas as anteriores. A partir daqui a ideia está provada;
tudo o resto é construção.

### A decisão que fez a fase: células marcadas

Inserir desloca o que já lá estava — dentro de uma coluna empurra para cima, uma
coluna nova empurra as outras para a direita. Manter coordenadas atualizadas ao
longo de várias inserções é exatamente a contabilidade que produz o erro que
`[E 6.3]` existe para apanhar.

A construção faz-se por isso sobre um tabuleiro de células **marcadas** — cada
célula sabe se foi inserida neste passo — e as coordenadas do grupo derivam-se no
fim, varrendo o resultado. Os deslocamentos passam a ser tratados pelo `splice`,
e não há coordenadas para manter. A posição do joker segue a mesma regra: só se
sabe no fim, porque os passos seguintes o empurraram.

### Defeito encontrado e corrigido: alcançabilidade

A primeira versão filtrava as composições por "cabe no que falta" e "não deixa
exatamente 1 peça". Não chega. Com só composições de 5+ peças e um alvo de 30, a
sequência 7+7+7+7 deixa 2 peças por colocar e nenhuma composição cabe — e recuar
não resolve de forma fiável, porque a escolha seguinte volta a ser aleatória.

É o problema da moeda. Resolve-se uma vez por chamada com programação dinâmica
sobre os tamanhos disponíveis, e depois consulta-se em tempo constante. Um alvo
inatingível passa a falhar de imediato em vez de gastar reinícios a descobri-lo.

Depois da correção: **zero recuos, zero reinícios, zero falhas** em 3500 gerações
por sete perfis.

### Entregáveis

| Ficheiro | Conteúdo |
|---|---|
| `engine/src/rng.ts` | `mulberry32`, tipo `Rng` `[E 7.1]` |
| `engine/src/generator.ts` | `generate(seed, params)`, inserção, validação |
| `engine/src/level.ts` | Tipo `Level` `[E 8]` |
| `engine/test/generator.roundtrip.test.ts` | Ida-e-volta `[E 9.3]` |

### Notas de implementação

- Construção reversa `[E 6.1]`: parte de vazio, insere grupos, e **a ordem
  inversa dos passos é a solução**. Nunca é preciso perguntar se o tabuleiro tem
  solução.
- Inserção `[E 6.2]`: dentro de coluna (empurra para cima o que está acima) ou
  coluna nova (desloca à direita). Um mesmo grupo pode combinar as duas.
- **A validação de `[E 6.3]` não se salta em circunstância nenhuma:**

  ```ts
  const simulado = applyMove(candidato, grupoInserido);
  aceitar = boardKey(simulado) === boardKey(board)
         && isConnected(candidato, grupoInserido);
  ```

  Gravidade e colapso não são inversíveis por construção. Inserir "numa posição
  plausível" não chega — só a simulação direta prova a inversão. É desta
  verificação que vem toda a garantia do jogo.
- Backtracking: se nenhuma posição funcionar em N tentativas, recuar um passo; ao
  fim de M recuos, reiniciar com seed derivada. Registar as taxas — backtracking
  frequente significa parâmetros mal calibrados, não azar.
- Joker `[E 6.4]`: no máximo um por tabuleiro; guardar o `trueValue` que a
  composição lhe atribuiu (serve o tutorial e as dicas `[M 2.6]`); colocá-lo num
  passo **tardio** da construção — cedo na solução do jogador — para níveis de
  estrangulamento. **Confirmar com as métricas da Fase 5, não assumir.**
- `Rng` passado por parâmetro, nunca `Math.random()` `[E 7.1]`. Sem isto não há
  seeds determinísticas, puzzle diário `[M 6.4]` nem leaderboards justos.
- Guardar **a seed e o tabuleiro explícito** `[E 8]`: a seed é identidade estável
  e rastreio; o tabuleiro explícito protege contra alterações futuras no gerador
  que mudariam o que a seed produz.

### Testes

O teste mais valioso do projeto `[E 9.2]`:

- **Ida-e-volta:** para cada tabuleiro gerado, aplicar a solução guardada passo a
  passo e confirmar que termina vazio. Barato, e apanha qualquer erro na
  inversão.
- Soma total de qualquer tabuleiro gerado é múltipla de 7 `[M 4.1]`.
- Com joker: `soma das fixas + trueValue ≡ 0 (mod 7)` `[M 2.6]`.
- Determinismo: a mesma seed produz exatamente o mesmo `Level`.

### Critério de aceitação — verificado

**Ida-e-volta a 100%.** 2000 níveis com joker mais 200 por cada um de dez perfis
de parâmetros — pequeno, médio, grande, colunas altas, colunas largas, fundo
enviesado, com joker, só grupos grandes, só pares, pirâmide. Cada solução
aplicada passo a passo, validando cada jogada, terminando em tabuleiro vazio.
Nenhuma falha.

Cinco mutações, quatro apanhadas:

| Mutação | Apanhada por |
|---|---|
| Coluna nova não fica marcada como inserida | 17 testes |
| Solução não invertida | 10 testes |
| `trueValue` do joker guarda 0 | os 2 testes de aritmética do joker |
| Sem a análise de alcançabilidade | *só grupos grandes* |
| **Sem a verificação de ida-e-volta de `[E 6.3]`** | **nenhum** |

### O achado que interessa: a inversão é estrutural

O gerador foi instrumentado para responder a uma pergunta concreta — a
verificação de `[E 6.3]` chega alguma vez a apanhar alguma coisa que
`isValidGroup` já não tivesse apanhado?

**Em 3500 gerações por sete perfis, nunca.** `rejectedRoundTrip` ficou-se por
zero em todos. Quem faz o trabalho é a conexão, que rejeita entre um quarto e
metade das tentativas.

E não é acaso. Com a representação marcada, remover exatamente as células
inseridas devolve a cada coluna a sua sequência original — a gravidade preserva a
ordem `[E 4.2]` — e as colunas novas, feitas só de células inseridas, desaparecem
no colapso. A spec diz que "gravidade e colapso não são inversíveis por
construção"; com esta representação, passam a ser.

Confirmou-se pelo lado avesso: com um bug deliberado na inserção, **300 de 300
gerações falham** em vez de emitirem níveis corrompidos — mas quem as apanha é o
`isValidGroup`, porque um grupo a que falta uma célula deixa de somar 7.

**A verificação fica na mesma**, e não por deferência à spec. O que ela protege
não é o gerador — é `applyMove`. No dia em que as células bloqueadoras entrarem
`[M 3.4]`, a gravidade passa a ter dois casos de paragem, o colapso fica ambíguo,
e a inversão deixa de ser estrutural. O plano diz, por palavras suas, que é aí
que nascem os níveis impossíveis. Custa um `applyMove` por passo aceite e já cá
está nesse dia.

### Discrepâncias no exemplo de `[E 8]`

O exemplo de formato de nível na spec tem duas gralhas, sem consequência para o
código mas a corrigir se o documento for reeditado:

- `"joker": { "at": [3, 3] }` — a coluna 3 do tabuleiro do exemplo é `[4,3,0]`,
  com três células, portanto o joker está na linha 2, não na 3.
- `"solution": [[192, 193], [256, 257]]` — 256 é `packed(4, 0)`, e o tabuleiro do
  exemplo só tem quatro colunas (0 a 3).

A implementação usa `[coluna, linha]` com a linha contada a partir da base, como
todas as coordenadas do motor `[E 2.2]`.

---

## Fase 5 — Métricas e pipeline · `L` · **M3** · ✅ **CONCLUÍDA**

> Prova: **dá para classificar dificuldade.** `[E 10, fase 5]`
>
> Branch `fase-5-metricas-e-pipeline`.

### A questão em aberto de `[E 6.4]`, resolvida

A spec dizia que colocar o joker num passo tardio da construção reversa — cedo
na solução do jogador — "tende a criar dependências mais fortes", e mandava
**confirmar com as métricas, não assumir**. Confirmou-se, e dá o contrário.

Taxa de sobrevivência média, tabuleiros de 24 peças, n=120 por cenário:

| Cenário | Sobrevivência |
|---|---|
| Sem joker | 0.830 |
| `jokerProgress` 0.00 — gasto na última jogada | 0.214 |
| `jokerProgress` 0.30 | **0.196** |
| `jokerProgress` 0.60 | 0.215 |
| `jokerProgress` 0.85 — gasto nas primeiras jogadas | 0.311 |

Replicado em seeds independentes (n=300): 0.30 dá 0.226 ± 0.006, 0.85 dá
0.329 ± 0.017 — cerca de seis erros-padrão, e o dobro do desvio padrão, portanto
também muito menos consistente.

A leitura é intuitiva depois de vista: **o que aperta não é onde o joker nasce, é
quanto tempo tem de sobreviver.** Um joker que tem de ser guardado até tarde
obriga o jogador a acertar durante o tabuleiro inteiro; um gasto nas primeiras
jogadas é uma decisão que se toma e acaba.

O que o plano queria — que a taxa *desça* `[M 8]` — confirma-se com força: 0.83
sem joker contra 0.20 com. **O joker é mesmo um estrangulamento, não uma ajuda.**
Por omissão, `jokerProgress` passa a 0.3.

### A tabela do plano §7 não fecha — e foi a medição que o mostrou

`[M 7]` põe a fase média em 50–70% de sobrevivência **e** manda introduzir aí o
joker. As duas exigências não podem valer no mesmo tabuleiro: um joker leva a
sobrevivência de 0.83 para 0.20.

Quem resolve é o próprio plano, mais abaixo em `[M 7]`: o joker "aparece
esporadicamente — não em todos os tabuleiros", e "os níveis que o incluem são
construídos à volta dele". São portanto **duas bandas, não uma** — o grosso da
fase média sem joker na faixa que a tabela pede, e uma minoria `meio-joker`, mais
apertada, que é o estrangulamento.

É exatamente o que a fase 5 existe para fazer: `[M 5]` diz que a dificuldade se
mede depois, e `[M 7]` avisa que a tabela é "o ponto de partida, não o resultado".

### O achado maior: o piso de justiça e o joker são incompatíveis

`[M 6.2]` exige que **as primeiras 2–3 jogadas sejam seguras qualquer que seja a
escolha**. `[M 2.6]` desenha o joker precisamente para que gastá-lo no grupo
errado mate o tabuleiro sem aviso. As duas coisas não podem valer ao mesmo tempo.

Não é uma questão de grau. Medido sobre 40 níveis com joker: **os 40** tinham uma
jogada fatal logo à primeira, e nos 40 essa jogada envolvia o joker. Sem joker,
só 3 dos 40 tinham qualquer jogada fatal à primeira.

O efeito no pipeline foi total: a banda `meio-joker` aceitou **0 candidatos em
8128**, com 4748 rejeitados pelo piso de justiça.

**Quem desempata é o próprio plano.** A mitigação que `[M 2.6]` dá para "joker mal
usado mata o tabuleiro sem aviso" é *tutorial dedicado, undo ilimitado, nunca
antes da fase média* — e nunca o piso de justiça. O joker é, por desenho, a única
armadilha que o jogo **ensina** em vez de esconder.

O piso ganhou portanto uma opção `skipJokerMoves`, usada só na banda com joker.
Com ela, o piso continua a garantir tudo o resto: qualquer sequência de jogadas
**sem** joker mantém o tabuleiro resolúvel. A banda passou de 0 em 8128 para 8 em
64 — 12.5% de aceitação, em 10 segundos.

### Outro defeito, este só de eficiência

A banda do tutorial só usa pares, portanto só consegue somar contagens **pares** —
e o pipeline pedia-lhe tamanhos entre 10 e 14 sem olhar a isso. Resultado: 82 em
210 candidatos morriam antes de sair da geração. O tamanho passa a ser ajustado
para um que as composições da banda consigam mesmo somar, usando a mesma análise
de alcançabilidade da fase 4, agora exposta pela engine.

### Defeito de desenho encontrado e corrigido: o piso de justiça

A primeira versão chamava `isSolvable` em **todos** os estados visitados até à
profundidade 3. Numa banda de 30 peças isso pôs o pipeline a levar mais de vinte
minutos numa só banda — na prática, a não correr.

Basta correr o solver na **fronteira final**, detetando becos sem saída a cada
nível. Não é atalho: um estado insolúvel acima da fronteira ou não tem sucessores
— e aí é beco, já apanhado — ou tem, e todos são insolúveis também, porque a
insolubilidade herda-se para a frente. Esses estão na fronteira.

O piso ganhou também limites próprios (`LIMITES_PISO`, 20 000 estados):
`DEFAULT_LIMITS` é generoso demais para uma verificação que corre milhares de
vezes, e aqui um `"inconclusive"` custa pouco, porque descartar um candidato
duvidoso é a direção segura.

### Entregáveis

| Ficheiro | Conteúdo |
|---|---|
| `engine/src/metrics.ts` | `measureSurvival`, piso de justiça `[E 7.4]` |
| `tools/src/worker.ts` | Playouts em `worker_threads` |
| `tools/src/pipeline.ts` | gerar → medir → filtrar → exportar `[E 7.5]` |
| `tools/src/bands.ts` | Bandas de `[M 5.1]` e `[M 7]` |
| `tools/src/cli.ts` | `septet generate`, `septet measure`, `septet export` |

### Notas de implementação

- As seis métricas de `[E 7.3]` recolhem-se **num único varrimento de playouts**,
  não em passagens separadas.
- **O paralelismo vive em `tools`, não na engine** `[E 7.2]`. A engine expõe
  `measureSurvival` single-threaded e agnóstica.
- **Seed derivada por playout** (`seed + índice`) `[E 7.2]`. Nunca partilhar
  estado de RNG entre workers — sem isso o resultado passa a depender do
  escalonamento e a medição deixa de ser reproduzível.
- **Piso de justiça** `[E 7.4]`: BFS limitada à profundidade 3, confirmando que
  *todos* os estados a essa profundidade continuam resolúveis. Verificação
  **obrigatória antes de publicar** qualquer nível `[M 6.2]` — um tabuleiro onde
  a jogada 2 pode ser fatal lê-se como adivinha, não como puzzle.
- Corpora **opostos** por modo `[M 6.1]`: puzzle filtra por sobrevivência baixa;
  tempo exige `isGreedySafe === "yes"` e **sem joker** `[M 6.3]`.
- É nesta fase que se corre o profiler, e só aqui se decide sobre buffers
  partilhados `[E 3.4]` — e apenas se houver pressão de GC medida.

### Testes

- Determinismo da medição: mesma seed + mesmo tabuleiro → métricas idênticas com
  1 worker e com 8.
- Tabuleiro greedy-safe conhecido → sobrevivência 1.0 em 10 000 playouts (fecha o
  teste deixado em `skip` na Fase 3).
- Piso de justiça: um tabuleiro construído para falhar à profundidade 2 é
  rejeitado.

### Decisões tomadas na execução

- **Amostragem por reservatório nos playouts.** O branching factor precisa da
  contagem de grupos e o playout precisa de uma escolha uniforme; um único
  varrimento dá as duas sem materializar `[...findAllGroups(b)]`. Com milhares de
  playouts a percorrer dezenas de estados, é a diferença entre criar e não criar
  centenas de milhares de arrays `[E 11]`.
- **`firstFatalDepth` é `number | null`.** Num tabuleiro greedy-safe não há
  profundidade fatal, e zero seria mentira.
- **`--import tsx` no worker, não só no processo principal.** Um `Worker` do Node
  arranca sem herdar o loader de quem o criou. Sob `pnpm septet` o tsx chegaria por
  acaso; sob o Vitest não, porque aí quem transforma o TypeScript é o Vite e o
  worker corre em Node puro. Pedir o loader explicitamente é o que torna este
  código testável em vez de só executável à mão.
- **Fatias intercaladas, não contíguas.** Seeds vizinhas produzem tabuleiros de
  tamanhos parecidos; blocos contíguos deixariam um worker com todos os grandes.
- **A saída é reordenada por seed antes de sair do pool.** É o que torna o
  resultado independente do escalonamento, e está coberto por um teste que compara
  1 worker contra 4.

### O outro achado: tamanho não é alavanca de dificuldade — o joker é

Sobrevivência mediana por tamanho, sem joker, 100 níveis por ponto:

| Peças | Sobrevivência |
|---|---|
| 12 | 1.000 |
| 21 | 0.957 |
| 35 | 0.797 |
| 49 | 0.690 |

**Quadruplicar o tabuleiro tira 0.31 à sobrevivência. Um joker num tabuleiro de
12 peças tira 0.77** — de 1.000 para 0.233.

Isto reordena a curva de `[M 7]`, que trata o tamanho como um dos dois eixos de
progressão e o joker como tempero ocasional. Medido, o tamanho é o eixo de
*esforço e duração* — que é como `[M 7]` também o descreve — mas quase não é eixo
de exigência. Quem carrega a exigência é o joker.

Consequência prática imediata: a banda `denso` de `[M 7]` — "curtos e muito
densos, 10–15 peças, sobrevivência <10%" — aceitou **0 candidatos em 8128** sem
joker, com mediana observada de 1.00. Um tabuleiro pequeno não tem por onde
correr mal. Com joker, a mesma banda dá 30 aceites em 192 candidatos, em 7
segundos.

### Medição em duas fases — proposta no PR #5, decidida a 2026-08-20

Cada candidato pagava 1000 playouts **antes** de se saber se servia. Na `perito`,
44 de 64 candidatos morriam logo no teste de sobrevivência a seguir. Passa a
haver um pré-filtro de 100 playouts contra a banda alargada, e só os sobreviventes
levam a medição completa.

Isto **não toca na garantia central**, e é isso que o torna aceitável. A
resolubilidade vem da ida-e-volta, que corre antes, e do piso de justiça, que
corre depois; a sobrevivência é dificuldade. O pior que o atalho pode fazer é
descartar um candidato bom — e como o pipeline avalia até a banda encher, isso só
custa procurar mais uma seed.

A margem de alargamento não é constante. O erro de amostragem de uma proporção
colapsa perto de 0, portanto uma margem fixa é generosa de mais exatamente onde as
bandas são estreitas. Usa-se **3σ calculados em cada extremo**. Medido em 64
candidatos por banda, nas oito:

| Margem | `meio-joker` | `denso` | Total de playouts | Descartes falsos |
|---|---|---|---|---|
| fixa 0,15 | **−7%** | −2% | −31% | 0 em 512 |
| **3σ no extremo** | −1% | +4% | **−37%** | **0 em 512** |

A poupança é muito desigual, por duas razões que convém não confundir:
`tutorial`, `tempo` e `perito` poupam 60–70% porque os candidatos caem longe da
banda; `meio-joker` e `denso` poupam ~0% porque as bandas são estreitas e perto de
zero, **e** porque as rejeições delas são dominadas pelo piso de justiça, que
corre depois da medição e que o pré-filtro não alcança.

Validação de ponta a ponta: as oito bandas construídas pelos dois caminhos dão um
pack **idêntico byte a byte**.

Duas notas de método:

- **O relógio não serve para medir isto.** A mesma banda `perito`, com trabalho
  idêntico — 64 candidatos, mesmas rejeições — levou 88,1 s numa corrida e 49,5 s
  noutra. A grandeza fiável é a contagem de playouts.
- **Os percentis de calibração ficam mais ruidosos**, porque a `survivalRate`
  guardada numa rejeição do pré-filtro é a estimativa curta. Quem recalibrar
  bandas deve correr com `--pre 0`.

### Critério de aceitação — verificado

**240 níveis exportados em 8 bandas, 30 por banda, 0 falhas na reverificação
independente** (`septet verify`, que reaplica a solução de cada nível sem confiar
em nada do que está no ficheiro).

| Banda | Aceitação | Sobrevivência observada (p10 / mediana / p90) | Tempo |
|---|---|---|---|
| tutorial | 15.6% | 0.31 / 0.74 / 1.00 | 7s |
| inicio | 3.1% | 0.15 / 0.50 / 0.90 | 60s |
| meio | 3.1% | 0.23 / 0.58 / 0.88 | 135s |
| meio-joker | 15.6% | 0.05 / 0.15 / 0.31 | 35s |
| avancado | 0.7% | 0.51 / 0.89 / 1.00 | 567s |
| perito | 0.4% | 0.30 / 0.74 / 0.98 | 1395s |
| denso | 15.6% | 0.11 / 0.22 / 0.36 | 7s |
| tempo | 15.6% | 0.31 / 0.77 / 1.00 | 8s |

### O que fica por calibrar

`avancado` e `perito` conseguem-se, mas a 0.7% e 0.4% de aceitação — vinte e três
minutos para trinta níveis de perito. A causa é a mesma do achado acima: as duas
bandas pedem sobrevivência baixa **sem** joker, e sem joker a única alavanca é o
enviesamento das composições, que é fraca. Duas saídas, ambas por medir:

1. Levar o joker às bandas altas, como `meio-joker` já faz. É o que os dados
   apontam, e `[M 7]` não o proíbe — só diz que o joker entra na fase média.
2. Enviesar as composições muito mais agressivamente para faces de 3 a 6. O peso
   atual (`facesAltas`) é suave demais para o efeito que se quer.

Fica registado como trabalho da fase 6, com dados, em vez de suposição.

---

## Fase 6 — Renderer de consola · `S` · **M4 · GATE DE DESIGN** · ✅ **CONCLUÍDA — VERDE**

> Prova: **dá para jogar e sentir a mecânica.** `[E 10, fase 6]`
>
> Branch `fase-6-renderer-de-consola`. Gate fechado a 2026-08-20 com
> **35/35 previsões certas** em oito sessões. Ver "A decisão" no fim da fase.

São poucas horas de trabalho antes de existir uma única linha de UI, e respondem
à pergunta que nenhuma métrica responde.

### Entregáveis

`tools/src/play.ts` — `septet play <levelId | seed>`: desenha o tabuleiro em texto,
aceita seleção por coordenadas, mostra a soma corrente, aplica ao chegar a 7, e
suporta `undo`, `restart`, `hint`, `groups` (realce dos grupos válidos).

### O que se está a testar

O **risco nº 1 de design** `[M 8]`: *o colapso de colunas é difícil de antecipar
mentalmente → o puzzle vira sorte.* O critério é concreto: **dá para planear 2–3
jogadas à frente num 4x4?** Se não der, reconsidera-se a regra de reorganização —
e é incomparavelmente mais barato fazê-lo aqui do que depois da UI.

Secundariamente: se grupos de 5+ peças são vistosos ou tediosos `[M 3.1]`, e se a
dedução do joker `[M 2.6]` é descobrível com o tutorial certo.

### O defeito que a fase apanhou logo ao primeiro desenho

**O gerador construía torres.** A banda de perito dava em média 11 colunas por 32
linhas, com máximos de 42 — quando `[M 7]` pede "6x6+ e silhuetas".

A causa era minha, da fase 4: a escolha de coluna estava ponderada por
`(altura + 1)^insertionDepthBias`, lendo `[E 6.5]` — "preferir o fundo de colunas
altas" — como se falasse da escolha *da coluna*. É um ciclo de realimentação:
quanto mais alta a coluna, mais atrai, mais alta fica. Com bias 3, uma coluna de
dez linhas pesa 1331 contra 1 de uma coluna nova.

A leitura certa é que o enviesamento é da **linha dentro da coluna**. A
profundidade cria dependências; a altura descontrolada só cria uma torre.

**Nenhuma métrica da fase 5 deu por isto**, porque a taxa de sobrevivência não
olha para a forma. Foi preciso desenhar um tabuleiro — que é exatamente para o
que esta fase serve, e chegou ao primeiro.

Corrigido com escolha de coluna uniforme travada por uma altura alvo derivada do
tamanho, mais um travão simétrico na largura (sem ele o resultado saltou para o
extremo oposto: 49 peças em 20 colunas por 6 linhas). Agora:

| Peças | Largura | Altura | Alvo de `[M 7]` |
|---|---|---|---|
| 12 | 4.1 | 4.4 | 4x4 |
| 24 | 5.5 | 6.6 | 4x4–5x5 |
| 36 | 7.0 | 7.6 | 5x5–6x6 |
| 49 | 8.5 | 8.8 | 6x6+ |

E **80 em 80 tabuleiros têm silhueta irregular** — o perfil de `[M 3.2]` sai de
graça, sem mecanismo nenhum, porque colunas de alturas diferentes *são* a
silhueta.

### O terceiro achado: a ordem das alavancas de dificuldade

Corrigir a forma mudou a dificuldade de todas as bandas — tabuleiros aproximadamente
quadrados são mais difíceis do que torres ou tabuleiros largos e baixos. Isso obrigou
a remedir tudo, e a medição arrumou as alavancas por força:

| Alavanca | Sobrevivência mediana |
|---|---|
| **Joker** | 0.83 → 0.20 |
| Composições só até 3 peças | 0.28 |
| Faces altas (3–6) | 0.43 |
| **Todas as composições** | **0.70** |
| Tamanho (12 → 49 peças) | 1.00 → 0.69 |

As duas linhas do meio são a surpresa e **contrariam a tabela de `[M 7]`**, que
alarga as composições à medida que a dificuldade sobe. Composições grandes são
feitas de 1s e 2s, que se juntam a tudo. O plano já o diz em `[M 4.4]` — "muitos
1s e 2s → tabuleiro flexível" — só a tabela de §7 é que não o reflete.

Consequência concreta: com todas as composições, `avancado` era a banda **mais
fácil do pack**, com mediana 0.70. Passou a usar faces altas e caiu para 0.49.

As bandas foram recalibradas a partir dos quartis medidos, não da tabela — que
`[M 7]` já avisava ser "o ponto de partida, não o resultado". A progressão fica
monótona e cada banda captura entre 8% e 65% dos candidatos.

### O quarto achado: o rigor do piso de justiça cresce com o branching

Corrigida a forma, a profundidade 3 do piso passou a rejeitar quase tudo: na banda
`inicio`, **1840 de 1856** candidatos que já tinham passado a sobrevivência.

A razão é estrutural. O piso exige que **todas** as sequências de jogadas até à
profundidade `d` deixem o tabuleiro resolúvel, portanto o número de caminhos a
verificar é `branching^d`. Tabuleiros de forma correta ramificam muito mais do que
as torres que o gerador produzia antes, e à profundidade 3 basta um caminho mau
entre centenas para reprovar.

`[M 6.2]` pede "as primeiras 2–3 jogadas". Passou a usar-se **2**, que continua
dentro do que o plano pede e deixa passar níveis: as oito bandas encheram-se em 9
minutos, contra as duas que enchiam antes.

### O outro defeito, este de interação

Ao jogar o primeiro tabuleiro, a seleção continuava a acumular depois de passar de
7, deixando o jogador atolado num estado que só se desfazia à mão. Como o mínimo
de uma face é 1 e o alvo é exatamente 7, a soma só cresce — uma peça que passe de
7 nunca mais pode dar grupo válido. Passa a ser **recusada**, com a razão.

É pequeno, mas é o género de coisa que se descobre a jogar e não a especificar, e
teria ido parar à UI se esta fase não existisse.

### O defeito de interação que só o joker expunha

Encontrado a jogar `meio-joker-000013`, e é o achado com mais consequência para a
fase 8.

A eliminação automática ao formar grupo válido — o modelo de `[M 3.1]` — é
**incompatível com o joker**. Como `isValidGroup` aceita qualquer soma fixa entre
1 e 6, a seleção fica válida logo à primeira peça encostada ao joker, e o joker
gasta-se com o valor que essa peça deixar. Tocar `a0 b0 c0` para lhe dar os 3 que
tem de valer eliminava `a0 b0` com ele a 5.

O tabuleiro não bloqueia nessa jogada: fica insolúvel em silêncio e só falha no
fim. Três reinícios seguidos sem perceber porquê, num nível resolvido à primeira
depois da correção.

Não é um defeito da consola — é do **modelo de interação**, e a UI da fase 8
herda-o inteiro se o repetir. A seleção com joker passa a exigir confirmação
explícita (`x`), e sem joker o disparo automático mantém-se: as faces são >= 1 e o
alvo é exato, logo um grupo válido nunca é prefixo de outro. Só com joker é que
várias seleções diferentes são todas válidas — e é só aí que existe uma decisão a
proteger.

### O valor do joker não se descobre a jogar

`[M 2.6]` supõe que a dedução — soma das fixas, módulo 7, o que falta para 7 — é
"descobrível com o tutorial certo". Medido: não é descoberta **sem** ele. A
pergunta do jogador, ao quarto nível com joker, foi literalmente *"o joker tem um
valor fixo?"*.

O renderer passou a mostrar `joker = N` no cabeçalho, recalculado a cada jogada.
Isso resolve a consola, mas para o jogo é a confirmação de que **o tutorial
dedicado de `[M 2.6]` deixa de ser opcional**.

Consequência para o protocolo: com o valor à vista, a pergunta do playtest do
joker deixa de ser "consegues deduzir quanto vale" — está respondida — e passa a
ser "sabendo o valor, decidir em que grupo o gastas é interessante?".

### A decisão — **VERDE**

Oito sessões a 2026-08-20, registadas em `playtest.jsonl`:

| Nível | Peças | Sobrevivência | Previsões | Selo |
|---|---|---|---|---|
| `tutorial-000003` | 14 | 1.00 | *(aquecimento)* | perfeito |
| `inicio-000034` | 24 | 0.673 | — | limpo |
| `inicio-000134` | 20 | 0.964 | — | perfeito |
| `inicio-000296` | 18 | 0.625 | **6/6** | perfeito |
| `inicio-000256` | 24 | 0.708 | **8/8** | perfeito |
| `meio-000015` | 28 | 0.476 | **9/9** | perfeito |
| `perito-000014` | 37 | 0.083 | **12/12** | perfeito |
| `meio-joker-000013` | 27 | 0.079 | *(joker)* | perfeito |

**35/35 previsões certas, zero undos, zero reinícios, zero bloqueios** — incluindo
silhuetas e grupos de 5 a 7 peças a 0.083 de sobrevivência, onde uma em cada doze
sequências aleatórias sobrevive.

O risco nº 1 de `[M 8]` **não se materializou**: o colapso de colunas é
antecipável. A regra de reorganização fica como está, e com ela tudo o que se
construiu a partir da fase 1.

O passo 3 do protocolo — repetir com o modo de dois passos — tornou-se
desnecessário: existia para separar Verde de Amarelo, e a taxa já estava no máximo
sem ajuda nenhuma. **Animar gravidade e colapso em separado continua recomendado
em `[M 8]`, mas não é requisito.**

O que *não* fica provado, e convém não confundir: o número de jogadas de uma
resolução não mede nada. Como cada jogada remove exatamente 7, qualquer tabuleiro
limpo leva sempre `soma/7` jogadas. O sinal está em chegar ao fim, e em chegar sem
desfazer.

### Critério de aceitação — verificado

- ✅ **Tabuleiros jogados e decisão escrita** sobre o risco nº 1 — é esta secção.
- ✅ Registo mecânico por sessão em `playtest.jsonl`, versionado como prova.
- ✅ Dois defeitos de interação apanhados antes de existir UI — a seleção atolada
  acima de 7, e o joker gasto ao valor errado pela eliminação automática.

---

## Fase 7 — Camada de sessão · `M` · ✅ **CONCLUÍDA**

Ainda sem UI. Tudo o que o motor deliberadamente não sabe `[E 1.1]` vive aqui.

> Branch `fase-7-camada-de-sessao`.

### Entregáveis

```
game/src/session/
  GameSession.ts        estado, histórico, undo, restart, dicas
  PuzzleSession.ts      selos: Concluído / Limpo / Perfeito   [M 6.2]
  TimeAttackSession.ts  relógio único contínuo                [M 6.3]
  combos.ts             cascatas por intervalo entre jogadas  [E 4.3]
  scoring.ts
  progress.ts           persistência local do perfil
```

### Decisões tomadas na execução

**`jokerValue` subiu para a engine.** O valor obrigatório do joker era da fase 6
e vivia em `tools/src/session.ts`. Com a `GameSession` passou a ter dois
consumidores, e duplicá-lo era criar exatamente a classe de divergência que esta
arquitetura existe para impedir. É uma consulta sobre o tabuleiro — não conhece
modo, não tem estado, não usa aleatoriedade — portanto cabe em `board.ts` sem
tocar em nenhuma das cinco regras invioláveis. O `tools` reexporta-o com o nome
português do módulo dele.

**O tempo é guardado como instante-limite, não como saldo.** `deadlineAt` em vez
de `remainingMs`. Assim o relógio anda sozinho e ninguém tem de o decrementar: o
que resta é sempre `deadline − agora`, e ganhar tempo é somar ao prazo. Sem isto
haveria um temporizador a mutar estado, que é precisamente o que torna um modo
com relógio difícil de testar.

**A pendência do joker subiu da consola para a sessão.** O defeito da fase 6 não
era do renderer — era do modelo de interação de `[M 3.1]`, e a UI da fase 8 ia
herdá-lo inteiro. `tap` não elimina automaticamente quando há joker na seleção;
`commit` fecha-a. `jokerInSelection` devolve o par *valor que toma* / *valor
obrigatório*, que é o que permite à UI avisar antes de o jogador matar o
tabuleiro.

**A dica compara chaves canónicas, não valida o grupo guardado.** Um jogador que
se desviou pode chegar a um estado onde o passo guardado por acaso continua a ser
um grupo válido — e a dica mandá-lo-ia para uma solução que já não existe. A
verificação exata é replicar os primeiros `moves` passos guardados sobre o
tabuleiro inicial e comparar `boardKey`. Custa `O(moves)` e só corre quando o
jogador pede dica.

**Nada de `Date.now()`, nada de `localStorage` direto.** O tempo entra por
parâmetro e o armazenamento por interface (`ProfileStorage`, que `localStorage`
satisfaz tal como está). Os testes correm sem DOM, e a fase 9 troca por
armazenamento nativo sem lhe mexer.

**O perfil é versionado e a leitura nunca falha.** JSON inválido, versão
desconhecida, campos de outro tipo — tudo dá perfil vazio, e os níveis
corrompidos são descartados um a um em vez de deitarem fora o ficheiro todo.
Perder progresso é mau; não abrir o jogo é pior, e um perfil é exatamente o
género de coisa que chega corrompida do disco de um telefone.

### Notas sobre os selos e a economia

O undo **conta** para o selo mas não é limitado: o jogador usa-o à vontade e o
que perde é o mérito, não a possibilidade. É a assimetria de `[M 3.3]` — limitar
o undo lê-se como taxa sobre o erro; limitar a dica lê-se como justo. Reiniciar
devolve as dicas, porque o nível recomeça inteiro e o custo também.

Uma dica que não encontra grupo nenhum não se cobra.

### Critério de aceitação — verificado

- ✅ **Undo restaura o estado exato**, comparado por `boardKey`.
- ✅ **O selo "Limpo" perde-se ao primeiro undo ou reinício; "Perfeito" à
  primeira dica.**
- ✅ **Relógio determinístico sob clock injetado** — `startTimeAttack(level, now)`
  com o mesmo `now` dá estados iguais, e não há uma única leitura do relógio do
  sistema no pacote.
- ✅ 49 testes novos; **249 no total**. Mutação: retirar a verificação de dicas do
  selo e devolver o disparo automático ao joker são apanhados por 4 testes.

### Notas de implementação

- **Undo ilimitado e grátis** `[M 3.3]` — trivial, é uma pilha de tabuleiros
  imutáveis. Foi exatamente para isto que a engine é imutável `[E 1.1]`.
- **Combo mede-se pelo intervalo entre jogadas do jogador**, não por eliminação
  automática `[E 4.3]`. Uma cascata não elimina sozinha: se eliminasse, seguiria
  um caminho que o jogador não escolheu e podia levar o tabuleiro a um estado
  bloqueado, destruindo a garantia de terminabilidade.
- Modo tempo: relógio único contínuo, tempo por tabuleiro limpo, bónus
  proporcionalmente maior para grupos de 5+ `[M 6.3]`. Sem undo, sem joker.
- Os dois parâmetros a afinar em playtest — *tempo inicial* e *tempo concedido
  por tabuleiro* — ficam em configuração externa, nunca hardcoded.
- Dicas servidas pela solução guardada no nível `[M 4.3]`, em quantidade limitada.
  **O undo nunca é escasso; a dica é.**

### Testes

- Undo/redo restaura o estado exato (comparação por `boardKey`).
- O selo "Limpo" perde-se ao primeiro undo ou restart; "Perfeito" à primeira dica.
- Relógio determinístico sob um clock injetado — nunca `Date.now()` direto.

---

## Fase 8 — UI web · `XL` · **M5**

> `[E 10, fase 7]` · `[E 1.5, fase 2]` — build web puro, sem lojas. Playtest por
> link, iteração em segundos, sem review.

### Entregáveis

```
game/src/ui/
  BoardView.ts           DOM + transições CSS   [E 1.4]
  SelectionController.ts tocar-a-acumular       [M 3.1]
  theme.css
game/public/levels/*.json
```

### Notas de implementação

- **DOM com transições CSS, não Canvas** `[E 1.4]`. Com ≤ 50 peças é folgadamente
  suficiente, é mais fácil de estilizar e de tornar acessível. Migra-se só a
  camada de efeitos se as partículas o exigirem mais tarde.
- **A seleção é tocar-a-acumular com soma corrente visível, desfazer a última
  peça, e eliminação automática ao atingir 7** `[M 3.1]`. Arrastar em caminho
  contínuo **não chega** para formas em T ou S — não é preferência, é
  consequência direta de grupos até 7 peças em forma livre.
- As animações têm de exprimir as duas transformações **separadamente**: primeiro
  a queda, depois o deslize horizontal. É o que dá ao jogador a hipótese de as
  antecipar (risco nº 1).
- Level packs como JSON estático no bundle `[E 7.5]`. **O jogo em produção nunca
  gera nem mede nada.**
- Tutorial dedicado ao joker, obrigatório `[M 2.6]`: tem de mostrar
  explicitamente que existe um valor certo e um errado, ou o joker lê-se como
  armadilha.

### Critério de aceitação

Campanha inicial jogável ponta a ponta, offline, com os dois modos, num link
partilhável. Playtest externo antes de qualquer trabalho de empacotamento.

---

## Fase 9 — Empacotamento · `L` · **M6**

> `[E 10, fase 8]` · `[E 1.5, fase 3]` — só depois de a mecânica estar validada.

- Capacitor para iOS e Android; pacote `mobile`.
- **Sensação nativa** `[E 11]`: safe areas, sem bounce de scroll, haptics ao
  tocar, transições que não pareçam navegação web.
- **Não parecer "só um website"** `[E 11]`: lógica e níveis locais, funcionar
  offline de raiz — o que é natural, já que os níveis são JSON estático.
- Leaderboards via Game Center e Play Games; cobrem o básico sem backend próprio.
- IAP conforme `[M 9.2]`: compra única, packs de níveis, arquivo do diário,
  cosméticos. **Nunca vidas, undos, tempo ou jokers** `[M 9.3]`.
- **O build web mantém-se** como demo e canal de marketing `[E 1.5, fase 4]`.

---

## Paralelização e dependências

```
Fase 0
  └─ 1 ─ 2 ─ 3 ─ 4 ─ 5 ─ 6 (gate)
                            └─ 7 ─ 8 ─ 9
```

A cadeia 1→4 é estritamente sequencial: cada fase é a fundação verificável da
seguinte. Depois da Fase 5, a Fase 7 pode andar em paralelo com a geração do
corpus, desde que a Fase 6 já tenha dado luz verde.

Trabalho que pode arrancar em paralelo a qualquer momento, por não tocar na
cadeia: arte e cosméticos `[M 9.2]`, texto do tutorial, identidade visual.

---

## Riscos e onde são endereçados

| Risco `[E 11]` / `[M 8]` | Fase | Mitigação concreta |
|---|---|---|
| Erro na inversão → níveis impossíveis | 4 | Validação por simulação + ida-e-volta em CI, sem exceções |
| Explosão de estados no solver | 3 | `Limits` obrigatórios + `"inconclusive"` → descartar candidato |
| `Math.random()` infiltra-se na engine | 0 | Regra de lint |
| Playouts não reproduzíveis em paralelo | 5 | Seed derivada por playout |
| Pressão de GC nos playouts | 5 | Coordenadas empacotadas; buffers só depois de medir |
| **Colapso de colunas imprevisível** | **6** | **Gate humano — decisão escrita antes de qualquer UI** |
| Grupos grandes tediosos | 6, 8 | Playtest de consola; ajustar a distribuição, nunca proibir na regra |
| Joker mal usado mata o tabuleiro | 8 | Tutorial dedicado + undo ilimitado |
| Sensação não-nativa | 9 | Safe areas, haptics, sem bounce de scroll |

---

## Definição de pronto (por fase)

Uma fase só fecha quando:

1. Os testes da fase passam em CI.
2. Os testes de propriedade correm sobre entrada gerada, não só exemplos.
3. Nenhuma regra de lint está silenciada dentro de `packages/engine`.
4. O critério de aceitação da fase está verificado, não presumido.

---

## Questões em aberto

Nenhuma bloqueia o arranque. Todas se resolvem com dados das Fases 5 e 6:

- **Peso das 14 composições por fase** `[M 2.3, 4.4]` — arranca uniforme,
  calibra-se pelas métricas.
- **Colocação ótima do joker** `[E 6.4]` — a hipótese "passo tardio → mais
  estrangulamento" tem de ser confirmada pela taxa de sobrevivência, que deve
  *descer* `[M 8]`.
- **Curva de tempo** `[M 6.3]` — tempo inicial e decaimento, só por playtest.
- **Limiares exatos das bandas** — as tabelas de `[M 5.1]` e `[M 7]` são o ponto
  de partida, não o resultado.
