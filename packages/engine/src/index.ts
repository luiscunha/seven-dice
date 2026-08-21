/**
 * `@dicetoseven/engine` — motor puro do jogo "DiceToSeven".
 *
 * Determinístico, imutável e sem conhecimento de modo (spec §1.1). Toda a
 * aleatoriedade entra por uma seed explícita; `Math.random()` está proibido
 * neste pacote e a regra de lint fá-lo cumprir.
 *
 * Superfície pública (spec §10):
 *   Fase 1  types, board, groups (validade), moves     ← implementado
 *   Fase 2  groups (enumeração)                       ← implementado
 *   Fase 3  solver                                   ← implementado
 *   Fase 4  rng, compositions, generator, level        ← implementado
 *   Fase 5  metrics                                  ← implementado
 */

export type { Board, Cell, Column, Group, Packed } from "./types";
export { JOKER, MAX_ROWS, TARGET, colOf, packed, rowOf, toGroup } from "./types";

export {
  boardKey,
  cellAt,
  checkInvariants,
  exists,
  height,
  isEmpty,
  jokerAt,
  jokerValue,
  neighbours,
  pieceCount,
  totalSum,
  width,
} from "./board";

export {
  findAllGroups,
  groupHasJoker,
  groupJokerValue,
  groupSum,
  hasAnyGroup,
  isConnected,
  isValidGroup,
} from "./groups";

export { InvalidMoveError, applyMove } from "./moves";

export type { Limits, Verdict } from "./solver";
export {
  DEFAULT_LIMITS,
  findSolution,
  isGreedySafe,
  isSolvable,
} from "./solver";

export type { Composition } from "./compositions";
export { COMPOSITIONS, UNIFORM_WEIGHTS } from "./compositions";

export type { Rng } from "./rng";
export {
  deriveSeed,
  mulberry32,
  pick,
  randInt,
  shuffled,
  weightedIndex,
} from "./rng";

export type {
  GeneratedLevel,
  GenerationStats,
  GeneratorParams,
} from "./generator";
export { generate, reachablePieceCounts } from "./generator";

export type { Level, LevelMetrics, LevelPack } from "./level";
export { toLevel } from "./level";

export type { OpcoesPiso, SurvivalResult } from "./metrics";
export {
  LIMITES_PISO,
  fairnessFloor,
  measureSurvival,
  runPlayout,
} from "./metrics";
