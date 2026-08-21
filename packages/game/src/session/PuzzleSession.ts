/**
 * Modo Puzzle — a campanha (plano §6.2).
 *
 * Sem relógio. Undo ilimitado e grátis, reinício instantâneo, dicas escassas. O
 * avanço **nunca** é bloqueado: o que se mede é a qualidade da resolução, e o
 * selo é sempre reconquistável, que é o que torna repetir um nível uma razão
 * legítima para voltar atrás.
 */

import type { Level } from "@dicetoseven/engine";

import type { GameState, HintResult } from "./GameSession";
import { hint, isFinished, restart, startGame, undo } from "./GameSession";

/** Plano §6.2. A ordem é do mais exigente para o menos. */
export type Seal = "perfect" | "clean" | "completed";

export interface PuzzleState {
  readonly game: GameState;
  /** Dicas ainda disponíveis. `Infinity` com a compra única (plano §11). */
  readonly hintsLeft: number;
}

export interface PuzzleConfig {
  /** Dicas por nível. O recurso escasso é este, nunca o undo (plano §3.3). */
  readonly hintsPerLevel: number;
}

export const DEFAULT_PUZZLE_CONFIG: PuzzleConfig = { hintsPerLevel: 3 };

export const startPuzzle = (
  level: Level,
  config: PuzzleConfig = DEFAULT_PUZZLE_CONFIG,
): PuzzleState => ({
  game: startGame(level),
  hintsLeft: config.hintsPerLevel,
});

/**
 * O selo, ou `undefined` enquanto o tabuleiro não estiver limpo.
 *
 * `clean` é sem undo e sem reinício; `perfect` é isso e sem dicas. Repare-se que
 * o undo **conta** para o selo mas não é limitado: o jogador pode usá-lo à
 * vontade, e o que perde é o mérito, não a possibilidade.
 */
export function seal(s: PuzzleState): Seal | undefined {
  const g = s.game;
  if (!isFinished(g)) return undefined;

  if (g.undos > 0 || g.restarts > 0) return "completed";
  return g.hints > 0 ? "clean" : "perfect";
}

/** Pede uma dica, se ainda houver. Não gasta nada quando não há. */
export function usePuzzleHint(s: PuzzleState): {
  readonly state: PuzzleState;
  readonly result: HintResult | undefined;
} {
  if (s.hintsLeft <= 0) return { state: s, result: undefined };

  const result = hint(s.game);

  // Uma dica que não encontrou grupo nenhum não se cobra.
  if (result.source === "none") return { state: s, result };

  return {
    state: { game: result.state, hintsLeft: s.hintsLeft - 1 },
    result,
  };
}

export const undoPuzzle = (s: PuzzleState): PuzzleState => ({
  ...s,
  game: undo(s.game),
});

/** Reiniciar devolve as dicas: o nível recomeça inteiro, o custo também. */
export const restartPuzzle = (
  s: PuzzleState,
  config: PuzzleConfig = DEFAULT_PUZZLE_CONFIG,
): PuzzleState => ({
  game: restart(s.game),
  hintsLeft: config.hintsPerLevel,
});
