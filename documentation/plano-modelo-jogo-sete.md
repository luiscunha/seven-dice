# Plano do Modelo de Jogo — "Sete" (nome provisório)

> Documento vivo. Modelo de jogo fechado — sem decisões pendentes.

---

## 1. Conceito

Puzzle de tabuleiro com faces de dado (valores 1 a 6). O jogador elimina grupos de
faces adjacentes cuja soma seja exatamente **7**. Cada eliminação reorganiza o
tabuleiro. O objetivo é eliminar **todas** as faces.

Dois eixos de skill, servidos por dois modos:

| Modo | Competência exigida | Pressão |
|---|---|---|
| Puzzle | Planeamento e antecipação | Nenhuma |
| Tempo | Reconhecimento rápido de padrões | Relógio |

---

## 2. Regras base

### 2.1 Tabuleiro

- Grelha de células, cada uma com um valor de 1 a 6.
- Tamanho variável por nível (5x5 é apenas um exemplo).
- Célula vazia é um estado válido durante o jogo.

### 2.2 Jogada válida

Um grupo de faces é eliminável se cumprir **as três condições**:

1. A soma dos valores é exatamente **7** (nem mais, nem menos).
2. As faces são **adjacentes na horizontal ou vertical** (nunca na diagonal).
3. O grupo é **conexo** — todas as faces ligadas entre si por adjacências
   dentro do próprio grupo. Qualquer forma serve: par, linha, L, T, S, etc.

Não há limite de peças por grupo. Como o valor mínimo de uma face é 1, o máximo
teórico é de **7 peças** (sete 1s).

Se o grupo incluir a peça **joker** (`*`), a soma das restantes peças tem de estar
entre 1 e 6, e o joker assume o valor que falta para 7. Ver 2.6.

### 2.3 Composições possíveis

Existem exatamente **14 formas** de somar 7 com parcelas de 1 a 6:

| Nº de peças | Composições |
|---|---|
| 2 | `1+6` · `2+5` · `3+4` |
| 3 | `1+1+5` · `1+2+4` · `1+3+3` · `2+2+3` |
| 4 | `1+1+1+4` · `1+1+2+3` · `1+2+2+2` |
| 5 | `1+1+1+1+3` · `1+1+1+2+2` |
| 6 | `1+1+1+1+1+2` |
| 7 | `1+1+1+1+1+1+1` |

Esta tabela é a base de tudo: é dela que o gerador escolhe ao construir níveis,
e é a proporção entre elas que controla a dificuldade percetiva.

### 2.4 Reorganização após eliminação

Por esta ordem:

1. As faces do grupo desaparecem.
2. **Gravidade** — as faces acima caem para preencher os buracos, alinhadas à base.
3. **Colapso de colunas** — colunas que ficaram totalmente vazias são removidas;
   as colunas à direita deslizam para a esquerda.
4. **Cascata** — se as novas posições formarem grupos válidos, contam como combo
   (relevante para pontuação e bónus de tempo).

Propriedade importante: ambas as transformações **preservam a ordem relativa**
das peças. É isso que torna a geração reversa possível (secção 4).

### 2.5 Condições de fim

- **Vitória:** tabuleiro vazio.
- **Bloqueio:** não existe nenhum grupo válido e ainda há faces.
  Tratamento depende do modo (secção 6).

### 2.6 A peça joker (`*`)

Peça especial, **no máximo uma por tabuleiro**. Comporta-se como qualquer outra
face — cai, desliza com o colapso de colunas, seleciona-se normalmente — mas o
seu valor não é fixo: dentro de um grupo, assume o que faltar para 7.

Regras:

- Nunca pode formar um grupo sozinho (o valor máximo de uma face é 6, logo precisa
  sempre de pelo menos uma peça normal).
- O valor não é escolhido pelo jogador. Dentro de um grupo válido só existe um
  valor possível, portanto resolve-se automaticamente.

**Propriedade crítica: o valor do joker está globalmente determinado.**

Como todas as peças têm de desaparecer e cada jogada retira exatamente 7:

```
soma das faces fixas + valor do joker ≡ 0 (mod 7)
```

O valor do joker está entre 1 e 6, portanto **só existe um valor que permite
limpar o tabuleiro**, e é calculável a partir do resto do tabuleiro.

Consequências:

