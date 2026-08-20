# Estado atual — ponto de partida

> Este documento existe para que uma sessão nova, noutra máquina, arranque com o
> mesmo contexto que a sessão que construiu isto. Não substitui o
> `plano-implementacao.md` — complementa-o com o que **não** se lê no código nem
> no histórico do git.
>
> Última atualização: 2026-08-20, com o gate da Fase 6 fechado a **Verde**.

---

## Arranque

```bash
git clone https://github.com/luiscunha/seven-dice.git
cd seven-dice
pnpm install
pnpm check
```

Node ≥ 20, pnpm 11.22.0 (fixado em `packageManager`). O `pnpm check` corre
lint + typecheck + testes: **197 testes, ~20 s**. Se demorar muito mais do que
isso, ver "Armadilhas" no fim.

Leituras, por esta ordem:

1. `CLAUDE.md` — as cinco regras invioláveis do motor e os quatro algoritmos que
   não se improvisam.
2. `documentation/plano-implementacao.md` — o plano vivo. Cada fase concluída
   traz as decisões que foram tomadas durante a execução e os critérios que
   foram verificados.
3. Este ficheiro.

Os documentos de origem — `spec-motor-sete.md` e `plano-modelo-jogo-sete.md` —
mantêm-se como estavam. **Não foram corrigidos**, e em quatro pontos estão
contrariados por medições. Ver "Onde a realidade contrariou os documentos".

---

## Onde estamos

| Fase | | |
|---|---|---|
| 0 | Andaime | ✅ |
| 1 | Tabuleiro, adjacência e jogada | ✅ |
| 2 | Deteção de grupos | ✅ |
| 3 | Solver | ✅ |
| 4 | Gerador | ✅ |
| 5 | Métricas e pipeline | ✅ |
| 6 | Renderer de consola | ✅ **gate fechado a Verde** |
| 7 | Camada de sessão | por começar ← **é aqui que se avança** |
| 8 | UI web | por começar, desbloqueada |
| 9 | Empacotamento | por começar |

O motor está completo e é puro: `packages/engine/src/` não importa nada de Node,
não toca no DOM e não chama `Math.random()` — há regras de ESLint que o impõem,
não é convenção.

Existe um pack verificado em `packages/tools/out/level-pack.json`: **240 níveis,
8 bandas de 30**, todos com solução guardada e validada por simulação direta.

---

## O gate da Fase 6 — fechado a Verde

O critério era humano, e é o risco nº 1 do plano §8:

> Num tabuleiro de 4x4, consegues planear 2–3 jogadas à frente?

Consegue-se. Oito sessões, registadas em `playtest.jsonl`:

| Nível | Peças | Sobrevivência | Previsões | Selo |
|---|---|---|---|---|
| `inicio-000296` | 18 | 0.625 | **6/6** | perfeito |
| `inicio-000256` | 24 | 0.708 | **8/8** | perfeito |
| `meio-000015` | 28 | 0.476 | **9/9** | perfeito |
| `perito-000014` | 37 | 0.083 | **12/12** | perfeito |
| `meio-joker-000013` | 27 | 0.079 | *(joker)* | perfeito |

**35/35, zero undos, zero bloqueios**, incluindo silhuetas e grupos de 5 a 7 peças
onde uma em cada doze sequências aleatórias sobrevive. A regra de reorganização
fica, e com ela tudo o que está construído a partir da Fase 1.

O passo 3 do protocolo — repetir com o modo de dois passos — não chegou a ser
preciso: existia para separar Verde de Amarelo, e a taxa já estava no máximo sem
ajuda. Animar gravidade e colapso em separado continua **recomendado** na Fase 8,
mas não é requisito.

Cuidado com uma leitura fácil: o número de jogadas de uma resolução não mede nada.
Como cada jogada remove exatamente 7, qualquer tabuleiro limpo leva sempre
`soma/7` jogadas. O sinal está em chegar ao fim sem desfazer.

