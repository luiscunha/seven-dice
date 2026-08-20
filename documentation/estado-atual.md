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
lint + typecheck + testes: **249 testes, ~15 s**. Se demorar muito mais do que
isso, ver "Armadilhas" no fim.

Leituras, por esta ordem:

1. `CLAUDE.md` — as cinco regras invioláveis do motor e os quatro algoritmos que
   não se improvisam.
2. `documentation/plano-implementacao.md` — o plano vivo. Cada fase concluída
   traz as decisões que foram tomadas durante a execução e os critérios que
   foram verificados.
3. Este ficheiro.

Os documentos de origem — `spec-motor-septet.md` e `plano-modelo-jogo-septet.md` —
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
| 7 | Camada de sessão | ✅ |
| 8 | UI web | por começar ← **é aqui que se avança** |
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

**O teto da seleção com joker é `7 − valor do joker`, não 6.**

O modelo de interação do plano §3.1 — tocar-a-acumular, elimina ao chegar a 7 —
parecia incompatível com o joker: `isValidGroup` aceita qualquer soma fixa entre
1 e 6, portanto a seleção ficava válida à primeira peça encostada e o joker
gastava-se ao valor que essa peça deixasse. A primeira correção foi um botão de
confirmação.

**Era a solução errada para o problema certo.** Como o valor do joker está
globalmente determinado (§2.6), também está determinada a soma correta das fixas.
Pondo o teto aí, o joker acumula-se e elimina como qualquer outro grupo: sem
botão, sem mostrar o valor, e sem maneira de o gastar mal — porque juntar mais
peças só aumenta a soma, e nunca há duas seleções válidas diferentes.

O que se perde é a jogada que mata o tabuleiro em silêncio, que o §2.6 desenhou
de propósito. Perde-se por escolha: já era incompatível com o piso de justiça
(ver "contrariou os documentos" nº 2), e a decisão que torna o joker interessante
mantém-se — continua a ser preciso descobrir **qual** grupo atinge o alvo.

Consequência: **o tutorial dedicado ao joker do §2.6 deixa de ser necessário.**

## O que se segue

A **Fase 8** — UI web. A Fase 7 está feita: `packages/game/src/session/` tem
`GameSession`, os dois modos, combos, pontuação e perfil, sem uma linha de DOM e
sem uma leitura do relógio do sistema.

Três coisas que a UI vai consumir e convém não redescobrir:

- **`tap` não elimina automaticamente quando há joker na seleção** — `commit`
  fecha-a. Repetir o disparo automático na UI reintroduz o defeito da Fase 6.
- **`jokerInSelection`** devolve o par *valor que o joker toma* / *valor que tem
  de valer*. É o que permite avisar antes de o jogador matar o tabuleiro.
- **`isPending`** distingue um convite de um erro. Na consola isso foi a
  diferença entre `▸` e `⚠`, e foi o que destravou o jogador.

O tempo entra por parâmetro e o armazenamento por interface (`ProfileStorage`,
que o `localStorage` satisfaz tal como está) — a Fase 9 troca-o por armazenamento
nativo sem tocar na sessão.

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

### 5. As faces não aparecem todas com a mesma frequência, nem de perto

Notado a jogar — *"porque nunca aparece a face 6?"* — e medido no pack:

| Face | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Frequência | **36,0%** | 21,3% | 20,1% | 10,9% | 6,7% | **4,0%** |

São **duas causas independentes**, e convém não as confundir:

**Estrutural.** Das 14 composições de 7, só `[1,6]` contém um 6 — e as
composições longas são feitas de 1 e 2, contribuindo muitas células cada vez que
saem. Com pesos uniformes, o previsto é 56,6% de uns e 1,9% de seises.

**O filtro da banda.** Um 6 tem um único parceiro, portanto tabuleiros com seises
são rígidos e sobrevivem menos. Medido na `inicio`, que exige sobrevivência
≥ 0,55: **6,1% de seises nos gerados, 0,9% nos aceites.** Não é defeito — é a
alavanca de dificuldade a funcionar.

Corolário contraintuitivo: **a banda onde se veem mais seises é o `tutorial`**, com
16,6% e distribuição perfeitamente igual entre as seis faces. Só tem pares, e os
pares que somam 7 são `1+6`, `2+5`, `3+4` — cada face uma vez.

Isto expôs um defeito de contabilidade no `facesAltas()` das bandas `avancado` e
`perito`: pesava composições e não células, portanto `[1,1,1,1,1,1,1]` saía com o
mesmo peso de `[1,6]`. O rótulo "faces altas" não se cumpria no tabuleiro — a
`perito` tinha 42,9% de uns. Corrigido a dividir o peso por `length`.

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

## Medição em duas fases — decidida e implementada

Vinha do PR #5 sem decisão. Ficou **implementada e ligada por omissão** a
2026-08-20. Cada candidato leva agora 100 playouts contra a banda alargada, e só
os sobreviventes levam os 1000.

O que a torna segura não é a precisão da amostra curta — é onde ela vive. A
resolubilidade vem da ida-e-volta, que corre **antes**, e do piso de justiça, que
corre **depois**; a sobrevivência é uma métrica de dificuldade. O pior que o
atalho pode fazer é descartar um candidato bom, e isso só custa procurar mais uma
seed, porque o pipeline avalia até a banda encher. **A garantia central não é
tocada.**

Medido em 64 candidatos por banda, nas oito:

| | Playouts | Descartes falsos |
|---|---|---|
| Margem fixa 0,15 | −31% | 0 em 512 |
| **Margem 3σ no extremo** | **−37%** | **0 em 512** |

A margem fixa era ingénua: o erro de amostragem de uma proporção colapsa perto de
0, e uma margem constante é generosa de mais exatamente onde as bandas são
estreitas. Com 0,15, a `meio-joker` ficava **−7%** — pior do que não ter
pré-filtro. Com 3σ calculados no próprio extremo, nenhuma banda perde.

A poupança é muito desigual, e é bom saber porquê: `tutorial`, `tempo` e `perito`
poupam 60–70%, porque os candidatos caem longe da banda; `meio-joker` e `denso`
poupam ~0%, porque as bandas são estreitas e perto de zero, e porque as rejeições
delas são dominadas pelo piso de justiça, que corre depois da medição e o
pré-filtro não alcança.

Validação de ponta a ponta: as oito bandas construídas pelos dois caminhos dão um
pack **idêntico byte a byte**.

Duas ressalvas honestas:

- **O relógio não serve para medir isto.** A mesma banda `perito`, com trabalho
  idêntico, levou 88,1 s numa corrida e 49,5 s noutra. A grandeza fiável é a
  contagem de playouts, não o tempo.
- **Os percentis de calibração ficam mais ruidosos.** A `survivalRate` guardada
  numa rejeição do pré-filtro é a estimativa curta. Como essas taxas alimentam os
  p10/mediana/p90 que se usam para recalibrar bandas, as caudas ficam um pouco
  mais largas. Quem recalibrar bandas a sério deve correr com `--pre 0`.

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
pnpm check                                    # lint + typecheck + 249 testes
pnpm septet bands                               # as bandas e os seus critérios
pnpm septet play --id inicio-000296 --log p.jsonl # jogar um nível na consola
pnpm septet verify                              # revalida o pack todo
pnpm septet build --count 30 --runs 1000        # reconstrói o pack (--pre 0 desliga o pré-filtro)
```
