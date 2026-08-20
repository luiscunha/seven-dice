/**
 * Combos e cascatas.
 *
 * A spec §4.3 é explícita: **uma cascata não elimina automaticamente.** Se
 * novos grupos se formarem depois de uma jogada, ficam disponíveis, mas só
 * desaparecem se o jogador os escolher — eliminar sozinho seguiria um caminho
 * que ele não escolheu e podia levar o tabuleiro a um estado bloqueado,
 * destruindo a garantia de terminabilidade.
 *
 * Logo "combo" não é uma propriedade do tabuleiro: é uma propriedade do
 * *ritmo do jogador*, e mede-se pelo intervalo entre jogadas. Por isso vive aqui
 * e não na engine.
 *
 * O relógio entra por parâmetro. Nunca `Date.now()`.
 */

export interface ComboConfig {
  /**
   * Intervalo máximo entre duas jogadas para a segunda continuar o combo.
   *
   * A afinar em playtest — fica em configuração, nunca fixo no código.
   */
  readonly windowMs: number;
  /** A partir de quantas peças um grupo conta como grande (plano §6.3). */
  readonly bigGroupSize: number;
}

export const DEFAULT_COMBO_CONFIG: ComboConfig = {
  windowMs: 2500,
  bigGroupSize: 5,
};

export interface ComboState {
  /** Jogadas encadeadas dentro da janela. 0 antes da primeira jogada. */
  readonly count: number;
  /** Maior `count` atingido na sessão. */
  readonly best: number;
  readonly lastMoveAt: number | undefined;
}

export const startCombo = (): ComboState => ({
  count: 0,
  best: 0,
  lastMoveAt: undefined,
});

export interface ComboEvent {
  readonly state: ComboState;
  /** O combo continuou, em vez de recomeçar. */
  readonly chained: boolean;
  /** O grupo desta jogada era grande. */
  readonly big: boolean;
}

/**
 * Regista uma jogada.
 *
 * `at` é o instante em milissegundos, vindo do relógio injetado. A primeira
 * jogada nunca encadeia — não há intervalo por medir.
 */
export function registerMove(
  combo: ComboState,
  groupSize: number,
  at: number,
  config: ComboConfig = DEFAULT_COMBO_CONFIG,
): ComboEvent {
  const chained =
    combo.lastMoveAt !== undefined && at - combo.lastMoveAt <= config.windowMs;

  const count = chained ? combo.count + 1 : 1;

  return {
    state: {
      count,
      best: Math.max(combo.best, count),
      lastMoveAt: at,
    },
    chained,
    big: groupSize >= config.bigGroupSize,
  };
}

/**
 * Quebra o combo sem registar jogada — para undo, reinício e mudança de nível.
 *
 * Desfazer não pode manter o encadeamento: seria pontuar um ritmo que não
 * aconteceu.
 */
export const breakCombo = (combo: ComboState): ComboState => ({
  ...combo,
  count: 0,
  lastMoveAt: undefined,
});