### Os dois achados que mudam a Fase 8

**A eliminação automática é incompatível com o joker.** O modelo de interação do
plano §3.1 — tocar-a-acumular, elimina ao chegar a 7 — gasta o joker com a
primeira peça que lhe encostem, ao valor que essa peça deixar, porque
`isValidGroup` aceita qualquer soma fixa entre 1 e 6. O tabuleiro fica insolúvel
em silêncio e só falha no fim. A consola passou a exigir confirmação (`x`) quando
há joker na seleção; **a UI da Fase 8 herda o problema inteiro se repetir o
modelo**.

**O valor do joker não se descobre a jogar.** O plano §2.6 supõe que a dedução é
descobrível com o tutorial certo; medido, não é descoberta sem ele. A consola
mostra `joker = N` no cabeçalho, recalculado a cada jogada. Para o jogo, o
tutorial dedicado do §2.6 deixa de ser opcional.

## O que se segue

A **Fase 7** — camada de sessão. É lógica pura, sem UI: relógio, pontuação,
combos, selos e progressão, tudo o que a engine deliberadamente não sabe.

---

## Onde a realidade contrariou os documentos

Quatro conclusões medidas que contrariam a spec ou o plano. Estão em comentários
no código e nas mensagens de commit; ficam aqui reunidas porque são o tipo de
coisa que se volta a descobrir do zero se ninguém as escrever.

### 1. A hipótese do joker da spec §6.4 está refutada

A spec previa que colocar o joker tarde na construção reversa produzisse níveis
mais difíceis. Mede-se o contrário: colocação tardia dá **sobrevivência
0,329 ± 0,017**, colocação cedo dá **0,226 ± 0,006**. Sobrevivência mais alta é
mais fácil. O parâmetro `jokerProgress` existe por isto, com omissão **0.3** —
cedo — e a tabela medida está em comentário no `generator.ts`.

### 2. O plano §6.2 e o §2.6 são incompatíveis entre si

O piso de justiça (§6.2) exige que todos os estados alcançáveis até profundidade
*d* continuem resolúveis. O desenho do joker (§2.6) faz precisamente o oposto:
gastar o joker mal mata o tabuleiro. Medido: **40 em 40** níveis com joker têm
uma primeira jogada fatal envolvendo o joker; a banda aceitou **0 em 8128**
candidatos.

Resolvido com `skipJokerMoves`, que exclui as jogadas com joker do piso —
seguindo a mitigação que o próprio §2.6 propõe (tutorial dedicado + desfazer, não
o piso). As bandas `meio-joker` e `denso` usam-no.

### 3. O tamanho não é alavanca de dificuldade — o joker é

Passar de 12 para 49 peças custa **−0,31** de sobrevivência. Pôr **um** joker em
12 peças custa **−0,77**.

Corolário que inverte o plano §7: a tabela de bandas alarga as composições à
medida que a dificuldade sobe, mas composições largas são feitas de 1 e 2 e
tornam os tabuleiros *mais fáceis*. Com todas as composições, a banda `avancado`
era a mais fácil do pack. As composições aceites por banda em `bands.ts` já
refletem a medição, não a tabela original.

### 4. O piso de justiça a profundidade 3 é inviável

A severidade escala com ramificação^profundidade. Em tabuleiros com forma
correta, a profundidade 3 rejeitava **1840 em 1856**. Todas as bandas usam
`fairnessDepth: 2` (a `tempo` usa 0), que o plano §6.2 permite explicitamente.

---

## Decisões de arquitetura que não se leem no código

- **O tabuleiro é uma lista de colunas, de baixo para cima.** A gravidade é um
  `filter` sobre a coluna; o colapso é não empurrar a coluna vazia. As colunas
  intactas são partilhadas por referência. O tabuleiro *é* JSON válido.
- **O estado intermédio de uma jogada não é representável como `Board`** — tem
  buracos, e a representação por colunas torna isso impossível. Por isso o modo
  de dois passos vive só em `render.ts` (opção `removidas`), e não no motor.
