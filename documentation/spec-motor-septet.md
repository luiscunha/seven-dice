# Especificação do Motor — "Septet"

> Companheiro de `plano-modelo-jogo-septet.md`. Referências entre parênteses
> apontam para secções desse documento.
>
> **Stack: TypeScript.** Ver secção 1.2 para a justificação.

---

## 1. Princípios e arquitetura

### 1.1 O motor é puro

Biblioteca sem UI, sem relógio, sem pontuação, sem I/O. Três propriedades
obrigatórias:

- **Determinístico.** A mesma entrada produz sempre a mesma saída. Toda a
  aleatoriedade entra por uma seed explícita. `Math.random()` está proibido em
  todo o pacote `engine` — usar um PRNG semeado (ver 7.1).
- **Imutável.** Aplicar uma jogada devolve um tabuleiro novo. Torna o undo
  trivial (uma pilha de estados), o solver seguro, e os playouts paralelizáveis.
- **Sem conhecimento de modo.** O motor não sabe se está num puzzle ou num time
  attack. Relógio, pontuação e progressão vivem numa camada acima.

```
┌─────────────────────────────────────┐
│ UI (DOM + CSS)                      │
├─────────────────────────────────────┤
│ GameSession (modo, score, relógio)  │
├─────────────────────────────────────┤
│ engine: Board · Moves · Solver      │   ← esta especificação
│         Generator · Metrics         │
└─────────────────────────────────────┘
```

### 1.2 Porquê TypeScript

A razão decisiva não é "um código para iOS e Android". É esta:

**O gerador e o jogo têm de partilhar exatamente as mesmas regras.** O gerador
offline simula jogadas para validar a inversão (6.3); o jogo aplica essas mesmas
jogadas em runtime. Duas implementações em linguagens diferentes divergiriam mais
cedo ou mais tarde — e uma divergência subtil produz níveis impossíveis, que é
precisamente a falha que toda esta arquitetura existe para prevenir.

Com TypeScript, o motor é escrito uma vez e corre nos três contextos: no jogo, no
pipeline de geração em Node, e nos testes. Divergência impossível por construção.

Secundariamente: o jogo não tem exigência técnica nenhuma (≤ 50 peças, animações
simples), portanto a escolha pode ser feita por produtividade em vez de
performance.

### 1.3 Estrutura do repositório

```
packages/
  engine/    TypeScript puro — Board, moves, solver, generator, metrics
             Sem DOM, sem Node, sem dependências. 100% testável.
  tools/     CLI Node — pipeline de geração e medição offline
  game/      UI web — consome engine + level packs estáticos
  mobile/    Capacitor — empacotamento iOS e Android
```

`engine` não importa nada. É a tradução direta deste documento. Os outros três
são consumidores.

### 1.4 Renderização

**DOM com transições CSS**, não Canvas. Com 50 peças no máximo é folgadamente
suficiente, é mais fácil de estilizar e de tornar acessível, e evita reimplementar
layout à mão. Se mais tarde os efeitos de eliminação exigirem partículas, migra-se
só essa camada.

### 1.5 Faseamento

| Fase | Entrega | Porquê nesta ordem |
|---|---|---|
| 1 | `engine` + `tools`, sem interface | Valida a garantia de terminabilidade |
| 2 | Build web puro, sem lojas | Playtest por link, iteração em segundos, sem review |
| 3 | Capacitor + IAP + push | Só depois de a mecânica estar validada |
| 4 | Build web mantido como demo | Canal de marketing que o nativo não dá |

---

## 2. Representação do tabuleiro

### 2.1 A escolha central

O tabuleiro é uma **lista de colunas, cada uma uma lista de células de baixo para
cima**. Não é a representação óbvia (matriz), mas é a certa, porque torna as duas
transformações do jogo em operações de lista:

| Operação do jogo | Na representação por colunas |
|---|---|
| Gravidade (2.4 do plano) | Remover elementos da lista — os de cima descem sozinhos |
| Colapso de colunas (2.4) | Remover listas vazias |

