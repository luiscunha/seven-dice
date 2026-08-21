/**
 * `@dicetoseven/game` — UI web (DOM + transições CSS, spec §1.4) e camada de sessão.
 *
 * Tudo o que a engine deliberadamente não sabe vive aqui: modo, relógio,
 * pontuação, combos, undo, progressão (spec §1.1, §4.3).
 *
 * A camada de sessão não lê o relógio do sistema nem toca no DOM. O tempo entra
 * por parâmetro e o armazenamento por interface — é o que a torna testável como
 * função pura, e o que vai deixar a fase 9 trocar `localStorage` por
 * armazenamento nativo sem lhe mexer.
 */

export type {
  GameState,
  JokerValue,
  HintResult,
  HintSource,
  TapRejection,
} from "./session/GameSession";
export {
  JOKER_VALUES,
  clearSelection,
  hint,
  isFinished,
  restart,
  selectionHasJoker,
  selectionSum,
  startGame,
  remainingToTarget,
  selectionTotal,
  tap,
  undo,
} from "./session/GameSession";

export type { PuzzleConfig, PuzzleState, Seal } from "./session/PuzzleSession";
export {
  DEFAULT_PUZZLE_CONFIG,
  restartPuzzle,
  seal,
  startPuzzle,
  undoPuzzle,
  usePuzzleHint,
} from "./session/PuzzleSession";

export type {
  TimeAttackConfig,
  TimeAttackConfigs,
  TimeAttackState,
  TimeAttackTap,
} from "./session/TimeAttackSession";
export {
  DEFAULT_TIME_ATTACK,
  JokerInTimeAttackError,
  boardReward,
  isOver,
  nextBoard,
  remainingMs,
  startTimeAttack,
  tapTimeAttack,
} from "./session/TimeAttackSession";

export type { ComboConfig, ComboEvent, ComboState } from "./session/combos";
export {
  DEFAULT_COMBO_CONFIG,
  breakCombo,
  registerMove,
  startCombo,
} from "./session/combos";

export type { ScoringConfig } from "./session/scoring";
export { DEFAULT_SCORING, comboMultiplier, moveScore } from "./session/scoring";

export type { LevelProgress, Profile, ProfileStorage } from "./session/progress";
export {
  PROFILE_KEY,
  PROFILE_VERSION,
  countCompleted,
  emptyProfile,
  load,
  markJokerTutorialSeen,
  recordLevel,
  recordTimeAttack,
  save,
} from "./session/progress";

export type { ContaDoJoker } from "./session/tutorial";
export {
  NIVEIS_COM_ANDAIME,
  NIVEL_TUTORIAL_JOKER,
  contaDoJoker,
  mostraSomaDasFaces,
} from "./session/tutorial";
