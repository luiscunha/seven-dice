/**
 * Núcleo da camada de sessão: estado, seleção, histórico, undo, reinício, dicas.
 *
 * **Não sabe em que modo está.** O relógio, a pontuação e os selos vivem nas
 * sessões de modo, que compõem esta (spec §1.1). Aqui não há `Date.now()`, não
 * há DOM e não há armazenamento — tudo isso entra por parâmetro, para que a
 * sessão inteira seja testável como função pura.
 *
 * As transições devolvem estado novo. É gratuito porque a engine é imutável, e
 * é o que torna o undo uma pilha de tabuleiros e nada mais (spec §1.1).
 */

import type { Board, Group, Level, Packed } from "@septet/engine";
import {
  JOKER,
  TARGET,
  applyMove,
  boardKey,
  cellAt,
  findSolution,
  isEmpty,
  isValidGroup,
  jokerValue,
  toGroup,
} from "@septet/engine";


/** Porque é que uma peça tocada não entrou na seleção. */
export type TapRejection =
  | "no-piece"
  | "board-finished"
  | "over-target"
  | "joker-cap";

export type HintSource = "stored" | "computed" | "none";

export interface GameState {
  readonly level: Level;
  readonly board: Board;
  /** Pilha de tabuleiros anteriores. É toda a implementação do undo. */
  readonly history: readonly Board[];
  /** Por ordem de toque, não canónica — normaliza-se com `toGroup` na fronteira. */
  readonly selection: readonly Packed[];

  readonly moves: number;
  readonly undos: number;
  readonly restarts: number;
  readonly hints: number;

  /** `undefined` quando o último toque foi aceite. */
  readonly rejection?: TapRejection;
}

export const startGame = (level: Level): GameState => ({
  level,
  board: level.board,
  history: [],
  selection: [],
  moves: 0,
  undos: 0,
  restarts: 0,
  hints: 0,
});

export const isFinished = (s: GameState): boolean => isEmpty(s.board);

/** Soma das faces fixas da seleção. O joker conta 0 (spec §3.2). */
export function selectionSum(b: Board, selection: readonly Packed[]): number {
  let sum = 0;
  for (const p of selection) {
    const v = cellAt(b, p);
    if (v !== undefined && v !== JOKER) sum += v;
  }
  return sum;
}

export const selectionHasJoker = (
  b: Board,
  selection: readonly Packed[],
): boolean => selection.some((p) => cellAt(b, p) === JOKER);

/**
 * A soma que as faces fixas da seleção têm de atingir.
 *
 * Sem joker é `TARGET`, como sempre. **Com joker é `TARGET − valor do joker`** —
 * e é daí que vem toda a simplicidade do resto.
 *
 * O valor do joker está globalmente determinado (spec §2.6): só um número entre
 * 1 e 6 permite esvaziar o tabuleiro. Logo também só existe uma soma correta
 * para as fixas de um grupo com joker, e a partir daí o joker comporta-se como
 * qualquer outra peça — acumula-se até ao alvo e elimina.
 *
 * `TARGET − 1` é o recuo para o caso em que já não há valor possível, que só
 * acontece num tabuleiro que já não fecha.
 */
function targetFor(board: Board, hasJoker: boolean): number {
  if (!hasJoker) return TARGET;

  const required = jokerValue(board);
  return required === undefined ? TARGET - 1 : TARGET - required;
}

/**
 * Tocar acumula; tocar outra vez retira. Ao atingir o alvo, elimina.
 *
 * **Uma peça que faça a soma passar do alvo é recusada**, não aceite. Como as
 * faces são >= 1 e o alvo é exato, a soma só cresce: uma seleção acima do alvo
 * nunca mais dá grupo válido, e aceitá-la só deixaria o jogador a desfazer à mão.
 *
 * Isto vale **também com joker**, e é o que torna o joker gerível sem explicação
 * nenhuma. A primeira versão desta camada punha o teto em 6 — a condição que o
 * motor aceita — e aí a seleção ficava válida logo à primeira peça encostada ao
 * joker, obrigando a um botão de confirmação para o jogador poder juntar mais.
 * Com o teto no valor certo esse problema desaparece: nunca há duas seleções
 * válidas diferentes, porque juntar mais peças só aumenta a soma.
 *
 * O que se perde é a jogada que mata o tabuleiro em silêncio, que o plano §2.6
 * desenhou de propósito. Perde-se por escolha: essa jogada já era incompatível
 * com o piso de justiça — tanto que as bandas com joker o excluem — e a decisão
 * que torna o joker interessante mantém-se intacta, porque continua a ser preciso
 * descobrir **qual** grupo atinge o alvo.
 */
