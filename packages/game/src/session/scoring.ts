/**
 * Pontuação.
 *
 * Três princípios, todos vindos do plano §6.3:
 *
 * 1. **Grupos grandes valem proporcionalmente mais.** Se um grupo de 5 valesse
 *    o mesmo que dois pares, o jogador limparia só pares — e a carga de
 *    reconhecimento, que *é* o desafio, desaparecia.
 * 2. **O combo multiplica, não soma.** Somar torna o encadeamento irrelevante
 *    depois de duas ou três jogadas.
 * 3. **Nada disto está fixo no código.** Os números são de playtest, e mudam.
 */

export interface ScoringConfig {
  /** Pontos por peça eliminada. */
  readonly perPiece: number;
  /**
   * Expoente do tamanho do grupo. Acima de 1, um grupo de `n` vale mais do que
   * `n` peças soltas — é o que dá razão ao jogador para procurar formas grandes.
   */
  readonly sizeExponent: number;
  /** Quanto cada nível de combo acrescenta ao multiplicador. */
  readonly comboStep: number;
  /** Teto do multiplicador, para o encadeamento não descolar. */
  readonly comboCap: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  perPiece: 10,
  sizeExponent: 1.5,
  comboStep: 0.25,
  comboCap: 3,
};

/**
 * Multiplicador de um combo de `count` jogadas encadeadas.
 *
 * `count <= 1` não é combo e vale 1 — a primeira jogada de uma cadeia não pode
 * ser bonificada por um ritmo que ainda não existe.
 */
export function comboMultiplier(
  count: number,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  if (count <= 1) return 1;
  return Math.min(config.comboCap, 1 + (count - 1) * config.comboStep);
}

/** Pontos de uma jogada, já com o combo aplicado. Sempre inteiro. */
export function moveScore(
  groupSize: number,
  comboCount: number,
  config: ScoringConfig = DEFAULT_SCORING,
): number {
  if (groupSize <= 0) return 0;

  const base = config.perPiece * Math.pow(groupSize, config.sizeExponent);
  return Math.round(base * comboMultiplier(comboCount, config));
}