Ambas ficam **grátis**. Numa matriz seriam ciclos com deslocamentos manuais e uma
fonte permanente de bugs de índice.

```typescript
/** 0 = joker; 1–6 = face de dado */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Column = readonly Cell[];
export type Board  = readonly Column[];
```

Bónus desta escolha: o `Board` **é** JSON válido. O formato de nível (secção 8)
não precisa de serializador.

### 2.2 Coordenadas e invariantes

Uma célula é `(c, r)`: `c` = índice da coluna a partir da esquerda, `r` = índice
da linha a partir da **base**. A célula existe se `r < board[c].length`.

Invariantes válidas em qualquer tabuleiro produzido pelo motor:

1. Nenhuma coluna é vazia.
2. As células de uma coluna são contíguas a partir da base.
3. No máximo um joker em todo o tabuleiro.

As invariantes 1 e 2 são automáticas nesta representação — não há como as violar.
É esse o objetivo da escolha.

`readonly` protege em compilação, não em runtime. Como a `engine` não tem
consumidores externos não confiáveis, isso chega. Não usar `Object.freeze` no
caminho quente: o custo é real e o benefício aqui é nulo.

### 2.3 Silhuetas

O perfil irregular (3.2 do plano) não precisa de mecanismo nenhum: colunas de
comprimentos diferentes *são* a silhueta. Uma pirâmide é `[2,4,6,4,2]`.

### 2.4 Adjacência

```
(c, r) é vizinho de:
  (c,   r-1)  se r > 0
  (c,   r+1)  se r+1 < altura(c)
  (c-1, r)    se c > 0        e r < altura(c-1)
  (c+1, r)    se c+1 < largura e r < altura(c+1)
```

A condição de altura na vizinhança lateral é o que faz as silhuetas funcionarem:
uma célula no topo de uma coluna alta não tem vizinho à direita se a coluna do
lado for mais baixa.

### 2.5 Coordenadas empacotadas

No caminho quente (enumeração de grupos, playouts), representar cada célula como
um inteiro `c * 64 + r` em vez de um tuplo ou objeto. Evita alocação por célula e
permite usar `Set<number>`, que em JS é bastante mais rápido do que `Set` de
objetos ou de strings.

```typescript
export const packed  = (c: number, r: number): number => (c << 6) | r;
export const colOf   = (p: number): number => p >>> 6;
export const rowOf   = (p: number): number => p & 63;
```

Limite implícito: 64 linhas por coluna. Muito acima de qualquer tabuleiro real.

### 2.6 Forma canónica e chave

O tabuleiro produzido pelo motor está **sempre em forma canónica** (2.2), o que
permite usá-lo diretamente como chave de memoização sem normalização prévia.

```typescript
export const boardKey = (b: Board): string =>
  b.map(col => col.join("")).join("|");
```

Como as células vão de 0 a 6, cada uma ocupa exatamente um caractere e a string
resulta curta. `Map`/`Set` com chaves string em JS são suficientemente rápidos —
não vale a pena um esquema de hash mais elaborado antes de haver medição.

**Não aplicar redução por simetria.** Um tabuleiro espelhado é um estado distinto
e a redução introduziria erros na contagem de estados (5.3 do plano).

---

## 3. Deteção de grupos

### 3.1 Validade

Um grupo é válido se:

1. É conexo pela adjacência de 2.4.
2. Sem joker: soma das faces `=== 7`.
3. Com joker: `1 <= soma das faces fixas <= 6` (o joker toma o que falta).
   O joker nunca forma grupo sozinho.

### 3.2 Enumeração

O problema é enumerar **subgrafos conexos** com soma ≤ 7, cada um exatamente uma
vez. A abordagem ingénua (DFS a partir de cada célula) gera o mesmo grupo várias
vezes, uma por ordem de visita.

Solução — **enumeração por célula mínima**. Para cada célula `v`, enumeram-se
apenas os grupos em que `v` é a célula de menor índice:

```
para cada célula v (por ordem de índice empacotado):
    expandir(grupo = [v], extensão = vizinhos(v) com índice > v, raiz = v)

expandir(grupo, extensão, raiz):
    emitir grupo se válido (3.1)
    se soma(grupo) >= 7 e sem joker: parar          ← poda
    para cada w em extensão:
        extensão' = (extensão a partir de w, exclusive)
                    ∪ {vizinhos(w) com índice > raiz, fora do grupo e da extensão}
        expandir(grupo + [w], extensão', raiz)
```

Cada grupo conexo é emitido exatamente uma vez.

**Poda.** Como o mínimo é 1 e o alvo é 7, nenhum grupo passa de 7 células e nenhum
ramo continua depois de a soma atingir 7. O espaço é minúsculo — a enumeração
completa de um 6x6 corre na ordem das dezenas de microssegundos, o que é o que
torna viáveis os milhares de playouts da secção 7.

**Com joker:** o joker conta como 0 na soma. Um ramo que o contenha pode continuar
até a soma fixa chegar a 6.

### 3.3 API

```typescript
export function* findAllGroups(b: Board): Generator<Group>;
export function isValidGroup(b: Board, g: Group): boolean;
export function hasAnyGroup(b: Board): boolean;
```

`Group` é um `readonly number[]` de coordenadas empacotadas, **ordenado**. A
ordenação canónica permite comparar e desduplicar grupos sem esforço.

Dois detalhes que importam para a performance:

- `findAllGroups` é um **generator**. Quase todos os consumidores param cedo
  (escolher uma jogada aleatória, procurar a primeira solução) e materializar o
  array completo seria desperdício. Quem precisa de todos faz `[...findAllGroups(b)]`.
- `hasAnyGroup` tem implementação própria com saída imediata. É chamada a cada
  passo de cada playout e é o caminho mais quente de todo o pipeline.

### 3.4 Reutilização de buffers

Na versão inicial, alocar arrays novos a cada expansão. Só se o profiler acusar
pressão de GC nos playouts é que vale a pena reescrever a expansão com um buffer
partilhado e índice de profundidade. **Não otimizar isto antes de medir** — o
código com buffers é significativamente mais difícil de manter correto, e a
correção aqui é a garantia central do projeto.

---

## 4. Aplicação de jogada

### 4.1 Algoritmo

```
applyMove(board, group):
    1. validar o grupo (3.1) — lançar se inválido
    2. por cada coluna afetada: remover as células do grupo
    3. remover as colunas que ficaram vazias
    4. devolver o tabuleiro novo
```

O passo 2 é a gravidade e o passo 3 é o colapso. Não há mais nada.

```typescript
export function applyMove(b: Board, g: Group): Board;
```

Copiar apenas as colunas afetadas; as restantes podem ser partilhadas por
referência, já que são imutáveis. Uma jogada toca em 1–4 colunas, portanto o custo
é proporcional ao grupo e não ao tabuleiro.

### 4.2 Pós-condições verificáveis

Alvos naturais para testes de propriedade:

- `soma(novo) === soma(antigo) - 7` (contando o joker pelo valor que tomou)
- `contagem(novo) === contagem(antigo) - grupo.length`
- o novo tabuleiro respeita as invariantes de 2.2
- a ordem relativa das peças não removidas é preservada

A última é a propriedade que torna a construção reversa possível (4.2 do plano) e
merece um teste explícito.

### 4.3 Clarificação: cascatas não eliminam automaticamente

O plano (2.4) menciona cascatas. **No motor, uma cascata não é uma eliminação
automática.** Se novos grupos se formarem após uma jogada, ficam disponíveis — mas
só desaparecem se o jogador os escolher.

A razão é de correção, não de gosto: eliminações automáticas seguiriam um caminho
que o jogador não escolheu, e podiam levar o tabuleiro a um estado bloqueado. Isso
destruiria a garantia de terminabilidade que sustenta todo o desenho.

"Cascata" e "combo" pertencem portanto à camada `GameSession`, medidos pelo
intervalo entre jogadas do jogador, e não ao motor.

---

## 5. Solver

### 5.1 Responsabilidades