- O joker **não é flexível em valor** — é flexível em *posição*. A decisão do
  jogador não é "que valor lhe dou?" mas "**em que grupo o gasto?**". Um joker de
  valor 4 pode juntar-se a um `3`, a `1+2`, a `1+1+2`, etc.
- **Usá-lo com o valor errado mata o tabuleiro.** Não bloqueia de imediato — o
  jogo continua e falha no fim, quando sobrarem peças impossíveis de somar 7.
- Existe portanto uma **dedução escondida** disponível ao jogador avançado: somar
  o tabuleiro e tirar o módulo 7 revela o valor verdadeiro do joker. É
  profundidade genuína, mas tem de ser ensinada, ou lê-se como armadilha.

Isto torna o joker exatamente o que se pretendia — um recurso a gerir, não uma
ajuda. Também explica por que baixa a taxa de sobrevivência: um jogador aleatório
gasta o joker mal quase sempre.

**Mitigação obrigatória:** um nível de tutorial dedicado, no momento da
introdução, que mostre explicitamente que o joker tem um valor certo e um errado.
O undo ilimitado (3.3) cobre o resto.

---

## 3. Decisões

### 3.1 Fechadas

| Decisão | Escolha |
|---|---|
| Forma do grupo | **Conexo livre** — qualquer forma ligada ortogonalmente |
| Reorganização | **Gravidade (para baixo) + colapso de colunas vazias (para a esquerda)** |
| Tamanho do grupo | **Sem limite** — as 14 composições estão todas em jogo |
| Formato do tabuleiro | **Irregular permitido** (ver 3.2 para os limites impostos pela gravidade) |
| Bloqueio no modo puzzle | **Undo ilimitado e grátis** — a exigência vive no troféu de resolução limpa, não na escassez |
| Formato do modo tempo | **Time attack contínuo** — relógio único, limpar tabuleiros dá tempo |
| Peça joker | **Sim, uma no máximo por tabuleiro**, a partir da fase média, como estrangulamento (ver 2.6) |
| Células bloqueadoras | **Adiadas para v2** (ver 3.4) |

**Consequências de "sem limite":**

- Todas as 14 composições da tabela 2.3 ficam disponíveis ao gerador, o que
  aumenta a flexibilidade da construção reversa e permite praticamente qualquer
  número de peças no tabuleiro.
- Grupos de 6–7 peças (só 1s e 2s) tornam-se jogadas raras e vistosas — bom
  material para pontuação especial e bónus de tempo.
- **A seleção passa a ser crítica.** Com grupos até 7 peças, a interação tem de
  ser tocar-a-acumular com soma corrente visível, desfazer a última peça, e
  eliminação automática ao atingir 7. Arrastar em caminho contínuo não chega
  para formas em T ou S.
- **Risco a vigiar no playtest:** grupos muito grandes podem tornar-se tediosos.
  Se acontecer, a mitigação não é proibi-los na regra, mas reduzir a sua
  frequência na distribuição do gerador (secção 4.4).

### 3.2 Formato do tabuleiro — **irregular permitido**

Atenção à interação com a gravidade (2.4). Como as peças caem e ficam alinhadas
à base, **nem toda a irregularidade sobrevive à primeira jogada**:

| Tipo de irregularidade | Compatível com gravidade? |
|---|---|
| **Perfil superior irregular** (colunas de alturas diferentes) | **Sim.** É o estado natural do tabuleiro após qualquer jogada |
| Buracos no meio do tabuleiro | **Não.** A gravidade fecha-os imediatamente |
| Contorno inferior irregular | **Não.** As peças caem até à base |

Ou seja, a irregularidade toma naturalmente a forma de uma **silhueta** — um
recorte no topo, como um horizonte urbano. Pirâmides, escadas, ampulhetas e
formas em arco são todas possíveis por esta via.

Se o objetivo for buracos genuínos no meio do tabuleiro, é preciso uma mecânica
adicional: **células bloqueadoras** — obstáculos fixos que não caem, não somam, e
travam a queda das peças acima. *(adiado para v2 — ver 3.4)*

### 3.3 Bloqueio no modo puzzle — **undo ilimitado, resolução limpa como troféu**

O princípio: **separar progressão de mérito.** O avanço nunca é bloqueado; a
qualidade da resolução é que é medida.

