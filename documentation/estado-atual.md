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
git clone https://github.com/luiscunha/dice-to-seven.git
cd dice-to-seven
pnpm install
pnpm check
```

Node ≥ 20, pnpm 11.22.0 (fixado em `packageManager`). O `pnpm check` corre
lint + typecheck + testes: **269 testes, ~20 s**. Se demorar muito mais do que
isso, ver "Armadilhas" no fim.

Leituras, por esta ordem:

1. `CLAUDE.md` — as cinco regras invioláveis do motor e os quatro algoritmos que
   não se improvisam.
2. `documentation/plano-implementacao.md` — o plano vivo. Cada fase concluída
   traz as decisões que foram tomadas durante a execução e os critérios que
   foram verificados.
3. Este ficheiro.

Os documentos de origem — `spec-motor.md` e `plano-modelo-jogo.md` —
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
| 8 | UI web | 🔨 **publicada** — falta só o playtest externo, que é o critério de aceitação |
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

**O valor do joker escolhe-se ao tocar nele.**

O modelo de interação do plano §3.1 — tocar-a-acumular, elimina ao chegar a 7 —
não encaixa no joker sem ajuda: como ele preenche o que faltar, a seleção fica
válida logo à primeira peça encostada, e o joker gasta-se ao valor que essa peça
deixar. A Fase 8 tentou três desenhos:

| Tentativa | Porque falhou |
|---|---|
| Disparo automático | O jogador nunca chegava a escolher o valor |
| Botão de confirmação | Obrigava a sair do tabuleiro; a razão do botão não se lia |
| Teto em `7 − valor obrigatório` | Removia a possibilidade de errar — ver abaixo |

**A terceira foi a mais instrutiva, e a mais perigosa.** Impedir o valor errado
parecia uma simplificação elegante: sem botão, sem números, sem tutorial. Mas
medido depois, exaustivamente, num tabuleiro de 12 peças da banda `denso`:

| Conjunto de jogadas | Sequências | Bloqueiam |
|---|---|---|
| Com o joker livre | 1175 | **77,0%** |
| Com o joker forçado ao valor certo | 279 | **3,2%** |

E na banda inteira, a sobrevivência passava de 0,141 para **0,957**. Toda a
dificuldade das bandas com joker vinha da possibilidade de o gastar mal — é a
medição nº 3 acima, lida ao contrário.

**A solução é escolher o valor no momento do toque.** Um seletor com as seis
faces abre em cima da peça; escolhido o valor, o joker comporta-se como uma peça
normal e elimina sozinho ao chegar a 7. A ambiguidade morre na origem, não é
preciso botão, e **a liberdade de errar mantém-se intacta**.

O valor obrigatório nunca aparece no ecrã: descobri-lo é o puzzle. E o tutorial
dedicado do §2.6 continua a fazer falta — ensina a regra, não a resposta.

**Lição de método:** a segunda medição do gate da Fase 6 — "o valor do joker não
se descobre a jogar" — foi tirada com um defeito presente e está contaminada.
Quando uma conclusão de playtest vier de uma sessão onde algo estava partido,
remede-se antes de a tratar como facto.

## O que se segue

A **Fase 8** está construída e **publicada**:

```
https://luiscunha.github.io/dice-to-seven/
```

Home, **Puzzles** (campanha em cinco capítulos, com grelha e selos),
**Contra-Relógio** e definições. Publica-se por botão em Actions → Publicar, e o
`pnpm check` corre antes; se falhar, não publica.

**Falta o playtest externo**, que é o que o critério de aceitação pede antes de
qualquer trabalho de empacotamento. Confirmado a jogar num iPhone 17e: o 7×7 do
Perito lê-se e toca-se bem num dos ecrãs mais estreitos que há.

```bash
pnpm dev     # localhost:5173
```

As rotas vivem no fragmento — `#/puzzles/perito`, `#/jogo/perito/27`,
`#/contrarrelogio`.
É o que faz o jogo publicado correr em alojamento estático sem uma linha de
reescritas, e o que dá endereço a cada ecrã: no playtest, um link leva a pessoa
exatamente ao nível de que se está a falar. A forma antiga, `?banda=…&nivel=…`,
continua a funcionar.

