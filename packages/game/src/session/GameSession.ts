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

import type { Board, Group, Level, Packed } from "@dicetoseven/engine";
import {
  JOKER,
  TARGET,
  applyMove,
  boardKey,
  cellAt,
  findSolution,
  isEmpty,
  isValidGroup,
  toGroup,
} from "@dicetoseven/engine";


/** Porque é que uma peça tocada não entrou na seleção. */
export type TapRejection =
  | "no-piece"
  | "board-finished"
  | "over-target"
  | "joker-needs-value";

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

  /**
   * O valor que o jogador deu ao joker nesta seleção. `undefined` enquanto o
   * joker não estiver selecionado.
   */
  readonly jokerAs?: JokerValue;

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
 * O valor que o joker toma **nesta jogada**, escolhido pelo jogador.
 *
 * É o coração do desenho de `[M 2.6]`: só um valor esvazia o tabuleiro, mas o
 * jogo deixa escolher qualquer um — e escolher mal não bloqueia na hora. O
 * tabuleiro fica insolúvel em silêncio e só falha no fim.
 *
 * É daí que vem toda a dificuldade das bandas com joker. Medido: um joker em 12
 * peças custa −0,77 de sobrevivência, e num tabuleiro típico da banda `denso`
 * 77% das sequências acabam bloqueadas.
 *
 * **Escolher o valor ao tocar resolve a ambiguidade na origem.** Com o valor
 * fixado, a seleção volta a ter um alvo exato — 7 — e elimina sozinha como
 * qualquer outra, sem botão de confirmação. A alternativa era deixar o joker
 * indefinido e perguntar no fim, e aí `✳ + 2` e `✳ + 2 + 2` eram ambas
 * legítimas, sem o jogo poder adivinhar qual o jogador queria.
 */
export type JokerValue = 1 | 2 | 3 | 4 | 5 | 6;

export const JOKER_VALUES: readonly JokerValue[] = [1, 2, 3, 4, 5, 6];

/**
 * Soma da seleção, **contando o joker pelo valor escolhido**.
 *
 * Sem valor escolhido o joker conta 0 — mas isso só acontece antes de ele entrar
 * na seleção, porque tocar-lhe exige escolher.
 */
export function selectionTotal(s: GameState): number {
  return selectionSum(s.board, s.selection) + (s.jokerAs ?? 0);
}

/** Quanto falta para a seleção fechar. */
export const remainingToTarget = (s: GameState): number =>
  TARGET - selectionTotal(s);

/**
 * Tocar acumula; tocar outra vez retira.
 *
 * **No joker, `jokerAs` é obrigatório** — é o valor que ele toma nesta jogada, e
 * a interface pergunta-o no momento do toque. Tocar-lhe outra vez volta a
 * perguntar, o que permite mudar de ideias sem desfazer a seleção toda.
 *
 * **Uma peça que faça a soma passar de 7 é recusada**, não aceite: as faces são
 * >= 1 e a soma só cresce, portanto uma seleção acima de 7 nunca mais dá grupo
 * válido, e aceitá-la só deixaria o jogador a desfazer à mão.
 */
export function tap(
  s: GameState,
  p: Packed,
  jokerAs?: JokerValue,
): GameState {
  if (isFinished(s)) return { ...s, rejection: "board-finished" };

  const cell = cellAt(s.board, p);
  if (cell === undefined) return { ...s, rejection: "no-piece" };

  const isJoker = cell === JOKER;

  if (isJoker && jokerAs === undefined) {
    return { ...s, rejection: "joker-needs-value" };
  }

  // Tocar outra vez numa peça normal retira-a. No joker, um toque novo troca o
  // valor — retirá-lo faz-se a desfazer.
  if (s.selection.includes(p)) {
    if (isJoker) return omitRejection(omitJoker(s, jokerAs));

    return omitRejection({
      ...s,
      selection: s.selection.filter((q) => q !== p),
    });
  }

  const selection = [...s.selection, p];
  const escolhido = isJoker ? jokerAs : s.jokerAs;
  const total = selectionSum(s.board, selection) + (escolhido ?? 0);

  if (total > TARGET) {
    return { ...s, rejection: "over-target" };
  }

  const seguinte = omitJoker({ ...s, selection }, escolhido);
  const group = toGroup(selection);

  if (total === TARGET && isValidGroup(s.board, group)) {
    return applyGroup(seguinte, group);
  }

  return omitRejection(seguinte);
}

export const clearSelection = (s: GameState): GameState =>
  omitRejection(semJoker({ ...s, selection: [] }));

/**
 * Desfaz: primeiro a última peça tocada, depois a última jogada.
 *
 * **Ilimitado e grátis** (plano §3.3). O undo é o jogador a corrigir uma ação
 * sua; o recurso escasso é a dica, não isto — limitar o undo lê-se como taxa
 * sobre o erro.
 */
export function undo(s: GameState): GameState {
  if (s.selection.length > 0) {
    const selection = s.selection.slice(0, -1);
    const aindaTemJoker = selectionHasJoker(s.board, selection);

    return omitRejection(
      aindaTemJoker ? { ...s, selection } : semJoker({ ...s, selection }),
    );
  }

  const previous = s.history[s.history.length - 1];
  if (previous === undefined) return s;

  return omitRejection(
    semJoker({
      ...s,
      board: previous,
      history: s.history.slice(0, -1),
      selection: [],
      moves: s.moves - 1,
      undos: s.undos + 1,
    }),
  );
}

/** Reinício instantâneo, mesmo tabuleiro (plano §6.2). */
export const restart = (s: GameState): GameState =>
  omitRejection(
    semJoker({
      ...s,
      board: s.level.board,
      history: [],
      selection: [],
      moves: 0,
      restarts: s.restarts + 1,
    }),
  );

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
  return omitRejection(
    semJoker({
      ...s,
      board: applyMove(s.board, group),
      history: [...s.history, s.board],
      selection: [],
      moves: s.moves + 1,
    }),
  );
}

/*
 * `exactOptionalPropertyTypes` não deixa atribuir `undefined` a uma propriedade
 * opcional, e espalhar `rejection: undefined` seria isso. Retiram-se as chaves.
 */

function omitRejection(s: GameState & { rejection?: TapRejection }): GameState {
  const { rejection: _ignored, ...rest } = s;
  return rest;
}

/** Um joker escolhido só vale para a seleção em curso. */
function semJoker(s: GameState): GameState {
  const { jokerAs: _ignored, ...rest } = s;
  return rest;
}

/** Guarda o valor escolhido, ou tira a chave quando não há joker na seleção. */
function omitJoker(s: GameState, valor: JokerValue | undefined): GameState {
  return valor === undefined ? semJoker(s) : { ...s, jokerAs: valor };
}
