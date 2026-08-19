/**
 * As 14 formas de somar 7 com parcelas de 1 a 6 (plano §2.3).
 *
 * É a tabela de que o gerador escolhe ao construir níveis, e é a proporção entre
 * as suas entradas que controla a dificuldade percetiva. A ordem é fixa: os
 * pesos de `compositionWeights` são posicionais.
 */

import type { Cell } from "./types";

export type Composition = readonly Cell[];

export const COMPOSITIONS: readonly Composition[] = [
  // 2 peças
  [1, 6],
  [2, 5],
  [3, 4],
  // 3 peças
  [1, 1, 5],
  [1, 2, 4],
  [1, 3, 3],
  [2, 2, 3],
  // 4 peças
  [1, 1, 1, 4],
  [1, 1, 2, 3],
  [1, 2, 2, 2],
  // 5 peças
  [1, 1, 1, 1, 3],
  [1, 1, 1, 2, 2],
  // 6 peças
  [1, 1, 1, 1, 1, 2],
  // 7 peças
  [1, 1, 1, 1, 1, 1, 1],
];

/** Peso uniforme: o ponto de partida antes de haver métricas que o corrijam. */
export const UNIFORM_WEIGHTS: readonly number[] = COMPOSITIONS.map(() => 1);
