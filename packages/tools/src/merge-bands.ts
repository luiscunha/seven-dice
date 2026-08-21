/**
 * Substitui bandas inteiras dentro de um level pack já curado.
 *
 * Existe porque reconstruir o pack todo quando só mudaram os parâmetros de uma
 * banda desperdiça tempo **e muda ids que não tinham razão para mudar**: a
 * geração é determinística por seed, portanto as bandas intactas produziriam
 * exatamente os mesmos níveis. Trocar só o que mudou preserva o progresso de
 * quem já jogou as outras.
 *
 *   tsx packages/tools/src/merge-bands.ts <pack.json> <banda.json> [mais.json]
 *
 * Cada ficheiro de banda substitui **todos** os níveis dessa banda no pack, e a
 * ordem das bandas segue `BANDS`, que é a progressão desenhada.
 */

import { readFile, writeFile } from "node:fs/promises";

import type { Level } from "@septet/engine";

import { BANDS } from "./bands";

const log = (msg: string): void => {
  process.stdout.write(`${msg}\n`);
};

async function main(argv: readonly string[]): Promise<number> {
  const [destino, ...substitutos] = argv;

  if (destino === undefined || substitutos.length === 0) {
    log("uso: merge-bands <pack.json> <banda.json> [mais.json ...]");
    return 1;
  }

  const pack = JSON.parse(await readFile(destino, "utf8")) as Level[];
  const porBanda = new Map<string, Level[]>();

  for (const nivel of pack) {
    const id = nivel.band ?? "sem-banda";
    porBanda.set(id, [...(porBanda.get(id) ?? []), nivel]);
  }

  for (const ficheiro of substitutos) {
    const niveis = JSON.parse(await readFile(ficheiro, "utf8")) as Level[];
    const bandas = new Set(niveis.map((n) => n.band ?? "sem-banda"));

    if (bandas.size !== 1) {
      log(`${ficheiro}: esperava uma banda só, encontrei ${bandas.size}`);
      return 1;
    }

    const id = [...bandas][0] as string;
    const antes = porBanda.get(id)?.length ?? 0;
    porBanda.set(id, niveis);

    log(`${id.padEnd(11)} ${String(antes).padStart(3)} → ${niveis.length}`);
  }

  const ordenado = BANDS.flatMap((b) => porBanda.get(b.id) ?? []);
  const orfaos = [...porBanda.entries()]
    .filter(([id]) => !BANDS.some((b) => b.id === id))
    .flatMap(([, n]) => n);

  const saida = [...ordenado, ...orfaos];
  await writeFile(destino, `${JSON.stringify(saida, null, 1)}\n`, "utf8");

  log("");
  log(`${saida.length} níveis em ${destino}`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
