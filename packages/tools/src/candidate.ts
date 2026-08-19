/**
 * Avaliação de um candidato: gerar, verificar, medir, decidir.
 *
 * Corre em qualquer contexto — no processo principal ou num worker — porque só
 * usa a engine, que é pura. É esta função que o pool paraleliza (spec §7.2).
 */

import type { Level } from "@sete/engine";
import {
  applyMove,
  fairnessFloor,
  generate,
  isGreedySafe,
  isValidGroup,
  measureSurvival,
  pieceCount,
  reachablePieceCounts,
  toLevel,
} from "@sete/engine";

import type { BandSpec } from "./bands";

export type Rejeicao =
  | "geracao"
  | "ida-e-volta"
  | "sobrevivencia"
  | "greedy-safe"
  | "piso-de-justica";

export interface Avaliacao {
  readonly seed: number;
  readonly level?: Level;
  readonly rejeicao?: Rejeicao;
  /** Guardada mesmo quando rejeitado: é o que permite calibrar as bandas. */
  readonly survivalRate?: number;
}

/**
 * O tamanho do tabuleiro varia dentro da banda, de forma determinística a partir
 * da seed — dois níveis seguidos não são do mesmo tamanho, e o pack não fica
 * monótono.
 *
 * O tamanho é ajustado para um que as composições da banda consigam mesmo somar.
 * Uma banda restrita a pares só atinge contagens pares, e sem este ajuste 40% dos
 * candidatos do tutorial morriam antes de sair da geração — medido.
 */
function tamanhoParaSeed(seed: number, band: BandSpec): number {
  const [min, max] = band.pieces;
  const atingivel = reachablePieceCounts(band.params.compositionWeights, max);

  const inicio = min + (Math.abs(Math.imul(seed, 0x9e3779b1)) % (max - min + 1));

  for (let n = inicio; n <= max; n++) if (atingivel[n] === true) return n;
  for (let n = inicio - 1; n >= min; n--) if (atingivel[n] === true) return n;

  return inicio;
}

export function avaliar(
  seed: number,
  band: BandSpec,
  runs: number,
): Avaliacao {
  const gerado = generate(seed, {
    ...band.params,
    targetPieceCount: tamanhoParaSeed(seed, band),
  });

  if (gerado === undefined) return { seed, rejeicao: "geracao" };

  /*
   * Ida-e-volta antes de qualquer medição (spec §9.3). É barato e é a garantia
   * central: se falhar aqui, o nível é impossível e nada do que se meça a seguir
   * interessa. O pipeline nunca publica nada que não tenha passado por aqui.
   */
  let b = gerado.board;
  for (const g of gerado.solution) {
    if (!isValidGroup(b, g)) return { seed, rejeicao: "ida-e-volta" };
    b = applyMove(b, g);
  }
  if (b.length !== 0) return { seed, rejeicao: "ida-e-volta" };

  const m = measureSurvival(gerado.board, runs, seed);
  const [min, max] = band.accept.survival;

  if (m.survivalRate < min || m.survivalRate > max) {
    return { seed, rejeicao: "sobrevivencia", survivalRate: m.survivalRate };
  }

  if (band.accept.requireGreedySafe === true) {
    // A taxa de 100% numa amostra não prova que não há becos; só a prova
    // exaustiva prova (plano §5.1).
    if (isGreedySafe(gerado.board) !== "yes") {
      return { seed, rejeicao: "greedy-safe", survivalRate: m.survivalRate };
    }
  }

  if (band.accept.fairnessDepth > 0) {
    const piso = fairnessFloor(gerado.board, band.accept.fairnessDepth, undefined, {
      skipJokerMoves: band.accept.fairnessSkipsJoker === true,
    });

    if (piso !== "yes") {
      return {
        seed,
        rejeicao: "piso-de-justica",
        survivalRate: m.survivalRate,
      };
    }
  }

  const base = toLevel(`${band.id}-${String(seed).padStart(6, "0")}`, seed, gerado);

  return {
    seed,
    survivalRate: m.survivalRate,
    level: {
      ...base,
      band: band.id,
      metrics: {
        pieces: pieceCount(gerado.board),
        survivalRate: m.survivalRate,
        avgBranching: m.avgBranching,
        firstFatalDepth: m.firstFatalDepth,
        avgMoveDensity: m.avgMoveDensity,
        avgGroupSize: m.avgGroupSize,
        solutionLength: gerado.solution.length,
      },
    },
  };
}
