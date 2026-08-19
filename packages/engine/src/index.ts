/**
 * `@sete/engine` — motor puro do jogo "Sete".
 *
 * Determinístico, imutável e sem conhecimento de modo (spec §1.1). Toda a
 * aleatoriedade entra por uma seed explícita; `Math.random()` está proibido
 * neste pacote e a regra de lint fá-lo cumprir.
 *
 * Superfície pública (spec §10):
 *   Fase 1  types, board, groups (validade), moves     ← implementado
 *   Fase 2  groups (enumeração)                       ← implementado
 *   Fase 3  solver
 *   Fase 4  rng, generator, level
 *   Fase 5  metrics
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
