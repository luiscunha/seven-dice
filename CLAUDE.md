# CLAUDE.md — Sete (seven-dice)

Puzzle de faces de dado: elimina grupos ortogonalmente conexos cuja soma seja
exatamente **7**, até o tabuleiro ficar vazio.

## Documentos de referência

Vivem fora deste repo, em `../documentation/`:

| Ficheiro | O que decide |
|---|---|
| `plano-modelo-jogo-sete.md` | Regras, modos, progressão, monetização |
| `spec-motor-sete.md` | Arquitetura do motor. **A fonte de verdade para código** |
| `plano-implementacao.md` | Ordem de construção, fases, critérios de aceitação |

Em caso de conflito com este ficheiro, a spec ganha. Este documento é um resumo
operacional, não uma redefinição.

---

## A garantia central

O projeto inteiro existe para assegurar **uma** propriedade: *nenhum nível
publicado é impossível*. Ela vem de duas coisas e mais nenhuma:

1. A construção reversa validada por **simulação direta** (spec §6.3).
2. O teste de **ida-e-volta** sobre milhares de tabuleiros (spec §9.3).

Qualquer alteração que enfraqueça uma destas duas é uma regressão crítica, por
melhor que seja o argumento de performance ou de simplicidade.

---

## Comandos

```bash
pnpm check      # lint + typecheck + test — corre isto antes de dar algo por feito
```

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:watch` correm em
separado. Node ≥ 20, pnpm 11.

Não há passo de build: cada pacote expõe `"exports": "./src/index.ts"` e os
consumidores importam código-fonte. O `tsc` corre sempre com `--noEmit`.

## Estrutura

```
packages/
  engine/    TypeScript puro — Board, moves, solver, generator, metrics
             Sem DOM, sem Node, sem dependências. 100% testável.
  tools/     CLI Node — pipeline de geração e medição offline
  game/      UI web — consome engine + level packs estáticos
  mobile/    Capacitor — iOS e Android (fase 9)
```

`engine` não importa nada. Os outros três são consumidores.

Todo o tooling (TypeScript, Vitest, ESLint, fast-check) vive na raiz e **não se
duplica por pacote** — versões divergentes entre `engine` e `tools` seriam
exatamente a divergência que esta arquitetura existe para impedir.
`test/hygiene.test.ts` verifica-o.

```
UI (DOM + CSS)
GameSession (modo, score, relógio)
engine: Board · Moves · Solver · Generator · Metrics
```

---

## Regras invioláveis da `engine`

Estas não são preferências de estilo. Cada uma protege uma propriedade concreta.

1. **Sem `Math.random()`.** Toda a aleatoriedade entra por uma seed explícita,
   via `Rng` passado como parâmetro (`mulberry32`). Sem isto não há seeds
   reproduzíveis, puzzle diário nem leaderboards justos. Regra de lint ativa,
   incluindo as formas `Math["random"]` e `const { random } = Math`.
2. **Sem importar `node:*`, sem DOM, sem dependências.** É o que permite correr
   exatamente a mesma engine no jogo, no pipeline Node e nos testes — e é daí que
   vem a impossibilidade de divergência entre gerador e jogo. Imposto em duas
   camadas: o `tsconfig` da engine tem `lib: ["ES2022"]` e `types: []`, o que
   torna `document`, `window` e `process` invisíveis ao compilador; o lint
   duplica a proibição para dar a mensagem certa.
3. **Imutável.** Aplicar uma jogada devolve um tabuleiro novo. Torna o undo
   trivial, o solver seguro e os playouts paralelizáveis.
4. **Determinística.** A mesma entrada produz sempre a mesma saída.
5. **Sem conhecimento de modo.** A engine não sabe se está num puzzle ou num time
   attack. Relógio, pontuação, combos e progressão vivem na `GameSession`.

---

## Representação do tabuleiro

**Lista de colunas, cada uma uma lista de células de baixo para cima.** Não é a
representação óbvia — é a certa, porque torna gravidade e colapso operações de
lista em vez de ciclos com índices:

| Operação | Nesta representação |
|---|---|
| Gravidade | Remover elementos da lista — os de cima descem sozinhos |
| Colapso de colunas | Remover listas vazias |

```ts
export type Cell   = 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0 = joker
export type Column = readonly Cell[];
export type Board  = readonly Column[];
```

`Board` **é** JSON válido — o formato de nível não precisa de serializador, e os
testes escrevem-se como literais legíveis.

### Coordenadas

`(c, r)`: `c` da esquerda, `r` **a partir da base**. A célula existe se
`r < board[c].length`.

No caminho quente, célula = inteiro empacotado `(c << 6) | r`. Evita alocação por
célula e permite `Set<number>`, muito mais rápido que `Set` de objetos ou strings.
Limite implícito: 64 linhas por coluna.

### Invariantes

1. Nenhuma coluna é vazia.
2. As células de uma coluna são contíguas a partir da base.
3. No máximo um joker em todo o tabuleiro.

As duas primeiras são automáticas nesta representação. É esse o objetivo.

### Adjacência

Quatro condições — e a condição de altura na vizinhança lateral **não é
opcional**, é ela que faz as silhuetas funcionarem:

```
(c, r) é vizinho de:
  (c,   r-1)  se r > 0
  (c,   r+1)  se r+1 < altura(c)
  (c-1, r)    se c > 0        e r < altura(c-1)
  (c+1, r)    se c+1 < largura e r < altura(c+1)
