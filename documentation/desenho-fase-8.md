# Desenho da Fase 8 — UI web

> Este documento decide **como vai ser** a interface, antes de existir código.
> Fixa o que estava em aberto e regista o porquê de cada escolha.
>
> Escrito a 2026-08-20, depois do gate da Fase 6 e da Fase 7.
>
> Em caso de conflito, `spec-motor-septet.md` e `plano-modelo-jogo-septet.md` ganham,
> **exceto** onde este documento diz explicitamente que os contraria — e nesses
> casos diz porquê.

---

## 1. O que já estava fechado

Não se rediscute. Fica aqui para não se voltar a discutir por engano.

| | Onde |
|---|---|
| DOM + transições CSS, **não Canvas** | spec §1.4 |
| Tocar-a-acumular, soma corrente visível, desfazer a última peça | plano §3.1 |
| Level packs como JSON estático; **o jogo nunca gera nem mede** | spec §7.5 |
| Web primeiro, sem lojas — playtest por link | spec §1.5 |
| Dois modos, corpora opostos | plano §6.1 |

E uma precisão sobre o plano §3.1, que a Fase 8 resolveu:

> A eliminação automática mantém-se **sempre**. O que muda com joker é o alvo:
> as faces fixas têm de somar `7 − valor do joker`, não 7.

Ver §5.2. O plano dizia "ao atingir 7" a pensar num tabuleiro sem joker; com
joker o alvo é outro, e é isso — e não a eliminação automática — que estava
errado.

---

## 2. Decisões desta fase

| | Escolha |
|---|---|
| Stack | **TypeScript puro + Vite.** Sem framework |
| Faces | **Pintas + cor por valor**, sempre as duas |
| Peça | **Plana**, com uma aresta subtil. Sem volume |
| Formato | **Desktop primeiro**, com dimensionamento fluido |
| Âmbito | Núcleo jogável **e** meta-jogo |
| Pontuação | Também na campanha, mas **só no fim** e sem combos |
| Aprendizagem | **Os níveis ensinam.** Sem tutorial guiado, nem para o joker |
| Campanha | **Lista por banda**, sequencial. Sem mapa com percurso |

### 2.1 A direção de arte, e o que ela proíbe

O público vai de miúdos a graúdos, e a direção é **limpa e leve**. Isso define-se
melhor pela negativa, porque o género inteiro empurra no sentido contrário:

| Não |
|---|
| Partículas, confetes, brilhos, estrelas a saltar |
| Ecrã a tremer, *easing* com ressalto, escalas exageradas |
| Números a voar da peça durante o jogo |
| Mapas com caminhos sinuosos e ícones ilustrados |
| Cores fora da paleta para chamar a atenção |
| Fanfarra ao concluir um nível |

E pela positiva, uma regra só:

> **Anima-se o que explica uma mudança de estado. Mais nada.**

As três fases da jogada — sair, cair, deslizar — animam-se porque *são* a
mecânica a explicar-se. Um número a saltar não explica nada; celebra. A
diferença entre as duas coisas é toda a direção de arte deste jogo.

Duas consequências que contrariam os documentos de origem:

- **O plano §9.2 vende "efeitos de eliminação" como cosmético.** Partículas à
  peça é exatamente o que esta direção recusa. Fica registado como conflito a
  resolver quando a monetização for a sério — não é da Fase 8.
- **O plano §6.3 quer números a saltar da peça** no modo tempo. Mantém-se **só
  aí**, porque é o loop que sustenta o modo, e mesmo aí discreto: um valor que
  aparece e esvai, sem escala nem rotação.

### 2.2 Porquê sem framework

A animação da jogada é o problema difícil desta fase, e é um problema de
**identidade de elementos**: a mesma peça tem de existir como o mesmo nó do DOM
antes e depois da jogada, para poder ser animada de uma posição para a outra. Um
virtual DOM que reconcilia por posição trabalha contra isso, e a solução acaba
por ser a mesma que se escreveria à mão — só que com uma camada por baixo a
desfazer o trabalho.

Mantém também o pacote sem dependências de runtime, como o resto do repositório.

### 2.3 A invariante que esta fase quebra, e assume

O `CLAUDE.md` diz:

> Não há passo de build: cada pacote expõe `"exports": "./src/index.ts"` e os
> consumidores importam código-fonte.