O critério de aceitação da fase é *campanha inicial jogável ponta a ponta, com os
dois modos, num link partilhável*. Contra ele falta, por ordem:

| | | |
|---|---|---|
| 1 | Tutorial do joker | ✅ |
| 2 | Forma dos tabuleiros — metade cheios | ✅ |
| 3 | Home, campanha em capítulos, definições | ✅ |
| 4 | Contra-Relógio | ✅ |
| 5 | Link partilhável, para o playtest externo | ✅ |

O mapa de progressão, o perfil, as definições e o puzzle diário ficam **depois**
da marca do playtest (desenho §8) e não bloqueiam a Fase 9.

Uma coisa por resolver, que veio de jogar e ainda não tem decisão. É mais barata
antes do playtest externo do que depois — regerar bandas depois de alguém jogar
invalida o que essa pessoa jogou:

- **A dificuldade chega sempre aos ~78% do jogo**, em todas as bandas. No
  `perito` são 15 jogadas com a primeira fatal à décima segunda. Não é afinável:
  em 250 candidatos, o melhor está nos 65%. A ramificação de 33 grupos por jogada
  não deixa errar cedo. Ver "O que fica por decidir".

---

## O tutorial do joker — feito

O plano §2.6 chama-lhe obrigatório, e é a mitigação nomeada do risco *"joker mal
usado mata o tabuleiro"*. Ficou mais necessário do que estava: com o joker livre
restaurado, voltou a ser possível matar o tabuleiro em silêncio, e sem tutorial
isso lê-se como defeito e não como puzzle.

**É um tabuleiro a sério, de quatro peças** — `[[0, 4], [5, 3]]`, joker a valer 2,
duas jogadas. Tem duas saídas boas e uma má: gastar o joker com o 4 soma 7, o
jogo aceita, e sobram 5 e 3 — soma 8, zero grupos, sem joker para corrigir. Morre
numa jogada, à frente do jogador, e o ecrã nomeia o que aconteceu sem o
repreender.

A conta aparece **com números, uma vez**: `as faces somam 12` · `faltam 2 para 14`
· `que é 7 × 2 → ✳ = 2`.

**O andaime.** Aplicar a regra exige a soma do tabuleiro, e somar 27 faces de
cabeça no telemóvel não é um puzzle, é trabalho. O cabeçalho mostra
`faces somam N` nos **três primeiros níveis com joker que o jogador completar**, e
nunca mais — nem no `denso`, que é dedução pura. O número não dá a resposta:
continua a ser o jogador a fechar a conta.

Detalhes de desenho e o porquê de cada um: `desenho-fase-8.md` §5.4.
`packages/game/test/tutorial.test.ts` verifica contra a engine as três coisas que
o tabuleiro promete ensinar.

---

## A forma dos tabuleiros — metade cheios

Até aqui os tabuleiros nunca enchiam: preenchimento de 65–73% em todas as bandas,
silhueta sempre recortada, e a forma média do `perito` era 6,9 × 9,0 — mais alta
do que larga. Nunca saía um 7×7.

O `silhouetteProfile` existia no gerador desde a Fase 4 e **nenhuma banda o
usava**. Passou a usar-se, e metade dos níveis de cada banda são agora retângulos
cheios.

### O que a medição decidiu

Três medições, a 2026-08-21, antes de mexer numa linha de banda.

**Encher não custa dificuldade.** Comparando o mesmo tamanho com e sem perfil, a
sobrevivência mediana é a mesma dentro do ruído — e se pende, pende para mais
difícil:

| | com perfil | sem perfil |
|---|---|---|
| `meio` 5×5 | 0,497 | 0,520 |
| `meio` 6×6 | 0,287 | 0,323 |
| `perito` 7×7 | 0,113 | 0,127 |