```

Uma implementação distraída passa em todos os testes de retângulo e falha em
pirâmides.

### Chave canónica

`b.map(col => col.join("")).join("|")`. O tabuleiro produzido pela engine está
sempre em forma canónica, portanto serve diretamente de chave de memoização.

**Nunca aplicar redução por simetria** — um tabuleiro espelhado é um estado
distinto, e a redução falsearia a contagem de estados.

---

## Regras do jogo

- Grupo válido: conexo por adjacência ortogonal **e** soma `=== 7`.
- Com joker: `1 <= soma das fixas <= 6`; o joker toma o que falta. **Nunca forma
  grupo sozinho.**
- Máximo 7 células por grupo (sete 1s). São 14 as composições possíveis.
- Após eliminar: gravidade, depois colapso de colunas vazias para a esquerda.
  Ambas preservam a ordem relativa das peças — é isso que torna a geração reversa
  possível.

### Cascatas não eliminam automaticamente

Se novos grupos se formarem após uma jogada, ficam **disponíveis**, mas só
desaparecem se o jogador os escolher. A razão é de correção: eliminações
automáticas seguiriam um caminho que o jogador não escolheu e podiam levar o
tabuleiro a um estado bloqueado, destruindo a garantia de terminabilidade.

"Cascata" e "combo" são medidos na `GameSession`, pelo intervalo entre jogadas.

### O joker

O valor está **globalmente determinado**: `soma das fixas + joker ≡ 0 (mod 7)`, e
como está entre 1 e 6, só existe um valor que permite limpar o tabuleiro. O joker
é flexível em *posição*, não em valor — a decisão do jogador é *em que grupo o
gasto*. Usá-lo mal não bloqueia de imediato; o tabuleiro falha no fim.

---

## APIs principais

```ts
// groups.ts
function* findAllGroups(b: Board): Generator<Group>;   // generator: consumidores param cedo
function isValidGroup(b: Board, g: Group): boolean;
function hasAnyGroup(b: Board): boolean;               // caminho mais quente do pipeline

// moves.ts
function applyMove(b: Board, g: Group): Board;         // copia só as colunas afetadas

// solver.ts
function isSolvable(b: Board, limits?: Limits): Verdict;
function findSolution(b: Board, limits?: Limits): Group[] | null;
function isGreedySafe(b: Board, limits?: Limits): Verdict;
type Verdict = "yes" | "no" | "inconclusive";

// metrics.ts
function measureSurvival(b: Board, runs: number, seed: number): SurvivalResult;

// rng.ts
type Rng = () => number;                               // [0, 1)
function mulberry32(seed: number): Rng;
```

`Group` é `readonly number[]` de coordenadas empacotadas, **sempre ordenado** — a
ordenação canónica é o que permite comparar e desduplicar sem esforço.

`Verdict` tem três valores por necessidade: o gerador chama o solver milhares de
vezes e um caso patológico não pode parar o pipeline. `"inconclusive"` significa
limite atingido → descartar o candidato. **`Limits` é sempre obrigatório na
prática.**

---

## Algoritmos: o que não improvisar

**Enumeração de grupos — por célula mínima.** Para cada célula `v`, enumerar só
os grupos em que `v` é a de menor índice. A abordagem ingénua (DFS a partir de
cada célula) emite o mesmo grupo uma vez por ordem de visita; duplicados corrompem
o branching factor e a contagem de estados. Poda: nenhum ramo continua depois de a
soma atingir 7 (com joker, 6 nas fixas).

**Solver — DFS com memoização de estados falhados.** A memoização não é
otimização: jogadas independentes comutam, portanto o mesmo estado chega por
muitos caminhos. Profundidade máxima ≈ peças/2 ≈ 25, muito abaixo do stack do V8
— recursão direta é segura.

**Gerador — validação por simulação, sem exceções:**

```ts
const simulado = applyMove(candidato, grupoInserido);
aceitar = boardKey(simulado) === boardKey(board)
       && isConnected(candidato, grupoInserido);