Isto deixa de ser verdade. Uma app web precisa de bundler, e o `game` passa a ter
Vite. **A invariante mantém-se onde interessa** — `engine` e `tools` continuam a
correr por código-fonte, sem build, e o `pnpm check` continua a ser lint +
typecheck + testes sobre as fontes. O que muda é que o `game` ganha um alvo de
distribuição.

O `CLAUDE.md` tem de ser corrigido quando isto for implementado. Uma invariante
documentada que já não vale é pior do que não a ter documentado.

### 2.4 Sobre "desktop primeiro"

Escolhido deliberadamente, com o risco assumido: a Fase 9 é Capacitor para iOS e
Android, portanto o destino real é o telemóvel, e um tabuleiro de 9 colunas em
vertical é apertado.

Mitigação, obrigatória desde o primeiro commit: **o tamanho da peça é derivado do
viewport e das dimensões do tabuleiro**, nunca fixo em pixels.

```
lado = min(largura_disponível / colunas, altura_disponível / linhas, MAX)
```

Com isto, o telemóvel fica desconfortável em vez de impossível, e a Fase 9 é
afinação e não reescrita.

---

## 3. A animação, e a função que ela obriga a existir

É a parte com consequência arquitetural, e por isso vem antes do resto.

### 3.1 O problema

`Board` é uma lista de listas de números. **Não tem identidade de peça.** Depois
de `applyMove`, olhando só para o resultado, não há como saber que peça foi parar
onde — e sem isso não há animação, só um tabuleiro a piscar de um estado para o
outro.

### 3.2 Porque é que o mapeamento é derivável na mesma

Pelas duas propriedades que a spec já sublinha, e que existem para tornar a
geração reversa possível:

- **A gravidade é `col.filter`**, e `filter` preserva a ordem relativa. Numa
  coluna afetada, a *k*-ésima célula sobrevivente a contar de baixo passa a
  ocupar a linha *k*.
- **O colapso é a coluna vazia não entrar.** As colunas mantêm a ordem, portanto
  a nova coluna de uma antiga é quantas colunas não-vazias existem à esquerda
  dela.

Ou seja: a mesma escolha de representação que torna o gerador possível torna a
animação possível. Não é coincidência — é a ordem relativa preservada a pagar
duas vezes.

### 3.3 A função

```ts
interface PieceMove {
  readonly from: Packed;
  readonly to: Packed;
}

interface Transition {
  readonly removed: readonly Packed[];
  readonly moved: readonly PieceMove[];
}

function transition(board: Board, group: Group): Transition;
```

Pura, determinística, testável sem DOM. **Vive na camada de sessão**
(`game/src/session/`), não na engine: a engine não sabe o que é uma animação, e
isto só existe por causa de uma. Mas também não pertence ao DOM — é aritmética
sobre o tabuleiro, e tem de ser testável como tal.

O teste que a fixa: para qualquer tabuleiro e qualquer grupo válido, aplicar o
`transition` às peças de `board` reproduz exatamente `applyMove(board, group)`.

### 3.4 As duas transformações, em separado

O plano §8 recomenda-o e o playtest da Fase 6 fechou a Verde **sem** precisar
dele — portanto é recomendação, não requisito. Faz-se na mesma, porque é barato e
porque foi a mitigação desenhada para o risco nº 1.

| Fase | O que se vê |
|---|---|
| 1 | As peças do grupo desaparecem. **Nada mais se mexe** |
| 2 | Gravidade: as peças de cima descem |
| 3 | Colapso: as colunas à direita deslizam para a esquerda |

Cada fase tem duração própria e configurável, e o conjunto é interrompível — um
jogador rápido não pode ficar à espera da animação. Uma jogada nova durante uma
animação salta-a para o estado final.

A implementação é transformação CSS sobre posição absoluta, não layout de fluxo.
As peças são posicionadas por `transform: translate(...)` numa grelha calculada,
o que torna cada movimento uma transição de uma propriedade que o browser anima
sem reflow.

---

## 4. As faces

### 4.1 Pintas e cor, sempre as duas

Pintas de dado a sério — é a identidade que dá nome ao jogo. Mas somar pintas é
mais lento do que ler dígitos, sobretudo em 4, 5 e 6, e no modo tempo a carga de
reconhecimento **é** o desafio (plano §6.3). A cor compensa: com prática, o valor
lê-se pela cor e as pintas passam a confirmação.

**Nunca só cor.** A forma carrega sempre a informação completa, e a cor é
redundante — é o que faz isto funcionar em daltonismo.

