/**
 * Modo Tempo — time attack contínuo (plano §6.3).
 *
 * **Relógio único**, que corre sempre. Cada tabuleiro limpo *adiciona* tempo; a
 * corrida acaba quando o jogador deixa de acompanhar a exigência crescente. Não
 * há countdown por nível — cria momentos mortos e fim abrupto, e o plano
 * descarta-o explicitamente.
 *
 * Sem undo e sem joker, e nenhuma das duas coisas é arbitrária. Os níveis deste
 * modo são greedy-safe: **não há como bloquear**, portanto o undo não teria o
 * que corrigir. E o joker reduz precisamente a carga de reconhecimento que é o
 * desafio, além de exigir um tempo de reflexão que o relógio não dá.
 *
 * O tempo é guardado como **instante-limite**, não como saldo. Assim o relógio
 * anda sozinho e não é preciso ninguém decrementá-lo: o que resta é sempre
 * `deadline − agora`. Nenhuma função aqui lê o relógio do sistema — `now` entra
 * por parâmetro, que é o que torna isto testável (plano, fase 7).
 */

import type { Level, Packed } from "@sete/engine";
import { jokerAt } from "@sete/engine";

import type { ComboState } from "./combos";
import { DEFAULT_COMBO_CONFIG, breakCombo, registerMove, startCombo } from "./combos";
import type { ComboConfig } from "./combos";
import type { GameState } from "./GameSession";
import { isFinished, startGame, tap } from "./GameSession";
import type { ScoringConfig } from "./scoring";
import { DEFAULT_SCORING, moveScore } from "./scoring";

export interface TimeAttackConfig {
  /** Generoso, para o jogador entrar em flow antes da pressão (plano §6.3). */
  readonly initialMs: number;
  /** Tempo concedido pelo primeiro tabuleiro limpo. */
  readonly perBoardMs: number;
  /**
   * Quanto o prémio por tabuleiro encolhe a cada tabuleiro já limpo.
   *
   * É isto que faz a corrida acabar: sem decaimento, um jogador competente
   * jogaria para sempre. O plano pede que o prémio decresça, ou pelo menos que
   * cresça mais devagar do que a exigência.
   */
  readonly perBoardDecayMs: number;
  /** Piso do prémio por tabuleiro. */
  readonly minPerBoardMs: number;
  /** Tempo por cada nível de combo acima do primeiro. */
  readonly comboBonusMs: number;
  /** Tempo por peça acima do limiar, num grupo grande. */
  readonly bigGroupBonusMs: number;
}

/**
 * Valores de partida. **Os dois primeiros são os parâmetros que o plano manda
 * afinar em playtest**, e é por isso que vivem em configuração e não no código.
 */
export const DEFAULT_TIME_ATTACK: TimeAttackConfig = {
  initialMs: 90_000,
  perBoardMs: 30_000,
  perBoardDecayMs: 1_500,
  minPerBoardMs: 8_000,
  comboBonusMs: 750,
  bigGroupBonusMs: 400,
};

export interface TimeAttackState {
  readonly game: GameState;
  readonly combo: ComboState;
  readonly score: number;
  readonly boardsCleared: number;
  /** Instante em que a corrida acaba, se nada mais for ganho. */
  readonly deadlineAt: number;
  readonly startedAt: number;
}

export class JokerInTimeAttackError extends Error {
  constructor(levelId: string) {
    super(
      `o nível ${levelId} tem joker, e o modo tempo não o admite (plano §6.3)`,
    );
    this.name = "JokerInTimeAttackError";
  }
}

export function startTimeAttack(
  level: Level,
  now: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK,
): TimeAttackState {
  assertNoJoker(level);

  return {
    game: startGame(level),
    combo: startCombo(),
    score: 0,
    boardsCleared: 0,
    deadlineAt: now + config.initialMs,
    startedAt: now,
  };
}

export const remainingMs = (s: TimeAttackState, now: number): number =>
  Math.max(0, s.deadlineAt - now);