- **Undo ilimitado e grátis.** O jogador nunca fica preso nem desiste por parede.
- **Reiniciar continua disponível** e instantâneo, para quem prefere recomeçar.
- **A conquista é terminar sem undo e sem reinício** — "resolução limpa". Selo ou
  estrelas por nível, registado no perfil. É daqui que vem o orgulho e o
  completionismo.
- **Dicas são o recurso escasso**, não o undo. O undo é o jogador a corrigir uma
  ação sua; a dica é o jogo a revelar a solução que tem guardada (4.3). Limitar a
  segunda lê-se como justo; limitar a primeira lê-se como taxa sobre o erro.

**Porque não uma economia de undos:** um recurso escasso e dificilmente
recuperável é acumulado, não gasto — o jogador guarda-o "para quando precisar
mesmo" e reinicia na mesma. E como reiniciar é grátis, o valor de um undo é
proporcional ao tamanho do tabuleiro, o que entra em conflito direto com a curva
de progressão (7). Recompensar undos por "X níveis sem reinício" agrava o
problema: dá o recurso a quem não precisa dele.

**Consequência boa para a curva:** com undo ilimitado, o tamanho do tabuleiro e a
densidade de armadilhas deixam de ter de andar em direções opostas. Os níveis
avançados podem voltar a ser grandes *e* traiçoeiros — quem quer só progredir
progride, quem quer desafio persegue o selo limpo.

### 3.4 Células bloqueadoras — **adiadas para v2**

Obstáculos fixos que não caem, não somam e cortam a adjacência, permitindo buracos
a meio do tabuleiro. Fora de âmbito na primeira versão por duas razões:

- **Criam exceções às regras de reorganização.** A gravidade passaria a ter dois
  casos de paragem, o colapso de colunas ficaria ambíguo, e cada exceção teria de
  ser corretamente invertida na construção reversa (4.2). Um erro nessa inversão
  produz níveis impossíveis — precisamente o que todo este desenho existe para
  evitar.
- **Acrescentam quatro factos ao tutorial** (não é peça, não soma, não se
  seleciona, corta adjacência) num jogo que hoje se explica numa frase.

As silhuetas (3.2) já cobrem a variedade visual, e o joker (2.6) cobre a variedade
mecânica. Mecânica aditiva: pode entrar mais tarde sem partir nada.

---

## 4. Geração de tabuleiros

### 4.1 A invariante

Cada jogada retira exatamente 7 pontos. Logo, para limpar tudo:

```
soma de todas as faces ≡ 0 (mod 7)
```

Geração aleatória satisfaz isto em ~1/7 dos casos — e mesmo esses podem não ter
solução por razões geométricas. **A geração aleatória está descartada.**

Com joker, a invariante passa a `soma das fixas + valor do joker ≡ 0 (mod 7)`,
o que fixa o valor do joker (2.6). Na construção reversa isto é automático: o
joker nasce como uma peça de um grupo, e o seu valor é o que essa composição lhe
atribuiu.

### 4.2 Construção reversa

Constrói-se o tabuleiro do fim para o princípio:

1. Começa com tabuleiro vazio.
2. Escolhe uma composição da tabela 2.3.
3. Escolhe posições de inserção — dentro de colunas existentes (empurrando para
   cima o que está acima) ou criando uma coluna nova.
4. **Valida:** simula a jogada para a frente e confirma que devolve exatamente o
   tabuleiro anterior, e que o grupo inserido é conexo.
5. Se válido, aceita; senão, tenta outra posição.
6. Repete até atingir o tamanho alvo.

**Garantia obtida:** a ordem inversa dos passos de construção *é* uma solução
válida. Nunca é preciso perguntar se o tabuleiro tem solução.

### 4.3 Subprodutos gratuitos

- **Sistema de dicas** — a solução guardada com o nível.
- **Seeds determinísticas** — mesmo nível reproduzível, base para puzzle diário
  e leaderboards justos.

### 4.4 Parâmetros do gerador

Botões que influenciam (mas não determinam) a dificuldade:

| Parâmetro | Efeito |
|---|---|
| Distribuição das composições | Muitos 1s e 2s → tabuleiro flexível. 3s, 4s e 5s → peças com poucos parceiros |
| Sobreposição espacial dos grupos | Grupos entrelaçados → ordem de resolução obrigatória. Separados → liberdade |
| Profundidade de inserção | Inserir no fundo de colunas altas cria mais dependências |
| Tamanho do tabuleiro | Alavanca mais grosseira, percebida imediatamente |

