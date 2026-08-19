# Plano de Implementação — "Sete"

> Companheiro operacional de `plano-modelo-jogo-sete.md` (modelo de jogo) e
> `spec-motor-sete.md` (motor). Referências `[M x.y]` apontam para o plano do
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

## Fase 3 — Solver · `M` · **M1**

> Prova: **dá para responder "tem solução?"** `[E 10, fase 3]`

### Entregáveis

`engine/src/solver.ts` — `isSolvable`, `findSolution`, `isGreedySafe`, tipos
`Verdict` e `Limits`.

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

### Critério de aceitação

O solver responde corretamente em todos os exemplos manuais e nunca lança nem
excede o orçamento de tempo declarado.

---

## Fase 4 — Gerador · `L` · **M2 · MARCO REAL**

> Prova: **os níveis são sempre resolúveis.** `[E 10, fase 4]`

É a fase que justifica todas as anteriores. A partir daqui a ideia está provada;
tudo o resto é construção.

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

### Critério de aceitação

**Alguns milhares de tabuleiros em CI, ida-e-volta a 100%.** Sem exceções, sem
tolerância, sem "falha em 1 em 10 000". Uma única falha aqui significa níveis
impossíveis em produção — pára-se e corrige-se antes de avançar.

---

## Fase 5 — Métricas e pipeline · `L` · **M3**

> Prova: **dá para classificar dificuldade.** `[E 10, fase 5]`

### Entregáveis

| Ficheiro | Conteúdo |
|---|---|
| `engine/src/metrics.ts` | `measureSurvival`, piso de justiça `[E 7.4]` |
| `tools/src/worker.ts` | Playouts em `worker_threads` |
| `tools/src/pipeline.ts` | gerar → medir → filtrar → exportar `[E 7.5]` |
| `tools/src/bands.ts` | Bandas de `[M 5.1]` e `[M 7]` |
| `tools/src/cli.ts` | `sete generate`, `sete measure`, `sete export` |

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

### Critério de aceitação

Um level pack de ≥ 200 níveis exportado no formato de `[E 8]`, classificado pelas
cinco fases de `[M 7]`, com todos os níveis a passar ida-e-volta e piso de
justiça.

---

## Fase 6 — Renderer de consola · `S` · **M4 · GATE DE DESIGN**

> Prova: **dá para jogar e sentir a mecânica.** `[E 10, fase 6]`

São poucas horas de trabalho antes de existir uma única linha de UI, e respondem
à pergunta que nenhuma métrica responde.

### Entregáveis

`tools/src/play.ts` — `sete play <levelId | seed>`: desenha o tabuleiro em texto,
aceita seleção por coordenadas, mostra a soma corrente, aplica ao chegar a 7, e
suporta `undo`, `restart`, `hint`, `groups` (realce dos grupos válidos).

### O que se está a testar

O **risco nº 1 de design** `[M 8]`: *o colapso de colunas é difícil de antecipar
mentalmente → o puzzle vira sorte.* O critério é concreto: **dá para planear 2–3
jogadas à frente num 4x4?** Se não der, reconsidera-se a regra de reorganização —
e é incomparavelmente mais barato fazê-lo aqui do que depois da UI.

Secundariamente: se grupos de 5+ peças são vistosos ou tediosos `[M 3.1]`, e se a
dedução do joker `[M 2.6]` é descobrível com o tutorial certo.

### Critério de aceitação

**Dezenas de tabuleiros jogados numa tarde, e uma decisão escrita** sobre o risco
nº 1. É um gate humano, não automatizável. Se a resposta for negativa, o plano
volta à Fase 1 com uma regra de reorganização diferente.

---

## Fase 7 — Camada de sessão · `M`

Ainda sem UI. Tudo o que o motor deliberadamente não sabe `[E 1.1]` vive aqui.

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
