/**
 * Carregamento dos níveis.
 *
 * **O jogo em produção nunca gera nem mede nada** (spec §7.5). Lê JSON estático
 * produzido offline por `septet export`, e mais nada.
 *
 * Um ficheiro por banda, carregado a pedido: 240 níveis num só ficheiro
 * obrigariam a descarregar a campanha inteira para jogar o primeiro nível. O
 * índice traz só o que a lista precisa de mostrar.
 */

import type { Level } from "@septet/engine";

export interface NivelNoIndice {
  readonly id: string;
  readonly pieces: number;
  /** Decide o tutorial do joker e o andaime da soma, no arranque. */
  readonly joker?: boolean;
  /** Colunas do tabuleiro. Decide se cabe num telemóvel — ver `cabeNoEcra`. */
  readonly colunas?: number;
}

/**
 * Colunas que um telemóvel comporta.
 *
 * **É largura, e largura não se recupera com enchimento.** Medido num ecrã de
 * 360px, o mais estreito que vale a pena servir: sete colunas dão peças de 44px,
 * que é o piso de toque; oito dão 38px e onze dão 26px — mais estreito do que
 * uma tecla de teclado.
 *
 * Os níveis mais largos **continuam no pack** e continuam válidos; só não entram
 * na campanha. São 20 em 240, nenhum no Tutorial nem no Iniciado.
 */
export const LARGURA_MAXIMA = 7;

/**
 * Um nível sem largura conhecida entra.
 *
 * O campo é opcional porque um índice gerado antes desta regra não o traz, e a
 * escolha certa aí é deixar jogar em vez de esconder a campanha inteira.
 */
export const cabeNoEcra = (colunas: number | undefined): boolean =>
  colunas === undefined || colunas <= LARGURA_MAXIMA;

export interface BandaNoIndice {
  readonly id: string;
  readonly label: string;
  /** `"tempo"` fica de fora da campanha — é o corpus do outro modo. */
  readonly modo?: "tempo";
  readonly niveis: readonly NivelNoIndice[];
}

const base = (caminho: string): string =>
  new URL(`levels/${caminho}`, document.baseURI).href;

const cache = new Map<string, readonly Level[]>();

export async function carregarIndice(): Promise<readonly BandaNoIndice[]> {
  const r = await fetch(base("index.json"));
  if (!r.ok) throw new Error(`não consegui ler o índice (${String(r.status)})`);
  return (await r.json()) as BandaNoIndice[];
}

export async function carregarBanda(id: string): Promise<readonly Level[]> {
  const guardada = cache.get(id);
  if (guardada !== undefined) return guardada;

  const r = await fetch(base(`${id}.json`));
  if (!r.ok) {
    throw new Error(`não consegui ler a banda ${id} (${String(r.status)})`);
  }

  const niveis = (await r.json()) as Level[];
  cache.set(id, niveis);
  return niveis;
}