---

## 5. Medição de dificuldade

A dificuldade **não se define na geração — mede-se depois**. O fluxo é:

```
gerar muitos candidatos → medir todos → arrumar por bandas → publicar level pack
```

Corre-se offline, uma vez. O jogo em produção só carrega dados já prontos.

### 5.1 Métrica principal — taxa de sobrevivência

Correr N playouts (~2000) escolhendo grupos válidos ao acaso a cada passo, e
contar quantos chegam ao tabuleiro vazio.

| Taxa | Leitura |
|---|---|
| 100% | *Greedy-safe* — impossível bloquear. Obrigatório no modo tempo |
| >90% | Relaxante. Primeiros níveis do modo puzzle |
| 40–70% | É preciso reparar em algumas armadilhas |
| 10–30% | Exige planear à frente |
| <5% | Só com estratégia deliberada; risco de parecer injusto |

Para tabuleiros pequenos/médios, o valor 100% pode ser **provado
exaustivamente** com pesquisa em profundidade sobre os estados alcançáveis.

### 5.2 Métricas secundárias

- **Branching factor médio** — grupos válidos por estado.
  Muitas opções + baixa sobrevivência = dificuldade boa (o jogador tem escolhas,
  a maioria é má). Poucas opções + baixa sobrevivência = frustrante.
- **Profundidade do primeiro erro fatal** — em que jogada, em média, o jogador se
  pinta ao canto. Na jogada 2 é injusto; a meio é um bom puzzle.
- **Densidade de jogadas** — grupos válidos por peça. Baixa = mais tempo a varrer.
- **Tamanho médio dos grupos** — proxy direto de carga percetiva.

### 5.3 Nota metodológica

Ao contar soluções, contar **estados**, não **sequências**. Jogadas que não
interagem comutam entre si, inflacionando sequências equivalentes sem representar
escolha real. O que interessa é a fração de estados alcançáveis a partir dos quais
ainda é possível terminar.

---

## 6. Modos de jogo

### 6.1 Princípio de separação

O motor é o mesmo. **Os corpora de níveis são opostos.**

Pôr um relógio num tabuleiro traiçoeiro pune o jogador duas vezes: por lentidão
*e* por um erro de planeamento que não teve tempo de evitar.

### 6.2 Modo Puzzle (campanha)

- Sem relógio.
- **Undo ilimitado e grátis.** Reinício também disponível, instantâneo, mesmo
  tabuleiro.
- Níveis filtrados por **taxa de sobrevivência baixa** (armadilhas presentes).
- **Dicas** servidas pela solução guardada no nível (4.3), em quantidade limitada
  (ver 9).

**Piso de justiça:** mesmo nos níveis mais difíceis, garantir que as primeiras
2–3 jogadas são seguras qualquer que seja a escolha. Um tabuleiro com solução
única é tecnicamente resolúvel mas lê-se como adivinha, não como puzzle.

**Resolução limpa.** Cada nível regista se foi terminado sem undo, sem reinício e
sem dicas. É a métrica de mérito e a base do completionismo:

| Selo | Condição |
|---|---|
| Concluído | Tabuleiro limpo, por qualquer via |
| Limpo | Sem undo e sem reinício |
| Perfeito | Limpo e sem dicas |

O selo é sempre reconquistável — repetir um nível já concluído para o resolver
limpo é uma razão legítima para voltar atrás e um bom gerador de retenção.

### 6.3 Modo Tempo — time attack contínuo

- **Relógio único** que corre continuamente. Cada tabuleiro limpo **adiciona**
  tempo; a corrida acaba quando a velocidade do jogador deixa de acompanhar a
  exigência crescente.
- Níveis filtrados por **taxa de sobrevivência = 100%** (greedy-safe).
  O jogador nunca perde por jogar mal — só por ser lento.
- Sem undo (desnecessário: não há como bloquear).
- **Sem joker.** No modo tempo, o joker reduz precisamente a carga de
  reconhecimento que *é* o desafio, e a sua gestão exige um tempo de reflexão que
  o relógio não permite.
- Tabuleiros pequenos e encadeados, para o ritmo não quebrar.

**Curva de tempo.** Dois parâmetros a afinar em playtest:

- *Tempo concedido por tabuleiro limpo* — deve decrescer ao longo da corrida, ou
  crescer mais devagar do que a exigência.
- *Tempo inicial* — generoso, para o jogador entrar em flow antes da pressão.

**Dificuldade no modo tempo:** cortar segundos é o botão mais fraco. O forte é
aumentar a **carga de reconhecimento** — sobretudo o tamanho e a forma dos
grupos. Um par `1+6` vê-se instantaneamente; um grupo de cinco peças em S com
`1+1+2+2+1` demora segundos a encontrar.

**Combos devolvem tempo.** Cascatas e eliminações em sequência rápida somam
segundos ao relógio. É o loop de reforço que sustenta o modo: jogar bem compra
espaço para jogar mais. Grupos grandes (5+ peças) valem bónus proporcionalmente
maior — dá razão ao jogador para os procurar em vez de limpar só os pares.

**Formatos descartados:** *countdown por nível* (cria momentos mortos e fim
abrupto) e *endless com injeção de peças* (complica a garantia de
terminabilidade). Podem voltar mais tarde como variantes.

### 6.4 Puzzle diário

Mesma seed para todos os jogadores, um tabuleiro por dia. Custo de implementação
quase nulo dado o gerador determinístico; leaderboards vêm de graça.

---

## 7. Progressão

Separar **dois eixos** em vez de escalar um só:

- **Tamanho do tabuleiro** → esforço, duração da sessão
- **Densidade de armadilhas** → exigência de pensamento

Subir os dois em simultâneo produzia, na versão sem undo, níveis longos *e*
punitivos. **Com undo ilimitado, essa restrição cai:** um erro na jogada 30 custa
um toque, não o nível inteiro. Os dois eixos podem agora subir juntos, e os
níveis finais voltam a poder ser grandes e traiçoeiros ao mesmo tempo.

O que substitui a restrição é o **selo de resolução limpa** (6.2): é ele que
mantém a exigência real, sem a impor a quem só quer avançar.

Curva sugerida para o modo puzzle:

| Fase | Tabuleiro | Peças | Sobrevivência | Grupos |
|---|---|---|---|---|
| Tutorial | 4x4 | ~12 | 100% | Só pares |
| Início | 4x4 – 5x5 | 16–25 | >90% | Pares + trios |
| Meio | 5x5 – 6x6 | 25–36 | 50–70% | Até 4 peças; **joker introduzido** |
| Avançado | 6x6 – 7x6 | 30–42 | 20–40% | Todas |
| Perito | 6x6+ e silhuetas | 35–50 | <20% | Todas, mais 3s/4s/5s |

O joker (2.6) entra na fase média, com nível de tutorial próprio, e depois aparece
**esporadicamente** — não em todos os tabuleiros. Os níveis que o incluem são
construídos à volta dele: um ponto do tabuleiro que só ele resolve, para que a
pergunta seja *quando o gastar*.

Convém intercalar, dentro de cada fase, alguns níveis **curtos e muito densos**
(10–15 peças, sobrevivência <10%). Funcionam como puzzles de dedução puros,
resolvíveis em poucas jogadas, e são os candidatos naturais a "resolução
perfeita".

O limite de grupos por fase não é uma regra do jogo — é apenas a distribuição
usada pelo gerador. Composições grandes entram gradualmente, para o jogador
aprender a reconhecê-las.

### 7.1 Silhuetas como variedade

Como o formato irregular está autorizado (3.2), as fases podem alternar entre
retângulos e silhuetas — pirâmide, escada, ampulheta, arco. Além do valor
estético, o perfil altera a estrutura de adjacências: numa pirâmide, as colunas
laterais têm menos vizinhos e resolvem-se mais cedo, o que muda a ordem natural
de resolução.

---

## 8. Riscos de design

