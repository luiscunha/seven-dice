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
}

export interface BandaNoIndice {
  readonly id: string;
  readonly label: string;
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