- **O piso de justiça só corre o solver na fronteira final**, não em cada estado
  visitado. É uma equivalência: a insolubilidade herda-se para a frente, e os
  becos sem saída são apanhados a cada nível. Levou a banda `tutorial` de 18 s
  para 4,3 s.
- **`isGreedySafe` é iterativo**, ao contrário de `isSolvable` e `findSolution`,
  que recorrem — o grafo de estados dele é largo, não fundo.
- **O RNG é semeado com `deriveSeed(seed, i)` por playout**, e os resultados do
  pool são ordenados por seed. O output não depende do escalonamento nem do
  número de workers, e há um teste que o verifica.
- **O gerador trabalha com células marcadas** (`{value, inserida}`) para não ter
  de manter coordenadas através das inserções.
- **A dificuldade é medida, não desenhada.** Nenhuma banda declara uma
  dificuldade; declara um intervalo aceitável de sobrevivência, e o pipeline
  rejeita o que cai fora.

---

## Proposto e não implementado

**Medição em duas fases no pipeline.** Hoje cada candidato leva 1000 playouts.
A proposta é um pré-filtro de 100 playouts com a banda alargada, e só os
sobreviventes levam os 1000. Medido em 40 candidatos: **40/40 de concordância,
0 descartes falsos**.

Vale a pena porque o tempo está concentrado: o pack completo leva **922,4 s**, e
a banda `perito` sozinha leva **383,7 s**. Foi discutido no PR #5 e ficou sem
decisão.

---

## Modo de trabalho

- **Um branch por fase**, um commit com mensagem substantiva, push, e o PR é
  aberto e aprovado pelo Luís. (Exceção: este ficheiro foi diretamente para a
  `main`, a pedido.)
- **Teste de mutação como aceitação de cada fase** — introduzir uma alteração
  deliberada no código e confirmar que algum teste a apanha. Foi assim que se
  descobriu que havia testes de propriedade vazios na Fase 3 (o gerador de
  tabuleiros dava 178/200 insolúveis e **zero** resolúveis-mas-não-seguros).
- **Documentação e comentários em português europeu; identificadores em inglês.**
- **Não otimizar antes de medir** — e, quando medir, medir uma sonda pequena
  primeiro. Perdeu-se muito tempo na Fase 5 a correr o pipeline inteiro quatro
  vezes onde uma sonda de dois minutos teria chegado.

---

## Armadilhas conhecidas

- **`pnpm check` que parece pendurar.** Já aconteceu, e a causa foi um ficheiro
  de sondagem esquecido em `packages/tools/test/`. O `vitest.config.ts` exclui
  `**/__*.test.ts` por isso. Antes de suspeitar de paralelismo ou de workers,
  bissectar por ficheiro.
- **O Vitest não faz typecheck.** Um literal de tabuleiro sem anotação infere
  `number[][]` e passa nos testes enquanto o `tsc` falha. Anotar sempre
  `const b: Board = ...`; usar `as unknown as Board` só para tabuleiros
  deliberadamente inválidos.
- **Os Workers não herdam o loader do pai.** O `worker.ts` precisa de
  `execArgv: ["--import", "tsx"]` ou não resolve os módulos sob o Vitest.
- ~~O git avisa LF→CRLF em cada commit.~~ Resolvido: o `.gitattributes` fixa
  `* text=auto eol=lf`, portanto o comportamento é do repositório e não do
  `core.autocrlf` de cada máquina. Índice e cópia de trabalho em LF nos 59
  ficheiros versionados.

---

## Comandos

```bash
pnpm check                                    # lint + typecheck + 197 testes
pnpm sete bands                               # as bandas e os seus critérios
pnpm sete play --id inicio-000296 --log p.jsonl # jogar um nível na consola
pnpm sete verify                              # revalida o pack todo
pnpm sete build --count 30 --runs 1000        # reconstrói o pack (~15 min)
```