```typescript
export function isSolvable(b: Board, limits?: Limits): Verdict;
export function findSolution(b: Board, limits?: Limits): Group[] | null;
export function isGreedySafe(b: Board, limits?: Limits): Verdict;

export type Verdict = "yes" | "no" | "inconclusive";
```

`Verdict` com três valores, não `boolean`. O gerador vai chamar isto milhares de
vezes e um caso patológico não pode parar o pipeline: `"inconclusive"` significa
que se atingiu um limite, e o candidato é descartado.

### 5.2 Algoritmo

DFS com memoização de **estados falhados**:

```
resolver(board, memo):
    se board vazio: sucesso
    se boardKey(board) em memo: falha    ← já se provou que não leva a lado nenhum
    para cada grupo em findAllGroups(board):
        se resolver(applyMove(board, grupo)): sucesso
    memo.add(boardKey(board))
    falha
```

A memoização é o que torna isto viável: jogadas independentes comutam, portanto o
mesmo estado é alcançado por muitos caminhos diferentes (5.3 do plano).

**Profundidade de recursão.** Cada jogada retira pelo menos 2 peças, portanto a
profundidade máxima é `peças / 2` — cerca de 25 num tabuleiro grande. Muito abaixo
do limite de stack do V8. Recursão direta é segura, não é preciso versão iterativa.

**Limites obrigatórios:** número máximo de estados visitados e orçamento de tempo.

### 5.3 Greedy-safe

Para o modo tempo (6.3 do plano) é preciso provar que **nenhum** estado alcançável
é um beco sem saída: explorar todos os estados alcançáveis e confirmar que nenhum
tem peças sem grupos válidos.

Bastante mais caro que `isSolvable`, e só aplicável a tabuleiros pequenos — que
são precisamente os do modo tempo. Manter limite explícito e tratar o excesso como
`"inconclusive"`.

### 5.4 Ordenação de jogadas

Para `findSolution`, experimentar primeiro os grupos maiores tende a encontrar
solução mais depressa (reduzem mais o tabuleiro por jogada). Para `isGreedySafe` a
ordem é irrelevante — tudo tem de ser visitado.

---

## 6. Gerador

### 6.1 Construção reversa

```
gerar(seed, alvoDePeças, params):
    board = []
    passos = []
    enquanto contagem(board) < alvoDePeças:
        composição = escolher da distribuição (2.3 do plano)
        para cada tentativa de posição (limite N):
            candidato = inserir(board, composição, posição)
            se validar(candidato, grupo, board):
                board = candidato
                passos.push(grupo)
                break
        se nenhuma posição funcionou: recuar um passo ou reiniciar
    devolver { board, solução: passos.reverse() }
```

### 6.2 Inserção

Inserir um grupo significa acrescentar células empurrando as existentes:

- **Dentro de uma coluna**, no índice `r`: tudo a partir de `r` sobe uma posição.
- **Coluna nova**, no índice `c`: as colunas a partir de `c` deslocam-se para a
  direita.

Um mesmo grupo pode combinar as duas coisas.

### 6.3 Validação — o passo que não se pode saltar

```typescript
const simulado = applyMove(candidato, grupoInserido);
aceitar = boardKey(simulado) === boardKey(board) && isConnected(candidato, grupoInserido);
```

Não basta inserir com cuidado. A gravidade e o colapso de colunas não são
inversíveis por construção — inserir numa posição plausível pode produzir um
tabuleiro que, ao aplicar a jogada para a frente, **não** devolve o anterior. Só a
simulação direta prova a inversão.

**É desta verificação que vem toda a garantia do jogo.** Se falhar, os níveis podem
ser impossíveis, que é a única coisa que este desenho existe para evitar.

### 6.4 Joker

Ao construir um dos passos, marcar uma célula como joker (valor `0`), no máximo
uma por tabuleiro. O valor que essa célula tinha na composição fica registado como
o **valor verdadeiro** do joker (2.6 do plano) — útil para o tutorial e as dicas.

A propriedade de 2.6 confirma-se sozinha: `soma das fixas + valorVerdadeiro` é
múltiplo de 7 por construção.

