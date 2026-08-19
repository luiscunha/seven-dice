/**
 * Pipeline offline (spec §7.5): gerar N candidatos → medir todos → filtrar por
 * banda → exportar level pack.
 *
 * Corre uma vez, fora do jogo. **O jogo em produção nunca gera nem mede nada** —
 * carrega JSON estático.
 */

import type { Level } from "@sete/engine";

import type { BandSpec } from "./bands";
import type { Avaliacao, Rejeicao } from "./candidate";
import { avaliarEmParalelo } from "./pool";

export interface ResultadoBanda {
  readonly band: BandSpec;
  readonly levels: readonly Level[];
  readonly avaliados: number;
  readonly rejeicoes: Readonly<Record<Rejeicao, number>>;
  /** Taxas de sobrevivência observadas, ordenadas — para calibrar a banda. */
  readonly taxas: readonly number[];
}

const REJEICOES_VAZIAS: Record<Rejeicao, number> = {
  geracao: 0,
  "ida-e-volta": 0,
  sobrevivencia: 0,
  "greedy-safe": 0,
  "piso-de-justica": 0,
};

export interface OpcoesPipeline {
  readonly band: BandSpec;
  /** Quantos níveis aceites se quer. */
  readonly alvo: number;
  /** Candidatos a avaliar por ronda antes de verificar se já chegam. */
  readonly loteInicial?: number;
  readonly runs?: number;
  readonly workers?: number;
  readonly maxCandidatos?: number;
  readonly onProgresso?: (msg: string) => void;
}

export async function construirBanda(
  opcoes: OpcoesPipeline,
): Promise<ResultadoBanda> {
  const runs = opcoes.runs ?? 2000;
  const maxCandidatos = opcoes.maxCandidatos ?? opcoes.alvo * 200;

  const aceites: Level[] = [];
  const rejeicoes = { ...REJEICOES_VAZIAS };
  const taxas: number[] = [];

  let seed = 0;
  let avaliados = 0;

  // O lote cresce quando a taxa de aceitação é baixa, para não fazer dezenas de
  // rondas curtas numa banda estreita.
  let lote = opcoes.loteInicial ?? Math.max(64, opcoes.alvo * 2);

  while (aceites.length < opcoes.alvo && avaliados < maxCandidatos) {
    const seeds = Array.from({ length: lote }, (_, i) => seed + i);
    seed += lote;

    const avaliacoes: Avaliacao[] = await avaliarEmParalelo({
      seeds,
      band: opcoes.band,
      runs,
      ...(opcoes.workers === undefined ? {} : { workers: opcoes.workers }),
    });

    avaliados += avaliacoes.length;

    for (const a of avaliacoes) {
      if (a.survivalRate !== undefined) taxas.push(a.survivalRate);
      if (a.rejeicao !== undefined) rejeicoes[a.rejeicao]++;
      else if (a.level !== undefined && aceites.length < opcoes.alvo) {
        aceites.push(a.level);
      }
    }

    opcoes.onProgresso?.(
      `${opcoes.band.id}: ${aceites.length}/${opcoes.alvo} aceites, ${avaliados} avaliados`,
    );

    const taxaAceitacao = aceites.length / avaliados;
    if (taxaAceitacao < 0.05) lote = Math.min(lote * 2, 4096);
  }

  taxas.sort((a, b) => a - b);

  return {
    band: opcoes.band,
    levels: aceites,
    avaliados,
    rejeicoes,
    taxas,
  };
}