export const isOver = (s: TimeAttackState, now: number): boolean =>
  now >= s.deadlineAt;

/** Prémio do `n`-ésimo tabuleiro limpo, contando de 0. */
export function boardReward(
  cleared: number,
  config: TimeAttackConfig = DEFAULT_TIME_ATTACK,
): number {
  return Math.max(
    config.minPerBoardMs,
    config.perBoardMs - cleared * config.perBoardDecayMs,
  );
}

export interface TimeAttackConfigs {
  readonly time?: TimeAttackConfig;
  readonly combo?: ComboConfig;
  readonly scoring?: ScoringConfig;
}

export interface TimeAttackTap {
  readonly state: TimeAttackState;
  /** A jogada aconteceu, em vez de a peça só entrar na seleção. */
  readonly moved: boolean;
  readonly gainedScore: number;
  readonly gainedMs: number;
  /** O tabuleiro ficou limpo com esta jogada. */
  readonly cleared: boolean;
}

/**
 * Tocar numa peça, com relógio.
 *
 * Depois do fim do tempo nada mais conta — a corrida acabou, e aceitar jogadas
 * seria pontuar tempo que o jogador já não tinha.
 */
export function tapTimeAttack(
  s: TimeAttackState,
  p: Packed,
  now: number,
  configs: TimeAttackConfigs = {},
): TimeAttackTap {
  const time = configs.time ?? DEFAULT_TIME_ATTACK;

  if (isOver(s, now)) {
    return { state: s, moved: false, gainedScore: 0, gainedMs: 0, cleared: false };
  }

  const before = s.game;
  const groupSize = before.selection.length + 1;
  const game = tap(before, p);
  const moved = game.history.length > before.history.length;

  if (!moved) {
    return {
      state: { ...s, game },
      moved: false,
      gainedScore: 0,
      gainedMs: 0,
      cleared: false,
    };
  }

  const event = registerMove(s.combo, groupSize, now, configs.combo);
  const scoring = configs.scoring ?? DEFAULT_SCORING;
  const comboCfg = configs.combo ?? DEFAULT_COMBO_CONFIG;

  const gainedScore = moveScore(groupSize, event.state.count, scoring);

  /*
   * Combos devolvem tempo — é o loop de reforço que sustenta o modo: jogar bem
   * compra espaço para jogar mais. E os grupos grandes valem mais por peça
   * acima do limiar, para dar razão ao jogador para os procurar em vez de
   * limpar só os pares.
   */
  const comboMs = event.chained
    ? (event.state.count - 1) * time.comboBonusMs
    : 0;

  const bigMs = event.big
    ? (groupSize - comboCfg.bigGroupSize + 1) * time.bigGroupBonusMs
    : 0;

  const cleared = isFinished(game);
  const clearMs = cleared ? boardReward(s.boardsCleared, time) : 0;
  const gainedMs = comboMs + bigMs + clearMs;

  return {
    state: {
      ...s,
      game,
      combo: event.state,
      score: s.score + gainedScore,
      boardsCleared: s.boardsCleared + (cleared ? 1 : 0),
      deadlineAt: s.deadlineAt + gainedMs,
    },
    moved: true,
    gainedScore,
    gainedMs,
    cleared,
  };
}

/**
 * Encadeia o tabuleiro seguinte, mantendo relógio e pontuação.
 *
 * O combo **não** atravessa tabuleiros: o intervalo entre a última jogada de um
 * e a primeira do seguinte inclui a transição, que não é ritmo do jogador.
 */
export function nextBoard(
  s: TimeAttackState,
  level: Level,
): TimeAttackState {
  assertNoJoker(level);

  return {
    ...s,
    game: startGame(level),
    combo: breakCombo(s.combo),
  };
}

function assertNoJoker(level: Level): void {
  if (jokerAt(level.board) !== undefined) {
    throw new JokerInTimeAttackError(level.id);
  }
}