| Risco | Mitigação |
|---|---|
| O colapso de colunas é difícil de antecipar mentalmente → o puzzle vira sorte | Testar cedo em 4x4; se não der para planear 2–3 jogadas à frente, reconsiderar a mecânica |
| **Undo ilimitado torna o puzzle trivial** | O selo de resolução limpa (6.2) é que carrega a exigência; níveis desenhados para o selo, não para o "concluído" |
| Selo limpo ignorado pelo jogador casual | É opcional por desenho — o casual progride na mesma; o selo é para quem quer |
| Níveis difíceis lidos como injustos | Piso de justiça (6.2); nunca publicar solução única |
| Modo tempo indistinguível do puzzle com relógio | Corpora separados (6.1); dificuldade por tamanho de grupo, não por segundos |
| Grupos grandes tornam a seleção tediosa | Seleção tocar-a-acumular com soma visível; reduzir frequência de composições de 5+ na distribuição do gerador |
| Formas conexas complexas (T, S) difíceis de detetar a olho | Realce visual dos grupos válidos no tutorial; medir densidade de jogadas (5.2) |
| Silhuetas irregulares confundem quem espera um retângulo | Introduzir só depois do tutorial; começar com formas simétricas simples |
| **Joker mal usado mata o tabuleiro sem aviso** | Tutorial dedicado que ensina que há um valor certo; undo ilimitado; nunca introduzir antes da fase média |
| Joker dilui a competência central (aritmética) | Um por tabuleiro no máximo, e não em todos os tabuleiros |
| Joker torna os níveis mais fáceis em vez de mais difíceis | Só em níveis desenhados como estrangulamento; validar pela taxa de sobrevivência, que deve *descer* |

---

## 9. Monetização

### 9.1 Princípios

**A variedade é do jogo base, não do premium.** Silhuetas, tamanhos de tabuleiro,
todas as 14 composições, ambos os modos e o puzzle diário fazem parte da
experiência gratuita. O jogador que nunca pague tem de ter acesso a **todos os
tipos de nível** — o que se vende é *quantidade* e *curadoria*, nunca variedade
mecânica. Um jogo que esconde metade das suas ideias atrás de um paywall lê-se
como amostra, não como jogo.

**Nada que afete leaderboards é vendável.** Puzzle diário e time attack são
competitivos. Comprar segundos ou vantagens aí destrói o significado da tabela.
A monetização vive na campanha, ou em coisas que não tocam no jogo.

**O incentivo tem de estar alinhado.** Vender frustração (vidas, tentativas,
undos) cria pressão económica para tornar os níveis irritantes. Vender conteúdo
e cosméticos cria pressão para o jogo ser bom.

### 9.2 Fontes de receita

| Fonte | Descrição | Custo de produção |
|---|---|---|
| **Compra única** | Desbloqueia a campanha completa, remove anúncios, dicas ilimitadas | Nulo |
| **Packs de níveis** | Volume adicional e curadoria temática, para quem esgotou a campanha | Uma noite de geração offline |
| **Arquivo do diário** | Acesso a puzzles diários anteriores, estatísticas, proteção de streak | Quase nulo (seeds determinísticas) |
| **Cosméticos** | Skins de dados, temas de tabuleiro, efeitos de eliminação, som | Investimento em arte |
| **Anúncios recompensados** | Vídeo opcional por uma dica | Nulo |

**Estrutura gratuita/pago sugerida:**

- Grátis: campanha inicial substancial (50–80 níveis, cobrindo todas as fases e
  todos os tipos de tabuleiro), modo tempo completo, puzzle diário do dia.
- Compra única: resto da campanha, sem anúncios, dicas ilimitadas.
- Packs: conteúdo adicional pós-campanha.

Os packs são **volume**, não features. "Pack Perito: mais 100 níveis abaixo dos
20%" é legítimo; "Pack Silhuetas: desbloqueia tabuleiros irregulares" não é —
esses já existem no jogo base.

### 9.3 A evitar

- **Vidas ou energia.** Letal aqui: o loop central é repetir um tabuleiro difícil
  vezes sem conta. Cobrar por tentativas destrói exatamente o que torna o modo
  puzzle bom.
- **Vender undos, tempo ou jokers.** Ver 3.3 e o princípio dos leaderboards. O
  joker é um elemento de desenho do nível (2.6), não um consumível — vendê-lo
  seria vender vantagem e inverteria o seu propósito.
- **Anúncios intersticiais.** O ciclo *falhar → reiniciar em meio segundo →
  tentar outra vez* não sobrevive a uma interrupção.

---

## 10. Próximos passos

1. Especificar o motor: representação do tabuleiro, deteção de grupos (com e sem
   joker), aplicação de jogada, gravidade e colapso.
2. Protótipo do gerador reverso + medição de dificuldade.
3. Validar com playtests em tabuleiros pequenos antes de investir em UI.