### 4.2 A paleta, derivada do logótipo

As cores de origem, tiradas da identidade **SEPTET**:

| | |
|---|---|
| `#3EBB94` | esmeralda |
| `#A9CBE8` | azul suave |
| `#BFC5C7` | cinzento — no logótipo, é o próprio 7 |
| `#1B6B62` | verde-petróleo do lettering |
| `#F1F2F0` | papel |

**A marca não tem uma única cor quente**, e isso decide a rampa. A versão
anterior deste documento ia até âmbar, laranja e vermelho; aqui destoariam. A
rampa passa a viver **toda dentro do azul-verde da marca**, e é a luminância que
carrega a ordem.

Não é um compromisso — é melhor. A luminância é o canal que sobrevive a todas as
formas de daltonismo, ao passo que uma rampa de matiz colapsa no meio em
protanopia e deuteranopia.

| Valor | Cor | Luminância | Tinta das pintas |
|---|---|---|---|
| 1 | `#CFE3F2` | 0,746 | escura |
| 2 | `#A9CBE8` | 0,570 | escura |
| 3 | `#74C8B0` | 0,482 | escura |
| 4 | `#3EBB94` | 0,387 | escura |
| 5 | `#2A8C77` | 0,206 | clara |
| 6 | `#1B6B62` | 0,116 | clara |
| joker | `#8E999C` | 0,309 | escura |

Estritamente decrescente de 1 a 6 — verificado por cálculo, não por observação.

**O joker é acromático, e a razão é conceptual:** no logótipo, o cinzento é o 7,
e o joker é a peça que se torna aquilo que falta para 7. Sem matiz nenhum, não
pode ser confundido com um valor. Glifo próprio, sem pintas.

### 4.3 Contraste, medido

O limiar aplicável às pintas é **3,0** e não 4,5: são objetos gráficos, não texto
(WCAG 1.4.11).

| Face | Contraste pinta/face |
|---|---|
| 1 | 8,86 |
| 2 | 6,89 |
| 3 | 6,28 |
| 4 | 5,73 |
| 5 | 3,68 |
| 6 | 5,57 |
| joker | 4,00 |

Duas correções que a medição forçou, e que o olho não teria apanhado:

- **O joker tinha glifo claro e ficava a 2,69** — falhava. Passou a glifo escuro.
- **A face 1 tem contraste 1,17 contra o papel.** As peças mais claras
  dissolviam-se no fundo. Todas as peças passam a ter um **anel de 1 px**, que as
  delimita seja qual for a face e seja qual for o fundo.

### 4.4 A seleção não pode ser uma cor

A rampa ocupa todo o azul-verde da marca, portanto qualquer matiz escolhido para
o realce entraria em conflito com alguma face. A seleção é um **anel duplo**,
claro por dentro e escuro por fora: um dos dois destaca-se sempre.

**Verificação antes de fechar:** simular protanopia, deuteranopia e tritanopia, e
confirmar em cinzentos que a ordem se mantém legível. A maqueta tem os controlos
para isso.

---

## 5. Ecrãs

### 5.1 Tabuleiro — o ecrã que interessa

```
┌──────────────────────────────────────┐
│  ‹ voltar      meio-000015      ⚙   │
├──────────────────────────────────────┤
│                                      │
│           [ tabuleiro ]              │
│                                      │
├──────────────────────────────────────┤
│  seleção: 2 + 3 = 5          ↶  ⟲   │
│  ▸ faltam 2                          │
└──────────────────────────────────────┘
```

- **Soma corrente sempre visível** — plano §3.1 exige, e é o que torna a seleção
  de sete peças gerível.
- **Desfazer (↶) e reiniciar (⟲) sempre à mão.** O undo é ilimitado e grátis; o
  botão nunca está desativado nem escondido atrás de um menu, porque escondê-lo
  lê-se como escassez, que é exatamente o oposto do que o plano §3.3 quer.
- A dica é um botão **separado e com contador visível** — é o recurso escasso, e
  tem de se ver que é.

### 5.2 O joker não precisa de tratamento especial

O valor do joker está globalmente determinado (spec §2.6): só um número entre 1 e
6 permite esvaziar o tabuleiro. Logo **também só existe uma soma correta para as
faces fixas de um grupo com joker** — `7 − valor`.

