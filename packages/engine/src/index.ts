/**
 * `@sete/engine` — motor puro do jogo "Sete".
 *
 * Determinístico, imutável e sem conhecimento de modo (spec §1.1). Toda a
 * aleatoriedade entra por uma seed explícita; `Math.random()` está proibido
 * neste pacote e a regra de lint fá-lo cumprir.
 *
 * Superfície pública prevista (spec §10):
 *   Fase 1  types, board, moves
 *   Fase 2  groups
 *   Fase 3  solver
 *   Fase 4  rng, generator, level
 *   Fase 5  metrics
 */

export {};