Para os níveis de estrangulamento, colocar o joker num passo **tardio** da
construção reversa (ou seja, cedo na solução do jogador) tende a criar
dependências mais fortes. Confirmar com as métricas, não assumir.

### 6.5 Parâmetros

| Parâmetro | Efeito (4.4 do plano) |
|---|---|
| `compositionWeights` | Peso de cada uma das 14 composições |
| `newColumnProbability` | Largura vs. altura do tabuleiro |
| `insertionDepthBias` | Preferir o fundo de colunas altas → mais dependências |
| `targetPieceCount` | Tamanho do tabuleiro |
| `silhouetteProfile` | Perfil de alturas alvo, opcional |
| `includeJoker` | Ativa 6.4 |

Nenhum destes *determina* a dificuldade. Só a desloca em distribuição — a
dificuldade mede-se depois (secção 7).

---

## 7. Medição

### 7.1 Aleatoriedade semeada

JavaScript não tem PRNG semeável nativo. Implementar um pequeno e explícito
(mulberry32 ou xorshift128 servem), passado como parâmetro:

```typescript
export type Rng = () => number;              // [0, 1)
export function mulberry32(seed: number): Rng;
```

Nunca `Math.random()` dentro da `engine`. Sem isto, nada é reproduzível — e a
reprodutibilidade é o que sustenta as seeds determinísticas, o puzzle diário e os
leaderboards justos (4.3 do plano).

### 7.2 Playouts

```typescript
export function measureSurvival(b: Board, runs: number, seed: number): SurvivalResult;
```

`runs` playouts, escolhendo um grupo válido ao acaso a cada passo, contando
quantos chegam ao tabuleiro vazio.

**Paralelismo:** `worker_threads` no Node, no pacote `tools`. A `engine` mantém-se
single-threaded e agnóstica — expõe a função, quem paraleliza é o pipeline.

Cada playout recebe uma **seed derivada** da seed base (ex. `seed + índice`), para
que o resultado seja idêntico independentemente do escalonamento dos workers.

### 7.3 Métricas recolhidas

| Métrica | Recolha |
|---|---|
| Taxa de sobrevivência | Fração de playouts que terminam |
| Branching factor médio | Média do nº de grupos válidos por estado visitado |
| Profundidade do primeiro erro fatal | Índice da jogada após a qual o playout falhou |
| Densidade de jogadas | Grupos válidos ÷ peças restantes |
| Tamanho médio do grupo | Média de `grupo.length` nas jogadas feitas |
| Comprimento da solução | Do solver |

Recolher tudo num único varrimento de playouts, não em passagens separadas.

### 7.4 Piso de justiça

Verificação obrigatória antes de publicar um nível (6.2 do plano): as primeiras
2–3 jogadas têm de ser seguras qualquer que seja a escolha. Implementa-se com uma
busca em largura limitada à profundidade 3, confirmando que todos os estados a
essa profundidade continuam resolúveis.

### 7.5 Pipeline offline

```
gerar N candidatos → medir todos → filtrar por banda → exportar level pack
```

CLI no pacote `tools`, corrido uma vez, fora do jogo. O jogo em produção nunca
gera nem mede nada — carrega JSON estático.

---

## 8. Formato de nível

```json
{
  "id": "mid-0142",
  "seed": 8837462,
  "board": [[3,4,1],[2,5,2,1],[6,1],[4,3,0]],
  "joker": { "at": [3, 3], "trueValue": 3 },
  "solution": [[192, 193], [256, 257]],
  "metrics": {
    "pieces": 12,
    "survivalRate": 0.34,
    "avgBranching": 5.2,
    "firstFatalDepth": 4.1,
    "solutionLength": 6
  },
  "band": "advanced"
}
```

`board` é literalmente o tipo `Board` — sem serializador. `solution` usa
coordenadas empacotadas (2.5).

Guardar a `seed` **e** o tabuleiro explícito: a seed serve de identidade estável e
de rastreio, mas o tabuleiro explícito protege contra alterações futuras no
gerador que mudariam o que a seed produz.

