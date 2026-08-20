/**
 * Avaliação de um candidato: gerar, verificar, medir, decidir.
 *
 * Corre em qualquer contexto — no processo principal ou num worker — porque só
 * usa a engine, que é pura. É esta função que o pool paraleliza (spec §7.2).
 */

import type { Level } from "@septet/engine";
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
} from "@septet/engine";

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

/**
 * Margem com que **cada extremo** da banda é alargado no pré-filtro: três erros
 * padrão da proporção, calculados no próprio extremo.
 *
 * A margem tem de acompanhar o erro de amostragem, e o erro de uma proporção
 * colapsa perto de 0 e de 1. Uma margem fixa é generosa de mais exatamente onde
 * as bandas são estreitas: com 0,15, a `meio-joker` — que aceita [0,02, 0,15] —
 * ficava a cortar acima de 0,30, não cortava quase nada, e ainda pagava os
 * playouts do pré-filtro. Medido em 64 candidatos por banda:
 *
 * | Margem | meio-joker | denso | total de playouts |
 * |---|---|---|---|
 * | fixa 0,15 | **−7%** | **−2%** | −31% |
 * | 3σ no extremo | −1% | +4% | **−37%** |
 *
 * Em ambas as variantes, **0 descartes falsos em 512 candidatos**.
 */
export const margemPre = (p: number, runs: number): number =>
  3 * Math.sqrt((p * (1 - p)) / runs);

export function avaliar(
  seed: number,
  band: BandSpec,
  runs: number,
  /** Playouts do pré-filtro. `0` desliga-o. */
  preRuns = 0,
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

  const [min, max] = band.accept.survival;

  /*
   * Pré-filtro: uma medição curta antes da longa.
   *
   * Na `perito`, 44 de 64 candidatos morrem no teste de sobrevivência **depois**
   * de terem pago a medição inteira — medido. Cortá-los com um décimo dos
   * playouts dá o mesmo veredicto por um décimo do custo.
   *
   * Não toca na garantia central. A resolubilidade vem da ida-e-volta, que já
   * correu acima, e do piso de justiça, que corre abaixo; a sobrevivência é
   * dificuldade. O pior que este atalho pode fazer é descartar um candidato bom,
   * e isso só custa procurar mais uma seed — o pipeline avalia até a banda
   * encher.
   *
   * A medição final é uma chamada independente, com os `runs` pedidos. Os níveis
   * aceites e as métricas guardadas são idênticos aos de sempre.
   *
   * Ressalva: a `survivalRate` devolvida numa rejeição do pré-filtro é a
   * estimativa curta, mais ruidosa. Como essas taxas alimentam os percentis que
   * calibram as bandas, a distribuição observada fica com caudas um pouco mais
   * largas do que ficaria só com medições longas.
   */
  if (preRuns > 0 && preRuns < runs) {
    const pre = measureSurvival(gerado.board, preRuns, seed);

    if (
      pre.survivalRate < min - margemPre(min, preRuns) ||
      pre.survivalRate > max + margemPre(max, preRuns)
    ) {
      return { seed, rejeicao: "sobrevivencia", survivalRate: pre.survivalRate };
    }
  }

  const m = measureSurvival(gerado.board, runs, seed);

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