Pondo o teto aí, o joker comporta-se como qualquer outra peça: acumula-se até ao
alvo e elimina sozinho. Não há botão, não é preciso mostrar o valor, e não há
tutorial a dar.

```
seleção: ✳ + 1
faltam 3
```

**Porque é que isto não é óbvio.** `isValidGroup` aceita, com joker, qualquer soma
fixa entre 1 e 6 — é a condição do motor, e a primeira versão desta UI leu-a como
se fosse o teto da seleção. Com o teto em 6, a seleção fica válida logo à primeira
peça encostada ao joker, e a eliminação automática gasta-o com o valor que essa
peça deixar. A correção inicial foi um botão de confirmação; **era a solução
errada para o problema certo**.

Com o teto no valor obrigatório, a ambiguidade desaparece por construção: juntar
mais peças só aumenta a soma, portanto nunca há duas seleções válidas diferentes.

**O que se perde**, e é uma escolha e não um descuido: a jogada que mata o
tabuleiro em silêncio, que o plano §2.6 desenhou de propósito. Já era
incompatível com o piso de justiça — tanto que as bandas com joker o excluem da
verificação — e contraria a direção limpa e intuitiva desta fase. A decisão que
torna o joker interessante mantém-se intacta: continua a ser preciso descobrir
**qual** grupo atinge o alvo, e há vários candidatos.

### 5.3 Modo tempo

Relógio único e contínuo, sempre visível e dominante. Cada ganho de tempo é
anunciado no sítio onde aconteceu — `+3s` a subir da peça eliminada — porque o
loop de reforço do plano §6.3 só funciona se o jogador ligar a jogada ao prémio.

Sem botão de undo. Não é restrição escondida: os níveis deste modo são
greedy-safe e não há como bloquear, portanto não há nada que desfazer.

### 5.4 O tutorial do joker deixou de ser preciso

O plano §2.6 exige um tutorial dedicado, e o playtest da Fase 6 confirmou que a
regra do valor não se descobre a jogar. Ambos partiam do princípio de que o
jogador tem de **saber** o valor para não o gastar mal.

Com o teto em `7 − valor` (§5.2) já não há como o gastar mal, portanto não há o
que ensinar. O joker aparece, encaixa como as outras peças, e a única diferença
que o jogador nota é que não tem pintas.

### 5.5 A pontuação da campanha, e a armadilha que ela tem

A campanha passa a ter pontuação, **mostrada só no ecrã de fim de nível** — nunca
durante o jogo, onde seria ruído sobre o puzzle.

Há aqui uma armadilha concreta na camada da Fase 7. O `registerMove` de
`combos.ts` mede o combo pelo **intervalo entre jogadas** (spec §4.3). Usar isso
na campanha introduzia pressão de tempo num modo que não tem relógio, e punia
exatamente o jogador que pára a pensar — que é o comportamento que a campanha
existe para premiar.

**Na campanha, a pontuação corre sempre com `comboCount = 1`.** O mérito vem só
do **tamanho dos grupos**: limpar um tabuleiro com grupos grandes vale mais do
que o limpar aos pares, e isso é independente de velocidade. O
`scoring.ts` já serve isto — `moveScore(groupSize, 1)` — sem alteração nenhuma.

O selo continua a ser a métrica principal. A pontuação é a segunda leitura, para
quem gosta de otimizar.

### 5.6 A campanha: lista por banda

Uma página por banda, níveis em grelha, o selo de cada um visível. Sem mapa, sem
percurso, sem metáfora a manter — é linguagem gasta pelo género e exige arte que
envelhece mal.

A grelha mostra o progresso todo de relance, que é o que dá razão para voltar a
um nível e reconquistar o selo.

### 5.7 Aprender a jogar: os níveis ensinam

Sem tutorial guiado e sem sobreposições a apontar. A banda `tutorial` já é
desenhada para isso: só pares, e **impossível de bloquear** — sobrevivência
1.00. Os primeiros níveis introduzem uma coisa de cada vez e o jogador descobre a
jogar, que funciona em qualquer idade e não obriga a ler.

**A exceção é o joker**, e é uma exceção medida, não uma opinião: o playtest da
Fase 6 provou que a regra do valor não se descobre a jogar. Esse tem ecrã próprio
(§5.4).

### 5.8 Meta-jogo

- **Lista por banda** (§5.6), com o selo de cada nível.
- **Perfil** com selos e estatísticas, e os melhores do modo tempo.
- **Definições:** tema, animações reduzidas, e o interruptor de dígitos nas peças
  (ver §7).
