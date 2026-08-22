/**
 * Modo Survival — tabuleiro aberto, com peças a entrar.
 *
 * O terceiro modo, e o primeiro que **não herda a garantia central do projeto**.
 * Na campanha nenhum nível publicado é impossível, e isso vem da construção
 * reversa validada por simulação. Aqui não há nível: há um fluxo. O jogador vai
 * perder, e a pergunta é quando — como em qualquer jogo de sobrevivência.
 *
 * Isso não é uma brecha na garantia, é outro contrato. O que a garantia protege
 * é a promessa da campanha: «isto tem solução». O Survival nunca a faz.
 *
 * ### As três decisões que dão forma ao modo
 *
 * **A linha entra pelo topo.** As colunas guardam-se de baixo para cima,
 * portanto acrescentar por cima é um `concat` e nada mais se mexe. Pelo lado
 * seria igualmente barato de escrever e uma confusão a jogar: o colapso já
 * empurra colunas para a esquerda, e ficavam dois movimentos laterais a competir.
 *
 * **A linha entra à largura cheia.** Se seguisse a largura atual, limpar uma
 * coluna encolhia a área de jogo para sempre e o jogador era punido por jogar
 * bem. À largura cheia, o colapso é alívio: as peças que caem sobre o vazio
 * descem à base pela gravidade normal, e a largura repõe-se.
 *
 * **Puxar a linha paga.** Um botão que só faz mal nunca é premido, e seria UI
 * morta. Puxar de vontade própria rende pontos proporcionais ao espaço que
 * ainda existe — e reinicia o contador da injeção automática. A decisão passa a
 * ser real: puxo agora, com folga, para arrecadar pontos e comprar tempo, ou
 * seguro e arrisco que a automática caia no pior momento? É a mesma tensão
 * entre ganância e segurança que sustenta o jogo todo.
 *
 * ### Sem joker, por enquanto
 *
 * O valor do joker está *globalmente determinado* pela soma do tabuleiro, e essa
 * regra só existe porque o tabuleiro da campanha é finito e destina-se a ficar
 * vazio. Aqui não há tabuleiro final, portanto não há valor determinado. Fica de
 * fora até a pergunta ter resposta — e quando tiver, o joker aqui será uma peça
 * **diferente** da da campanha: um curinga livre, resgate em vez de armadilha.
 *
 * Nada aqui lê o relógio nem `Math.random()`. As linhas derivam da seed pelo
 * índice, portanto a mesma seed dá sempre a mesma corrida — que é o que torna
 * uma pontuação comparável e uma seed partilhável.
 */

import type { Board, Cell, Level, Packed } from "@dicetoseven/engine";
import {
  JOKER,
  deriveSeed,
  isEmpty,
  jokerAt,
  mulberry32,
  pushRow,
  randInt,
  tallestColumn,
  totalSum,
  weightedIndex,
} from "@dicetoseven/engine";

import type { GameState, JokerValue } from "./GameSession";
import { startGame, tap } from "./GameSession";
import type { ScoringConfig } from "./scoring";
import { DEFAULT_SCORING, moveScore } from "./scoring";

/** Uma linha por injetar. `null` deixa a coluna como está. */
export type Linha = readonly (Cell | null)[];

export interface SurvivalConfig {
  /** Largura da linha injetada, e portanto a largura a que o tabuleiro volta. */
  readonly largura: number;
  /** Linhas no arranque. Poucas: o jogador tem de ver o tabuleiro a encher. */
  readonly alturaInicial: number;
  /**
   * Passar daqui é perder.
   *
   * **Sete, e quem manda é o piso de toque.** A 320px de largura, o palco que
   * sobra depois da fila e do rodapé dá 348px de altura: com nove linhas a peça
   * ficava a 39px, abaixo dos 44 que o projeto fixou. Com sete dá 46px.
   *
   * O custo mediu-se: 78 jogadas por corrida em vez de 92, com ramificação 9.2.
   * Quinze por cento mais curta, e jogável com o dedo — que não é uma troca
   * difícil quando 80% de quem vai jogar está no telemóvel.
   */
  readonly alturaMaxima: number;

  /** Jogadas entre injeções automáticas, no início. */
  readonly jogadasPorLinha: number;
  /** O piso desse contador, por muito que a corrida se prolongue. */
  readonly minJogadasPorLinha: number;
  /** Quantas linhas injetadas até o contador descer uma unidade. */
  readonly linhasPorDegrau: number;

  /** Quantas linhas o jogador vê à frente. */
  readonly previsao: number;

