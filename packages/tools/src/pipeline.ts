/**
 * Pipeline offline (spec §7.5): gerar N candidatos → medir todos → filtrar por
 * banda → exportar level pack.
 *
 * Corre uma vez, fora do jogo. **O jogo em produção nunca gera nem mede nada** —
 * carrega JSON estático.
 */

import type { Level } from "@dicetoseven/engine";

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
  forma: 0,
  "piso-de-justica": 0,
};

export interface OpcoesPipeline {
  readonly band: BandSpec;
  /** Quantos níveis aceites se quer. */
  readonly alvo: number;
  /** Candidatos a avaliar por ronda antes de verificar se já chegam. */
  readonly loteInicial?: number;
  readonly runs?: number;
  /**
   * Playouts do pré-filtro, antes da medição completa. `0` desliga-o.
   *
   * Ver a nota em `avaliar`: corta cedo os candidatos que estão fora da banda
   * com folga, sem tocar na garantia de resolubilidade.
   */
  readonly preRuns?: number;
  readonly workers?: number;
  readonly maxCandidatos?: number;
  readonly onProgresso?: (msg: string) => void;

  /**
   * Primeira seed a experimentar.
   *
   * Existe porque uma banda passou a construir-se em várias passagens — forma
   * livre e uma por cada forma cheia — e a seed é a identidade do nível. Duas
   * passagens a começar em zero dariam ids repetidos.
   */
  readonly seedInicial?: number;
}

export interface Passagem {
  readonly rotulo: string;
  readonly band: BandSpec;
  readonly alvo: number;
  readonly seedInicial: number;
}

/**
 * As passagens que compõem uma banda: forma livre, e uma por cada forma cheia.
 *
 * **Metade dos níveis são retângulos cheios, e é uma quota e não uma esperança.**
 * A alternativa era misturar as seeds e deixar a proporção sair do acaso — mas as
 * taxas de aceitação são muito diferentes (um `denso` 3×4 custa 12 candidatos,
 * um `perito` 7×7 custa 150), e o resultado seria um pack dominado pelas formas
 * baratas, com as caras a faltar. É precisamente o 7×7 que se quer garantir.
 *
 * Cada passagem arranca numa faixa de seeds própria, porque a seed é a
 * identidade do nível.
 */
export function passagensDe(band: BandSpec, alvo: number): readonly Passagem[] {
  const formas = band.formas;

  if (formas === undefined || formas.length === 0) {
    return [{ rotulo: band.id, band, alvo, seedInicial: 0 }];
  }

  const cheios = Math.floor(alvo / 2);
  const livres = alvo - cheios;

  const { formas: _semFormas, ...semForma } = band;

  const passagens: Passagem[] = [
    { rotulo: `${band.id} livre`, band: semForma, alvo: livres, seedInicial: 0 },
  ];

  // A última forma leva o resto da divisão, para a soma fechar em `cheios`.
  const porForma = Math.floor(cheios / formas.length);

  formas.forEach((forma, i) => {
    const ultima = i === formas.length - 1;
    const quota = ultima ? cheios - porForma * (formas.length - 1) : porForma;
    if (quota <= 0) return;

    passagens.push({
      rotulo: `${band.id} ${String(forma[0])}x${String(forma[1])}`,
      band: { ...band, formas: [forma] },
      alvo: quota,
      seedInicial: (i + 1) * 1_000_000,
    });
  });

  return passagens;
}

export async function construirBanda(
  opcoes: OpcoesPipeline,
): Promise<ResultadoBanda> {
  const runs = opcoes.runs ?? 2000;
  const maxCandidatos = opcoes.maxCandidatos ?? opcoes.alvo * 200;

  const aceites: Level[] = [];
  const rejeicoes = { ...REJEICOES_VAZIAS };
  const taxas: number[] = [];

  let seed = opcoes.seedInicial ?? 0;
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
      preRuns: opcoes.preRuns ?? 0,
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
