/**
 * Formato de nível (spec §8).
 *
 * `board` é literalmente o tipo `Board`, portanto o ficheiro não precisa de
 * serializador. `solution` usa coordenadas empacotadas.
 *
 * Guarda-se a `seed` **e** o tabuleiro explícito: a seed é identidade estável e
 * rastreio, o tabuleiro explícito protege contra alterações futuras no gerador
 * que mudariam o que a mesma seed produz.
 */

import type { Board, Group } from "./types";
import type { GeneratedLevel } from "./generator";

export interface LevelMetrics {
  readonly pieces: number;
  readonly survivalRate: number;
  readonly avgBranching: number;
  readonly firstFatalDepth: number;
  readonly solutionLength: number;
}

export interface Level {
  readonly id: string;
  readonly seed: number;
  readonly board: Board;

  /**
   * `at` é `[coluna, linha]`, com a linha contada **a partir da base**, como
   * todas as coordenadas do motor (spec §2.2).
   */
  readonly joker?: {
    readonly at: readonly [number, number];
    readonly trueValue: number;
  };

  readonly solution: readonly Group[];

  /** Preenchidas pelo pipeline de medição (fase 5). */
  readonly metrics?: LevelMetrics;
  readonly band?: string;
}

/** Um level pack é um array destes objetos, servido como ficheiro estático. */
export type LevelPack = readonly Level[];

/** Junta identidade a um nível gerado. As métricas entram depois. */
export function toLevel(
  id: string,
  seed: number,
  gerado: GeneratedLevel,
): Level {
  const base = {
    id,
    seed,
    board: gerado.board,
    solution: gerado.solution,
  };

  return gerado.joker === undefined ? base : { ...base, joker: gerado.joker };
}