  /**
   * Puxar de vontade própria dá um **multiplicador temporário**, não pontos.
   *
   * A primeira versão dava um prémio fixo por linha de folga, e a simulação
   * mostrou que era uma armadilha: puxar cedo perdia ~40% de pontuação a
   * qualquer preço testado, entre 25 e 200 por linha. A razão não é de afinação
   * — é de forma. Puxar custa **espaço**, e o espaço é o recurso que gera todos
   * os pontos futuros; nenhuma soma fixa compete com um valor que compõe.
   *
   * Um multiplicador compõe da mesma maneira: aplica-se às jogadas que se fazem
   * com o espaço que ainda resta. Cresce com a folga, portanto puxar cedo vale
   * mais — que continua a ser a estratégia que o prémio quer ensinar.
   */
  readonly bonusPorFolga: number;
  /** Teto do multiplicador, para puxar num tabuleiro vazio não descolar. */
  readonly bonusMaximo: number;
  /** Durante quantas jogadas o multiplicador se mantém. */
  readonly jogadasComBonus: number;

  /**
   * Prémio por esvaziar o tabuleiro. Raro de propósito — ver `restoParaLimpar`.
   */
  readonly bonusTabuleiroLimpo: number;

  /**
   * Peso de cada face, de 1 a 6.
   *
   * **É o parâmetro que decide se o modo existe.** Faces baixas combinam-se de
   * mais maneiras — um 1 encaixa em quase todo o lado, um 6 exige um 1 ao lado.
   *
   * Medido em 150 corridas por perfil, com um jogador guloso:
   *
   * | pesos | jogadas | posições sem jogada | ramificação |
   * |---|---|---|---|
   * | uniforme | 33 | **24.1%** | 2.5 |
   * | `[3,3,2,2,1,1]` | 67 | 14.1% | 6.9 |
   * | `[4,3,2,1,1,1]` | 92 | 10.7% | 14.5 |
   * | `[5,4,3,2,1,1]` | 102 | 9.8% | 14.8 |
   *
   * Uniforme não é uma afinação conservadora, é um jogo partido: um quarto das
   * posições sem jogada nenhuma. O ganho achata-se depois de `[4,3,2,1,1,1]`, e
   * é aí que fica — 10% de posições sem saída ainda dá ao botão de puxar uma
   * razão para existir, sem o tornar a mecânica principal.
   */
  readonly pesos: readonly number[];

  /** O joker entra nas linhas novas. É uma opção do jogador. */
  readonly comJoker: boolean;
  /**
   * Peças entre jokers.
   *
   * Conta-se em peças e não em linhas para o encontro não ficar preso à largura
   * do tabuleiro. Só entra um se o tabuleiro não tiver já um — a invariante 3
   * não admite dois, e `pushRow` recusa-o.
   */
  readonly pecasPorJoker: number;
}

export const DEFAULT_SURVIVAL: SurvivalConfig = {
  largura: 7,
  alturaInicial: 5,
  alturaMaxima: 7,
  jogadasPorLinha: 5,
  minJogadasPorLinha: 2,
  linhasPorDegrau: 6,
  previsao: 1,
  bonusPorFolga: 0.25,
  bonusMaximo: 2.5,
  jogadasComBonus: 8,
  bonusTabuleiroLimpo: 500,
  pesos: [4, 3, 2, 1, 1, 1],
  comJoker: true,
  pecasPorJoker: 25,
};

export interface SurvivalState {
  readonly game: GameState;
  readonly score: number;

  /** Quantas linhas já entraram. É também o índice da próxima na fila. */
  readonly linhasInjetadas: number;
  /** Jogadas desde a última linha. Chega ao limite, cai outra. */
  readonly jogadasDesdeLinha: number;
  /** Tabuleiros esvaziados por completo. É o objetivo do modo. */
  readonly limpezas: number;
  /** Peças entradas desde o último joker. Decide quando aparece o próximo. */
  readonly pecasDesdeJoker: number;
  /** O tabuleiro ficou vazio. A corrida acabou, e acabou bem. */
  readonly limpo: boolean;

  /** Multiplicador em vigor, de puxar uma linha. `1` quando não há. */
  readonly multiplicador: number;
  /** Jogadas que faltam até ele expirar. */
  readonly jogadasComBonus: number;

  readonly morto: boolean;
  readonly seed: number;
}

/* ─── A fila ──────────────────────────────────────────────────────────────── */