**Encher não custa aceitação.** Sete configurações, 300 candidatos cada: média de
**16,3% de aceites sem perfil contra 15,0% com**. Quem rejeita a maioria dos
tabuleiros cheios é o piso de justiça — e rejeita qualquer tabuleiro na mesma
medida. Era a hipótese que faltava excluir.

**Sem perfil não há nada a filtrar.** Zero tabuleiros cheios em 300 candidatos em
cinco das sete configurações. Não é uma preferência que se satisfaça filtrando o
que já se gerava.

**O custo é a raridade da forma, e depende do número de colunas** — o gerador
constrói coluna a coluna, e quantas menos houver mais fácil é fechá-las todas à
mesma altura. Daí que `perito` 5×7 saia quatro vezes mais que 7×5, com as mesmas
35 peças:

| Colunas | Cheios em 200 candidatos |
|---|---|
| 3 | ~96 |
| 4 | ~45 |
| 5 | ~25 |
| 6 | ~8 |
| 7 | ~6 |

### O que ficou no pack

| Banda | Cheios | Formas |
|---|---|---|
| `inicio` | 15/30 | 4×4 ·7 · 4×5 ·8 |
| `meio` | 15/30 | 5×5 ·7 · 5×6 ·8 |
| `meio-joker` | 15/30 | 4×6 ·7 · 5×5 ·8 |
| `avancado` | 15/30 | 5×6 ·7 · 6×6 ·8 |
| `perito` | 15/30 | 5×7 ·5 · 6×7 ·5 · **7×7 ·5** |
| `denso` | 15/30 | 3×4 ·7 · 3×5 ·8 |

`tutorial` e `tempo` ficaram como estavam: exigem sobrevivência de 100% e prova
exaustiva de greedy-safe, e é aí que encher luta mais contra a aceitação —
1 aceite em 91 tabuleiros cheios do tutorial, contra 6% de base.

### As duas peças que isto obrigou a existir

**A rejeição por forma.** O perfil é uma *preferência* do gerador, não uma
garantia. Sem verificar que o tabuleiro saiu mesmo cheio, "metade cheios"
degenerava em "metade tentados, quase todos recortados" — e o pack ficaria igual
ao antigo. É a sexta razão de rejeição, e corre antes da ida-e-volta e de
qualquer playout, portanto é barata. Não toca em nenhuma garantia: a
resolubilidade continua a vir da ida-e-volta e do piso de justiça.

**A quota por forma.** Cada banda constrói-se agora em várias passagens — uma de
forma livre e uma por cada forma cheia, cada uma com a sua faixa de seeds, porque
a seed é a identidade do nível. Misturar as seeds e deixar a proporção ao acaso
dava um pack dominado pelas formas baratas: um `denso` 3×4 custa 12 candidatos e
um `perito` 7×7 custa 150, e é precisamente o 7×7 que se quer garantido.

### O que a geração corrigiu das medições

**O `meio-joker` 5×5 dá.** No funil tinha dado zero aceites em 27 tabuleiros
cheios. Ficou na rotação por o zero ser amostra pequena, e saíram os oito. Era
ruído.

**O `inicio` é três vezes mais caro do que estimado** — ~400 candidatos por nível
cheio, não ~150. A razão está nos seus próprios números: os tabuleiros cheios
desta banda têm mediana de sobrevivência **0,42**, e a banda exige **0,55 para
cima**. Foi preciso dar-lhe seis vezes mais orçamento, e daí vem o `--max` do
`dicetoseven build`.

---

## Bandas e capítulos são coisas diferentes

Estavam a ser a mesma, e isso pôs sete entradas na lista de níveis — duas delas,
`meio-joker` e `denso`, bandas **inteiras** de joker. O plano §7 diz o
contrário: o joker "aparece esporadicamente — não em todos os tabuleiros".

A campanha passa a mostrar **cinco capítulos**, com o joker intercalado um em
cada três níveis:

| Capítulo | Base | Joker intercalado | Níveis |
|---|---|---|---|
| Tutorial | `tutorial` | — | 30 |
| Iniciado | `inicio` | — | 30 |
| Médio | `meio` | `meio-joker` | 45 |
| Avançado | `avancado` | `denso` | 45 |
| Perito | `perito` | — | 30 |

