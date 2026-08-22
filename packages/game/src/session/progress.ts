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

/**
 * 2 desde o tutorial do joker, que trouxe `sawJokerTutorial`.
 *
 * `load` devolve perfil vazio a qualquer versão que não conheça — portanto subir
 * este número apaga os perfis antigos. É deliberado enquanto o jogo não estiver
 * publicado: migrar formatos que nunca chegaram a ninguém é código que só serve
 * para envelhecer. A partir da fase 9 deixa de o ser.
 */
export const PROFILE_VERSION = 2;

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

  /** Melhor tempo a limpar o tabuleiro no Survival, em ms. `0` = ainda nenhum. */
  readonly bestSurvivalMs: number;
  /** Linhas aguentadas nessa corrida. */
  readonly bestSurvivalRows: number;

  /**
   * O tutorial do joker já correu uma vez.
   *
   * É uma bandeira própria e não «já completou algum nível com joker» porque as
   * duas divergem no caso que interessa: quem abre o primeiro nível com joker,
   * não o consegue, e volta no dia seguinte. Esse já viu o tutorial, e voltar a
   * impor-lho lê-se como o jogo não estar a prestar atenção.
   */
  readonly sawJokerTutorial: boolean;
}

export const emptyProfile = (): Profile => ({
  version: PROFILE_VERSION,
  levels: {},
  bestTimeAttackScore: 0,
  bestBoardsCleared: 0,
  bestSurvivalMs: 0,
  bestSurvivalRows: 0,
  sawJokerTutorial: false,
});

export const markJokerTutorialSeen = (profile: Profile): Profile =>
  profile.sawJokerTutorial ? profile : { ...profile, sawJokerTutorial: true };

/**
 * Quantos dos níveis dados já foram completados.
 *
 * Serve o andaime da soma das faces (`tutorial.ts`), que conta **níveis
 * distintos** e não sessões: repetir o mesmo nível com joker três vezes não
 * ensina a regra três vezes.
 */
export const countCompleted = (
  profile: Profile,
  ids: readonly string[],
): number => ids.filter((id) => profile.levels[id] !== undefined).length;

/** O mínimo que o jogo precisa. `localStorage` satisfá-lo tal como está. */
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROFILE_KEY = "dicetoseven.profile";

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

/**
 * Guarda o melhor do Survival.
 *
 * **Só conta a corrida que limpou o tabuleiro.** Transbordar não é uma marca, é
 * uma tentativa — e um recorde de «quanto tempo aguentei antes de perder» premeia
 * jogar devagar, que é o contrário do que o modo pede.
 *
 * Menor é melhor, portanto o zero significa «ainda nenhum» e não «instantâneo».
 */
export const recordSurvival = (
  profile: Profile,
  limpou: boolean,
  tempoMs: number,
  rows: number,
): Profile => {
  if (!limpou) return profile;
  if (profile.bestSurvivalMs !== 0 && tempoMs >= profile.bestSurvivalMs) {
    return profile;
  }
  return { ...profile, bestSurvivalMs: tempoMs, bestSurvivalRows: rows };
};

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
    bestSurvivalMs: finiteOrZero(p.bestSurvivalMs),
    bestSurvivalRows: finiteOrZero(p.bestSurvivalRows),
    sawJokerTutorial: p.sawJokerTutorial === true,
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