/**
 * A linha de índice `i`, derivada só da seed.
 *
 * Pura em `i`: a fila que o jogador vê é exatamente a que vai receber, aconteça
 * o que acontecer ao tabuleiro entretanto. Sem isto a previsão era decorativa —
 * e a previsão é a razão de ser do modo.
 */
export function linhaDe(
  seed: number,
  i: number,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
  comJoker = false,
): readonly Cell[] {
  const rng = mulberry32(deriveSeed(seed, i));
  const linha: Cell[] = [];
  for (let c = 0; c < config.largura; c++) {
    linha.push((weightedIndex(rng, config.pesos) + 1) as Cell);
  }

  // O joker toma o lugar de uma face, em coluna sorteada pela mesma seed.
  if (comJoker) linha[randInt(rng, config.largura)] = JOKER;

  return linha;
}

/**
 * O joker entra nesta linha?
 *
 * Contado em peças, e só se o tabuleiro não tiver já um — a invariante 3 não
 * admite dois. É a mesma função que a fila usa e que a injeção usa, portanto o
 * joker que se vê na previsão é o joker que cai.
 */
export const trazJoker = (
  s: SurvivalState,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
): boolean =>
  config.comJoker &&
  s.pecasDesdeJoker >= config.pecasPorJoker &&
  jokerAt(s.game.board) === undefined;

/** A linha que entra a seguir. É a única que se mostra. */
export const proximaLinha = (
  s: SurvivalState,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
): readonly Cell[] =>
  linhaDe(s.seed, s.linhasInjetadas, config, trazJoker(s, config));

/* ─── Leituras ────────────────────────────────────────────────────────────── */

/** Linhas de folga entre a coluna mais alta e o teto. Zero é estar a morrer. */
export const folga = (
  s: SurvivalState,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
): number => Math.max(0, config.alturaMaxima - tallestColumn(s.game.board));

/**
 * Quanto falta à soma do tabuleiro para ser múltipla de 7.
 *
 * Cada jogada tira exatamente 7, portanto **um tabuleiro só pode ficar vazio se
 * a sua soma for múltipla de 7**. Na campanha isso é garantido na geração; aqui
 * as linhas fazem a soma derivar, e limpar o tabuleiro passa a ser um acidente
 * que se persegue em vez de um objetivo.
 *
 * É condição necessária, não suficiente: `0` quer dizer «vale a pena tentar»,
 * qualquer outro valor quer dizer «hoje não dá, de certeza».
 */
export const restoParaLimpar = (s: SurvivalState): number =>
  totalSum(s.game.board) % 7;

/** Jogadas entre injeções, já com a aceleração da corrida aplicada. */
export const cadencia = (
  s: SurvivalState,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
): number =>
  Math.max(
    config.minJogadasPorLinha,
    config.jogadasPorLinha - Math.floor(s.linhasInjetadas / config.linhasPorDegrau),
  );

/* ─── Arranque ────────────────────────────────────────────────────────────── */

/** O nível sintético que o `GameSession` pede. Não há ficheiro por trás. */
const nivelDe = (seed: number, board: Board): Level => ({
  id: `survival-${String(seed)}`,
  seed,
  board,
  solution: [] as never,
});

export function startSurvival(
  seed: number,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
): SurvivalState {
  let board: Board = [];
  for (let i = 0; i < config.alturaInicial; i++) {
    board = pushRow(board, linhaDe(seed, i, config));
  }

  return {
    game: startGame(nivelDe(seed, board)),
    score: 0,
    linhasInjetadas: config.alturaInicial,
    jogadasDesdeLinha: 0,
    limpezas: 0,
    pecasDesdeJoker: 0,
    limpo: false,
    multiplicador: 1,
    jogadasComBonus: 0,
    morto: false,
    seed,
  };
}

/** O multiplicador que puxar agora daria. Cresce com a folga, com teto. */
export const multiplicadorAoPuxar = (
  s: SurvivalState,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
): number =>
  Math.min(config.bonusMaximo, 1 + folga(s, config) * config.bonusPorFolga);

/* ─── Injeção ─────────────────────────────────────────────────────────────── */

const comTabuleiro = (s: SurvivalState, board: Board): SurvivalState => ({
  ...s,
  game: { ...s.game, board, selection: [], history: [] },
});

/**
 * Faz cair a próxima linha.
 *
 * `voluntaria` decide se paga: puxar é uma escolha e uma escolha premeia-se; a
 * automática é a pressão e não paga nada. O histórico é limpo porque não há
 * undo neste modo — e guardá-lo seria prometer um retrocesso que não existe.
 */
