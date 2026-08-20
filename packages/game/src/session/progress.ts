/**
 * Persistência local do perfil.
 *
 * O armazenamento entra por interface, não por `localStorage` direto. São três
 * razões, e nenhuma é purismo: os testes correm sem DOM, o Capacitor da fase 9
 * vai querer armazenamento nativo, e um perfil corrompido não pode rebentar com
 * o arranque do jogo.
 *
 * O formato é versionado desde o primeiro dia. Um perfil gravado hoje vai ser
 * lido por uma versão futura do jogo, e a alternativa a versionar é adivinhar.
 */

import type { Seal } from "./PuzzleSession";

export const PROFILE_VERSION = 1;

export interface LevelProgress {
  readonly seal: Seal;
  /** Melhor número de jogadas. Informativo — o mérito está no selo. */
  readonly bestMoves: number;
}

export interface Profile {
  readonly version: number;
  /** Por `Level.id`. */
  readonly levels: Readonly<Record<string, LevelProgress>>;
  /** Melhor pontuação do modo tempo. */
  readonly bestTimeAttackScore: number;
  /** Melhor número de tabuleiros limpos numa corrida. */
  readonly bestBoardsCleared: number;
}

export const emptyProfile = (): Profile => ({
  version: PROFILE_VERSION,
  levels: {},
  bestTimeAttackScore: 0,
  bestBoardsCleared: 0,
});

/** O mínimo que o jogo precisa. `localStorage` satisfá-lo tal como está. */
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROFILE_KEY = "septet.profile";

/** Ordem dos selos, do menos exigente para o mais. */
const SEAL_RANK: Readonly<Record<Seal, number>> = {
  completed: 1,
  clean: 2,
  perfect: 3,
};

/**
 * O selo nunca regride.
 *
 * Repetir um nível já resolvido é uma razão legítima para voltar atrás
 * (plano §6.2), e se uma tentativa pior apagasse o selo conquistado, ninguém
 * arriscaria repetir. O `bestMoves` segue a mesma regra.
 */
export function recordLevel(
  profile: Profile,
  levelId: string,
  seal: Seal,
  moves: number,
): Profile {
  const previous = profile.levels[levelId];

  const best: LevelProgress =
    previous === undefined
      ? { seal, bestMoves: moves }
      : {
          seal: SEAL_RANK[seal] > SEAL_RANK[previous.seal] ? seal : previous.seal,
          bestMoves: Math.min(previous.bestMoves, moves),
        };

  return { ...profile, levels: { ...profile.levels, [levelId]: best } };
}

export const recordTimeAttack = (
  profile: Profile,
  score: number,
  boardsCleared: number,
): Profile => ({
  ...profile,
  bestTimeAttackScore: Math.max(profile.bestTimeAttackScore, score),
  bestBoardsCleared: Math.max(profile.bestBoardsCleared, boardsCleared),
});

export const save = (storage: ProfileStorage, profile: Profile): void => {
  storage.setItem(PROFILE_KEY, JSON.stringify(profile));
};

/**
 * Lê o perfil, e **nunca falha**.
 *
 * JSON inválido, versão desconhecida, campos em falta ou de outro tipo — tudo
 * dá perfil vazio. Perder progresso é mau; não abrir o jogo é pior, e um perfil
 * é exatamente o género de coisa que chega corrompida do disco de um telefone.
 */
export function load(storage: ProfileStorage): Profile {
  const raw = storage.getItem(PROFILE_KEY);
  if (raw === null) return emptyProfile();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyProfile();
  }

  if (typeof parsed !== "object" || parsed === null) return emptyProfile();

  const p = parsed as Partial<Profile>;
  if (p.version !== PROFILE_VERSION) return emptyProfile();

  return {
    version: PROFILE_VERSION,
    levels: sanitizeLevels(p.levels),
    bestTimeAttackScore: finiteOrZero(p.bestTimeAttackScore),
    bestBoardsCleared: finiteOrZero(p.bestBoardsCleared),
  };
}

function sanitizeLevels(value: unknown): Record<string, LevelProgress> {
  if (typeof value !== "object" || value === null) return {};

  const out: Record<string, LevelProgress> = {};

  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) continue;

    const e = entry as Partial<LevelProgress>;
    if (e.seal === undefined || SEAL_RANK[e.seal] === undefined) continue;

    out[id] = { seal: e.seal, bestMoves: finiteOrZero(e.bestMoves) };
  }

  return out;
}

const finiteOrZero = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;
