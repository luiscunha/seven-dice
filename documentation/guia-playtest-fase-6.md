# Guião do playtest — Fase 6

> Este documento é um **protocolo de medição**, não um manual do jogo. Existe
> para uma tarde produzir uma decisão escrita, e não só impressões.

---

## A pergunta

Uma só, e é a única que nenhuma métrica da fase 5 responde. É o risco nº 1 do
plano §8:

> **O colapso de colunas é difícil de antecipar mentalmente → o puzzle vira
> sorte.**

O critério é concreto:

> **Num tabuleiro de 4x4, consegues planear 2–3 jogadas à frente?**

Se a resposta for não, a mecânica de reorganização tem de mudar — e isso invalida
tudo o que está construído a partir da fase 1. É por isso que esta pergunta se
faz **agora**, antes de existir uma linha de UI, e não depois.

---

## Como correr

```bash
pnpm dice7 play --band tutorial --log playtest.jsonl
```

Outras formas de escolher o tabuleiro:

```bash
pnpm dice7 play --band meio-joker      # primeira da banda
pnpm dice7 play --id perito-000526     # um nível concreto
pnpm dice7 play --seed 77 --band denso # gera na hora, mesmo que a banda o rejeite
```

`--log` acrescenta uma linha JSON por sessão. **Usa sempre** — é isso que
transforma a tarde em dados.

## Comandos

| | |
|---|---|
| `b2` | toca na peça — coluna por letra, linha **a partir da base** |
| `b2 c2 c3` | toca em várias de uma vez |
| `a1=5` | no joker, escolhe o valor que ele toma nesta jogada |
| `z` | desfaz: primeiro a última peça tocada, depois a última jogada |
| `c` | limpa a seleção |
| `r` | reinicia |
| `h` | dica |
| `g` | lista os grupos válidos |
| `s` | liga/desliga o modo de dois passos |
| `q` | sai |

**As coordenadas são as do motor**, com a linha contada da base para cima. Não é
descuido: uma numeração "amiga" contaminaria justamente o que se está a medir.

---

## O protocolo

Faz isto por esta ordem. Cada passo responde a uma coisa diferente.

### 1. Aquecimento — 3 níveis de `tutorial`

Só para ganhares o vocabulário. Não registes conclusões daqui.

### 2. **O teste principal** — 6 a 8 níveis de `tutorial` ou `inicio`

Antes de **cada** jogada a partir da segunda:

1. Escolhe o grupo que vais eliminar.
2. **Diz em voz alta, ou escreve, como vai ficar o tabuleiro** — que peças
   descem, que colunas desaparecem, quem fica ao lado de quem.
3. Só depois joga.
4. Acertaste?

Regista, por nível: **quantas previsões fizeste e quantas acertaste.**

É este número que decide a fase. Não é a sensação de dificuldade — é a taxa de
acerto da previsão.

### 3. O modo de dois passos — os mesmos níveis outra vez

Liga com `s` e repete o exercício. O modo mostra a jogada separada em duas
transformações: primeiro o buraco, depois a queda e o deslize.

A pergunta: **a taxa de acerto sobe?** Se subir muito, a mecânica é previsível
mas a *apresentação* é que a esconde — e a resposta é animar as duas
transformações em separado na UI (plano §8), não mudar a regra.

### 4. Grupos grandes — 3 níveis de `avancado` ou `perito`

O risco secundário do plano §3.1: grupos de 5 a 7 peças podem ser vistosos ou
tediosos. Repara em quanto tempo passas a **varrer** o tabuleiro à procura,
contra a planear.

### 5. O joker — 3 níveis de `meio-joker` ou `denso`

O joker aparece como `*`, e **é o jogador que escolhe quanto ele vale**. Na
consola escreve-se `a1=5`; na UI abre-se um seletor com as seis faces em cima da
peça. Escolhido o valor, acumula-se e elimina como qualquer outro grupo.

> **Isto mudou três vezes desde a primeira tarde de playtest**, e a terceira foi
> a lição: forçar o joker ao valor certo dispensava botões e tutoriais, mas
> levava a sobrevivência da banda `denso` de 0,141 para 0,957. Toda a
> dificuldade dela vinha de se poder gastar o joker mal.

A pergunta:

- Sabendo o valor, decidir **em que grupo o gastas** é interessante?
- Gastá-lo mal mata o tabuleiro várias jogadas depois. Isso lê-se como
  profundidade ou como armadilha?

A resposta decide o tutorial dedicado que o plano §2.6 exige.

---

## O que registar

O ficheiro de `--log` guarda o mecânico: jogadas, undos, reinícios, dicas, selo.
O que ele **não** guarda, e é o que interessa, escreve-se à mão:

| Campo | |
|---|---|
| Previsões feitas / acertadas | por nível, do passo 2 |
| O mesmo com dois passos ligados | passo 3 |
| Onde falhaste a previsão | foi a gravidade, ou o colapso de colunas? |
| Grupos grandes | vistosos ou tediosos? |
| Joker | dedução ou armadilha? |

---

## A decisão

No fim, escreve **uma** destas três, com o número que a sustenta:

- **Verde** — a previsão acerta a maior parte das vezes. A mecânica fica. Segue a
  fase 7.
- **Amarelo** — a previsão só acerta com o modo de dois passos. A mecânica fica,
  mas a UI da fase 8 tem de animar gravidade e colapso em separado, e isso passa
  a requisito, não a preferência.
- **Vermelho** — a previsão falha mesmo com ajuda. A regra de reorganização tem
  de mudar, e o plano volta à fase 1.

Uma tarde. É muito mais barato do que descobri-lo depois da UI.