- **Puzzle diário** (plano §6.4): mesma seed para todos. Custo quase nulo, dado o
  gerador determinístico — mas exige um pack diário pré-gerado, porque o jogo em
  produção não gera nada.

Tudo isto assenta no `progress.ts` da Fase 7, que já guarda selos, melhores
jogadas e os recordes do modo tempo.

---

## 6. Entrega dos níveis

O pack tem 240 níveis e não deve ir todo no primeiro carregamento. Um ficheiro
por banda, carregado a pedido, e o mapa precisa apenas dos identificadores e dos
metadados.

O `packages/tools/out/level-pack.json` passa a ter um passo de exportação que o
parte por banda para `game/public/levels/`. **O jogo continua a nunca gerar nem
medir nada.**

---

## 7. Acessibilidade

Não é uma secção de conformidade — metade disto melhora o jogo para toda a gente.

- **Cor nunca sozinha.** Já garantido pelas pintas.
- **Interruptor de dígitos**, que substitui as pintas por números. Ajuda quem tem
  dificuldade em subitizar, e provavelmente vai ser preferido por jogadores
  rápidos no modo tempo. É uma definição, não o padrão.
- **`prefers-reduced-motion`**: as três fases da animação passam a corte seco. O
  estado final é o mesmo; o que se perde é a explicação do movimento.
- **Alvos de toque de 44 px no mínimo**, o que na prática fixa o piso do tamanho
  da peça no telemóvel — e é a restrição que vai decidir se um tabuleiro de 9
  colunas cabe.
- **Navegação por teclado** no tabuleiro: setas movem o cursor, espaço seleciona.
  Sai quase de graça da representação por coordenadas.

---

## 8. Ordem de construção

Deliberadamente com o núcleo jogável primeiro, para haver um link partilhável
cedo — o playtest externo pode mudar o resto, e o que ainda não existe não se
deita fora.

| | |
|---|---|
| 1 | Andaime Vite, e a correção ao `CLAUDE.md` |
| 2 | `transition()` e os seus testes — **sem DOM** |
| 3 | Tabuleiro, faces, seleção, soma corrente |
| 4 | A animação em três fases |
| 5 | Pendência do joker e o seu tutorial |
| 6 | Lista de níveis, resultado com selo, persistência |
| 7 | Modo tempo |
| 8 | ← **aqui há link partilhável e o playtest externo pode começar** |
| 9 | Mapa de progressão, perfil, definições |
| 10 | Puzzle diário |

---

## 9. Proposto, à espera de objeção

Decidido por mim porque a direção já os determina. Se algum estiver errado,
é agora que se muda:

- **Som: silêncio por omissão.** Nada na Fase 8. Mais tarde, um conjunto muito
  pequeno e discreto — nunca uma camada de reforço sonoro por jogada.
- **Tema claro e escuro, com omissão a seguir o sistema.** As faces **não mudam**
  entre temas: uma peça é a mesma peça nos dois fundos, e trocá-las quebrava a
  identidade que o jogador aprendeu. Só o cromado muda.
- **Transições curtas, sem ressalto.** Nada de `cubic-bezier` com *overshoot*.
- **Nada de ecrã de fim de nível com fanfarra.** O selo aparece, a pontuação
  aparece, e há um botão para o nível seguinte.

## 10. O que fica genuinamente por decidir

- **As durações da animação.** Números de playtest, não de escrivaninha. Ficam em
  configuração desde o primeiro dia, como os tempos do modo tempo.
- **A tipografia do jogo.** A maqueta usa tipos de documento, que não são os do
  jogo. O lettering do logótipo pede uma sem-serifa geométrica de contornos
  suaves; a escolha exata fica por fazer, e importa mais do que parece, porque há
  um modo de dígitos nas peças.
- **O nome do repositório.** O jogo passou a chamar-se **Septet** em todo o lado —
  documentos, pacotes `@septet/*`, comando `pnpm septet`, chave de perfil. Duas
  coisas ficaram por mudar porque mudá-las **partia** alguma coisa: o repositório
  no GitHub continua `seven-dice`, e o URL de clone nos documentos aponta para lá.
  Renomear o repositório é uma ação no GitHub, e o URL segue-a.
- **O conflito das nove colunas em telemóvel** (§2.3), que não é preciso resolver
  antes da Fase 9 mas não pode ser esquecido.