Os dois modos chamam-se **Puzzles** e **Contra-Relógio**. O segundo arranca com
60 segundos por omissão, e o valor está nas definições — 30, 60 ou 90. O plano
§6.3 pede um arranque generoso mas não diz quanto, e isso é número de playtest.

**As bandas não se fundem, e não é preguiça.** A `meio` aceita sobrevivência de
30–55% e a `meio-joker` de 2–15%; nenhum tabuleiro cumpre as duas, porque um
joker sozinho leva a sobrevivência de 0,83 para 0,20. A separação é uma restrição
de *geração*. A apresentação não a tem — daí viver em `capitulos.ts` e as bandas
continuarem oito no pipeline.

A rota do jogo continua a ser `#/jogo/<banda>/<índice>`, e não a posição no
capítulo: é o par que identifica o nível no pack, portanto um link sobrevive a
mudar a cadência de intercalação — e os links antigos continuam a funcionar sem
tradução nenhuma.

**Sobram 15 níveis de cada banda com joker**, 30 ao todo, gerados e por jogar. É
assumido, e há um teste que o vigia: são o corpo natural do puzzle diário
(desenho §8, passo 10).

---

## Telemóvel deixou de ser da Fase 9

O desenho da Fase 8 assumiu "desktop primeiro" e adiou o telemóvel. Deixou de
servir: **mais de 80% de quem vai testar usa telemóvel**.

Medido, não presumido. Nada rebentava — sem rolagem lateral, rodapé sempre
visível, tabuleiro sempre dentro da bandeja. O que falhava era o **alvo de
toque**, e falhava de duas maneiras diferentes.

**A que se resolve com CSS.** Num ecrã de 375, um 7×7 dava peças de 41px, abaixo
do piso de 44. Apertando a folga das peças de 6 para 4 e o enchimento dos ecrãs
em larguras até 480px, passa a 46px — e a 44px num ecrã de 360, o pior caso que
vale a pena servir.

Mais duas ausências que só doem com o dedo:

| | |
|---|---|
| `-webkit-tap-highlight-color: transparent` | o iOS pintava um retângulo azul por cima do anel de seleção |
| `touch-action: manipulation` | sem ele, 300ms de espera por toque à procura de um duplo toque — numa jogada de sete peças lê-se como o jogo estar lento |

**A que não se resolve com CSS: a largura.** Até 7 colunas as peças ficam no piso
de toque; 8 colunas dão 38px e o único nível de 11 dá 26px, mais estreito do que
uma tecla de teclado. Não há enchimento que recupere largura.

A campanha passa a **saltar os níveis com 8 ou mais colunas**. Continuam no pack,
continuam válidos, e continuam acessíveis por link direto — só não entram nos
capítulos:

| Capítulo | Antes | Agora |
|---|---|---|
| Tutorial | 30 | 30 |
| Iniciado | 30 | 30 |
| Médio | 45 | 40 |
| Avançado | 45 | 33 |
| Perito | 30 | 23 |

O índice ganhou `colunas` para isto ser decidido no arranque, sem carregar as
bandas todas. **O índice na banda continua a ser calculado antes de filtrar** —
é ele que vai na rota, e renumerar fazia um link antigo abrir outro nível.

É a correção barata e reversível; a correção de raiz seria um teto de largura no
pipeline, e essa fica para quando houver razão para regerar.

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
pnpm check                                    # lint + typecheck + 323 testes
pnpm dice7 bands                               # as bandas e os seus critérios
pnpm dice7 play --id inicio-000296 --log p.jsonl # jogar um nível na consola
pnpm dice7 verify                              # revalida o pack todo
pnpm dice7 build --count 30 --runs 1000        # reconstrói o pack (--pre 0 desliga o pré-filtro)
pnpm dice7 build --band inicio --max 1200      # mais orçamento por nível: as formas cheias caras precisam
pnpm dice7 export                              # parte o pack por banda para game/public/levels
```