export function tap(s: GameState, p: Packed): GameState {
  if (isFinished(s)) return { ...s, rejection: "board-finished" };
  if (cellAt(s.board, p) === undefined) return { ...s, rejection: "no-piece" };

  if (s.selection.includes(p)) {
    return omitRejection({
      ...s,
      selection: s.selection.filter((q) => q !== p),
    });
  }

  const selection = [...s.selection, p];
  const sum = selectionSum(s.board, selection);
  const hasJoker = selectionHasJoker(s.board, selection);
  const alvo = targetFor(s.board, hasJoker);

  if (sum > alvo) {
    return { ...s, rejection: hasJoker ? "joker-cap" : "over-target" };
  }

  const group = toGroup(selection);

  if (sum === alvo && isValidGroup(s.board, group)) {
    return applyGroup(s, group);
  }

  return omitRejection({ ...s, selection });
}

/** A soma que falta para a seleção atual fechar. Zero quando está no alvo. */
export function remainingToTarget(s: GameState): number {
  const hasJoker = selectionHasJoker(s.board, s.selection);
  return targetFor(s.board, hasJoker) - selectionSum(s.board, s.selection);
}

export const clearSelection = (s: GameState): GameState =>
  omitRejection({ ...s, selection: [] });

/**
 * Desfaz: primeiro a última peça tocada, depois a última jogada.
 *
 * **Ilimitado e grátis** (plano §3.3). O undo é o jogador a corrigir uma ação
 * sua; o recurso escasso é a dica, não isto — limitar o undo lê-se como taxa
 * sobre o erro.
 */
export function undo(s: GameState): GameState {
  if (s.selection.length > 0) {
    return omitRejection({ ...s, selection: s.selection.slice(0, -1) });
  }

  const previous = s.history[s.history.length - 1];
  if (previous === undefined) return s;

  return omitRejection({
    ...s,
    board: previous,
    history: s.history.slice(0, -1),
    selection: [],
    moves: s.moves - 1,
    undos: s.undos + 1,
  });
}

/** Reinício instantâneo, mesmo tabuleiro (plano §6.2). */
export const restart = (s: GameState): GameState =>
  omitRejection({
    ...s,
    board: s.level.board,
    history: [],
    selection: [],
    moves: 0,
    restarts: s.restarts + 1,
  });

export interface HintResult {
  readonly state: GameState;
  readonly group?: Group;
  readonly source: HintSource;
}

/**
 * A dica.
 *
 * Enquanto o jogador segue a solução guardada no nível, é de graça — basta ler o
 * passo seguinte (spec §4.3). Assim que ele sai dela, é preciso resolver o
 * tabuleiro atual, e isso é caro. A distinção fica no resultado para que a UI
 * possa mostrar progresso no caso lento.
 *
 * O custo contabiliza-se sempre, seja qual for a origem: é a dica que decide o
 * selo Perfeito, e de onde ela veio não interessa ao mérito.
 */
export function hint(s: GameState): HintResult {
  if (isFinished(s)) return { state: s, source: "none" };

  const spent = { ...s, hints: s.hints + 1 };
  const stored = s.level.solution[s.moves];

  if (stored !== undefined && onStoredPath(s)) {
    return { state: spent, group: stored, source: "stored" };
  }

  const solution = findSolution(s.board);
  const first = solution?.[0];

  if (first === undefined) return { state: spent, source: "none" };
  return { state: spent, group: first, source: "computed" };
}

/**
 * O jogador ainda está no caminho que o nível traz guardado?
 *
 * Não basta o passo guardado ser um grupo válido no tabuleiro atual: um jogador
 * que se desviou pode ter chegado a um estado onde esse grupo por acaso existe,
 * e a dica mandá-lo-ia para uma solução que já não serve. A verificação exata é
 * comparar o tabuleiro atual com o que sai de aplicar os primeiros `moves`
 * passos guardados, e a chave canónica faz isso numa comparação de strings.
 *
 * Custa `O(moves)`, e só corre quando o jogador pede dica.
 */
function onStoredPath(s: GameState): boolean {
  let b = s.level.board;

  for (let i = 0; i < s.moves; i++) {
    const g = s.level.solution[i];
    if (g === undefined || !isValidGroup(b, g)) return false;
    b = applyMove(b, g);
  }

  return boardKey(b) === boardKey(s.board);
}

function applyGroup(s: GameState, group: Group): GameState {
  return omitRejection({
    ...s,
    board: applyMove(s.board, group),
    history: [...s.history, s.board],
    selection: [],
    moves: s.moves + 1,
  });
}

/**
 * `exactOptionalPropertyTypes` não deixa atribuir `undefined` a uma propriedade
 * opcional, e espalhar `rejection: undefined` seria isso. Retira-se a chave.
 */
function omitRejection(s: GameState & { rejection?: TapRejection }): GameState {
  const { rejection: _ignored, ...rest } = s;
  return rest;
}