export function injectRow(
  s: SurvivalState,
  voluntaria: boolean,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
): SurvivalState {
  if (s.morto || s.limpo) return s;

  const bonus = voluntaria
    ? { multiplicador: multiplicadorAoPuxar(s, config), jogadasComBonus: config.jogadasComBonus }
    : { multiplicador: s.multiplicador, jogadasComBonus: s.jogadasComBonus };

  const comJoker = trazJoker(s, config);
  const board = pushRow(s.game.board, proximaLinha(s, config));

  return {
    ...comTabuleiro(s, board),
    ...bonus,
    linhasInjetadas: s.linhasInjetadas + 1,
    jogadasDesdeLinha: 0,
    // O contador reinicia quando o joker cai, e acumula quando não cai.
    pecasDesdeJoker: comJoker ? 0 : s.pecasDesdeJoker + config.largura,
    morto: tallestColumn(board) > config.alturaMaxima,
  };
}

/* ─── Jogada ──────────────────────────────────────────────────────────────── */

export interface SurvivalTap {
  readonly state: SurvivalState;
  /** A jogada aconteceu, e não foi só um toque a acumular seleção. */
  readonly moved: boolean;
  readonly gainedScore: number;
  /** A jogada fez cair uma linha automática. */
  readonly injected: boolean;
  /** A jogada esvaziou o tabuleiro. */
  readonly cleared: boolean;
}

const parado = (s: SurvivalState): SurvivalTap => ({
  state: s,
  moved: false,
  gainedScore: 0,
  injected: false,
  cleared: false,
});

/**
 * Um toque.
 *
 * Depois de uma jogada a sério, três coisas por esta ordem: pontuar, ver se o
 * tabuleiro ficou limpo, e ver se chegou a hora da linha automática. A ordem
 * importa — pontuar a limpeza *antes* de injetar é o que faz o prémio ser do
 * jogador e não do acaso da linha seguinte.
 */
export function survivalTap(
  s: SurvivalState,
  p: Packed,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
  scoring: ScoringConfig = DEFAULT_SCORING,
  /** O valor que o jogador deu ao joker. Obrigatório ao tocar-lhe. */
  jokerAs?: JokerValue,
): SurvivalTap {
  if (s.morto || s.limpo) return parado(s);

  const antes = s.game;
  const candidato = antes.selection.includes(p)
    ? [...antes.selection]
    : [...antes.selection, p];

  const game = tap(antes, p, jokerAs);
  const jogou = game.history.length > antes.history.length;

  if (!jogou) return { ...parado(s), state: { ...s, game } };

  /*
   * Sem combo por tempo, e é deliberado. O `registerMove` de `combos.ts` mede o
   * intervalo entre jogadas, o que introduziria pressão de relógio num modo
   * cuja pressão é **espaço**. Aqui o mérito vem do tamanho do grupo, como na
   * campanha, e quem pára a pensar não é castigado por isso.
   */
  let ganho = moveScore(candidato.length, 1, scoring);

  const limpou = isEmpty(game.board);
  if (limpou) ganho += config.bonusTabuleiroLimpo;

  // O multiplicador de puxar aplica-se a tudo o que se ganha enquanto durar.
  const comBonus = s.jogadasComBonus > 0;
  if (comBonus) ganho = Math.round(ganho * s.multiplicador);

  const restantes = comBonus ? s.jogadasComBonus - 1 : 0;

  const jogadas = s.jogadasDesdeLinha + 1;
  let seguinte: SurvivalState = {
    ...s,
    game,
    score: s.score + ganho,
    jogadasDesdeLinha: jogadas,
    limpezas: limpou ? s.limpezas + 1 : s.limpezas,
    limpo: limpou,
    jogadasComBonus: restantes,
    multiplicador: restantes > 0 ? s.multiplicador : 1,
  };

  /*
   * **Limpar o tabuleiro acaba a corrida**, e acaba-a bem. É o objetivo do modo:
   * o relógio corre até lá, e o tempo é a marca. Não se injeta mais nada por
   * cima de uma vitória.
   */
  const injeta = !limpou && jogadas >= cadencia(seguinte, config);
  if (injeta) seguinte = injectRow(seguinte, false, config);

  return {
    state: seguinte,
    moved: true,
    gainedScore: ganho,
    injected: injeta,
    cleared: limpou,
  };
}

/** Puxar a linha por vontade própria. É onde está a decisão do modo. */
export const puxarLinha = (
  s: SurvivalState,
  config: SurvivalConfig = DEFAULT_SURVIVAL,
): SurvivalState => injectRow(s, true, config);