```

Gravidade e colapso não são inversíveis por construção. Inserir "numa posição
plausível" não chega. **É desta verificação que vem toda a garantia do jogo.**

**Playouts — seed derivada por playout** (`seed + índice`), nunca estado de RNG
partilhado entre workers. Sem isto o resultado depende do escalonamento. O
paralelismo (`worker_threads`) vive em `tools`; a engine mantém-se
single-threaded.

**Piso de justiça** — BFS até profundidade 3 confirmando que *todos* os estados a
essa profundidade continuam resolúveis. Verificação obrigatória antes de publicar
qualquer nível.

---

## Performance: não otimizar antes de medir

Alocar arrays novos a cada expansão. Buffers partilhados só entram **depois** de o
profiler acusar pressão de GC nos playouts — o código com buffers é bastante mais
difícil de manter correto, e a correção aqui é a garantia central do projeto.

O jogo em si não tem exigência técnica nenhuma (≤ 50 peças, animações simples). A
performance que importa é a do pipeline offline.

---

## Testes

**Vitest** para execução, **fast-check** para propriedades.

Propriedades que têm de valer sempre:

- Após qualquer jogada, a soma desce exatamente 7.
- Após qualquer jogada, as invariantes mantêm-se.
- A ordem relativa das peças não removidas é preservada.
- Todo o grupo de `findAllGroups` passa `isValidGroup`, e não há duplicados.
- A soma total de qualquer tabuleiro gerado é múltipla de 7.
- Um tabuleiro greedy-safe nunca bloqueia em 10 000 playouts.
- **Todo o tabuleiro gerado é resolvido pela solução guardada.** ← o teste mais
  valioso do projeto; corre sobre milhares de tabuleiros em CI.

Ao escrever testes de exemplo, usar literais JSON legíveis — servem de
documentação executável.

---

## Formato de nível

```json
{
  "id": "mid-0142",
  "seed": 8837462,
  "board": [[3,4,1],[2,5,2,1],[6,1],[4,3,0]],
  "joker": { "at": [3, 3], "trueValue": 3 },
  "solution": [[192, 193], [256, 257]],
  "metrics": { "pieces": 12, "survivalRate": 0.34, "avgBranching": 5.2,
               "firstFatalDepth": 4.1, "solutionLength": 6 },
  "band": "advanced"
}
```

Guardar **a seed e o tabuleiro explícito**: a seed é identidade estável; o
tabuleiro explícito protege contra alterações futuras no gerador. `solution` usa
coordenadas empacotadas.

**O jogo em produção nunca gera nem mede nada** — carrega JSON estático.

---

## Convenções

- TypeScript `strict` + `noUncheckedIndexedAccess`. Numa representação por listas
  de comprimento variável, `board[c][r]` é legitimamente `undefined` fora da
  silhueta: deixar o compilador exigir a verificação.
- Renderização em **DOM com transições CSS**, não Canvas.
- Seleção na UI: **tocar-a-acumular** com soma corrente visível, desfazer a última
  peça, eliminação automática ao atingir 7. Arrastar em caminho contínuo não chega
  para formas em T ou S.
- Documentação e comentários em português europeu, como as specs.
- Não silenciar regras de lint dentro de `packages/engine`.

---

## Ordem de trabalho

1. Tipos, adjacência, `applyMove` — *as regras estão certas*
2. `findAllGroups` — *deteção completa e sem duplicados*
3. `solver` — *"tem solução?"*
4. **`generator` + ida-e-volta — *os níveis são sempre resolúveis*** ← marco real
5. Métricas + pipeline CLI — *dá para classificar dificuldade*
6. Renderer de consola — *dá para jogar e sentir a mecânica* ← gate de design
7. Camada de sessão · 8. UI web · 9. Capacitor

A **fase 4** é o marco real: a partir dela a ideia está provada. A **fase 6** vale
o desvio — poucas horas antes de existir uma linha de UI, e responde à pergunta
que nenhuma métrica responde: *o colapso de colunas dá para antecipar
mentalmente?*