Um level pack é um array destes objetos, servido como ficheiro estático e
incluído no bundle da app.

---

## 9. Plano de testes

Ferramentas: **Vitest** para execução, **fast-check** para testes de propriedade.

### 9.1 Testes de exemplo

Tabuleiros pequenos escritos à mão, com o resultado esperado. Cobrir:

- Eliminação de par simples
- Gravidade dentro de uma coluna
- Colapso de uma coluna, e de várias em simultâneo
- Grupo em L, em T, em S
- Grupo de 7 peças (sete 1s)
- Grupo com joker
- Joker sozinho → inválido
- Estado bloqueado (peças presentes, nenhum grupo)
- Silhueta: adjacência lateral inexistente por diferença de altura

Como `Board` é JSON, estes testes escrevem-se como literais legíveis, o que os
torna bons como documentação executável.

### 9.2 Testes de propriedade

Com entradas geradas, verificar invariantes em vez de valores concretos:

| Propriedade |
|---|
| Após qualquer jogada, a soma desce exatamente 7 |
| Após qualquer jogada, as invariantes de 2.2 mantêm-se |
| Todo o grupo devolvido por `findAllGroups` passa `isValidGroup` |
| `findAllGroups` não devolve duplicados |
| Todo o tabuleiro gerado é resolvido pela solução guardada |
| Um tabuleiro greedy-safe nunca bloqueia em 10 000 playouts |
| A soma total de um tabuleiro gerado é múltipla de 7 |

A penúltima linha da tabela é o teste mais valioso do projeto: é a garantia
central, verificada empiricamente.

### 9.3 Teste de ida-e-volta do gerador

Para cada tabuleiro gerado, aplicar a solução guardada passo a passo e confirmar
que termina vazio. Barato, e apanha qualquer erro na inversão de 6.3.

Correr sobre alguns milhares de tabuleiros em CI.

---

## 10. Ordem de implementação

| Fase | Entrega | Prova que |
|---|---|---|
| 1 | Tipos, adjacência, `applyMove` + testes 9.1 | As regras estão certas |
| 2 | `findAllGroups` + testes de propriedade | A deteção é completa e sem duplicados |
| 3 | `solver` com memoização | Dá para responder "tem solução?" |
| 4 | `generator` + teste de ida-e-volta 9.3 | **Os níveis são sempre resolúveis** |
| 5 | Métricas + pipeline CLI | Dá para classificar dificuldade |
| 6 | Renderer de consola no `tools` | Dá para jogar e sentir a mecânica |
| 7 | UI web | — |
| 8 | Capacitor, IAP, push | — |

A **fase 4 é o marco real**. A partir dela a ideia está provada; tudo o resto é
construção.

A **fase 6 vale o desvio**. Um renderer de texto com entrada por coordenadas
permite jogar dezenas de tabuleiros numa tarde e responder à pergunta que nenhuma
métrica responde: se o colapso de colunas é possível de antecipar mentalmente
(risco nº 1 da secção 8 do plano). São poucas horas de trabalho antes de existir
uma única linha de UI.

---

## 11. Riscos técnicos

| Risco | Mitigação |
|---|---|
| Erro na inversão do gerador → níveis impossíveis | Validação por simulação (6.3) + ida-e-volta (9.3), sem exceções |
| Explosão de estados no solver em tabuleiros grandes | Limites explícitos + `"inconclusive"`; descartar candidato |
| `Math.random()` infiltra-se na engine | Regra de lint que o proíbe no pacote `engine` |
| Playouts não reproduzíveis em paralelo | Seed derivada por playout, nunca partilhada entre workers |
| Pressão de GC nos playouts | Coordenadas empacotadas (2.5); buffers só depois de medir (3.4) |
| Sensação não-nativa no build empacotado | Safe areas, sem bounce de scroll, haptics ao tocar, transições que não pareçam navegação web |
| App recusada por parecer "só um website" | Lógica e níveis locais; funcionar offline de raiz — o que é natural, já que os níveis são JSON estático |
| Leaderboards exigem backend | Game Center e Play Games cobrem o básico sem servidor próprio |
