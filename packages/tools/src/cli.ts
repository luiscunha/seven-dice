/**
 * CLI do pipeline offline.
 *
 *   septet build [--band <id>] [--count <n>] [--runs <n>] [--pre <n>] [--out <dir>]
 *   septet bands
 *   septet verify <ficheiro.json>
 *
 * Corre uma vez, fora do jogo (spec §7.5).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import type { Level } from "@septet/engine";
import { applyMove, isValidGroup, pieceCount, totalSum } from "@septet/engine";

import { BANDS, bandById } from "./bands";
import { comandoPlay } from "./play";
import { construirBanda } from "./pipeline";

const log = (msg: string): void => {
  process.stdout.write(`${msg}\n`);
};

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

function percentil(ordenados: readonly number[], p: number): number {
  if (ordenados.length === 0) return 0;
  const i = Math.min(
    ordenados.length - 1,
    Math.floor(p * (ordenados.length - 1)),
  );
  return ordenados[i] as number;
}

/* ─── build ────────────────────────────────────────────────────────────────── */

async function comandoBuild(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      band: { type: "string" },
      count: { type: "string", default: "40" },
      runs: { type: "string", default: "2000" },
      // Pré-filtro ligado por omissão: −37% de playouts, 0 descartes falsos em
      // 512 candidatos, e o pack sai idêntico. `--pre 0` desliga-o.
      pre: { type: "string", default: "100" },
      out: { type: "string", default: "packages/tools/out" },
      workers: { type: "string" },
    },
  });

  const alvo = Number(values.count);
  const runs = Number(values.runs);
  const preRuns = Number(values.pre);
  const bandas =
    values.band === undefined
      ? BANDS
      : [bandById(values.band)].filter((b) => b !== undefined);

  if (bandas.length === 0) {
    log(`Banda desconhecida: ${String(values.band)}`);
    return 1;
  }

  const pack: Level[] = [];
  const inicio = Date.now();

  for (const band of bandas) {
    const t0 = Date.now();

    const r = await construirBanda({
      band,
      alvo,
      runs,
      preRuns,
      ...(values.workers === undefined
        ? {}
        : { workers: Number(values.workers) }),
    });

    const segundos = ((Date.now() - t0) / 1000).toFixed(1);
    const rej = Object.entries(r.rejeicoes)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(" ");

    log(
      `${band.id.padEnd(10)} ${String(r.levels.length).padStart(4)}/${alvo} aceites  ` +
        `${String(r.avaliados).padStart(6)} avaliados  ` +
        `${pct(r.levels.length / Math.max(1, r.avaliados)).padStart(6)} aceitação  ` +
        `${segundos}s`,
    );
    log(`           rejeições: ${rej || "nenhuma"}`);
    log(
      `           sobrevivência observada: p10=${percentil(r.taxas, 0.1).toFixed(2)} ` +
        `mediana=${percentil(r.taxas, 0.5).toFixed(2)} p90=${percentil(r.taxas, 0.9).toFixed(2)}`,
    );

    pack.push(...r.levels);
  }

  const destino = resolve(values.out, "level-pack.json");
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, `${JSON.stringify(pack, null, 1)}\n`, "utf8");

  log("");
  log(
    `${pack.length} níveis em ${destino} (${((Date.now() - inicio) / 1000).toFixed(1)}s)`,
  );

  return pack.length === 0 ? 1 : 0;
}

/* ─── export ───────────────────────────────────────────────────────────────── */

/**
 * Parte o pack curado em um ficheiro por banda, para o jogo carregar a pedido.
 *
 * Duzentos e quarenta níveis num só ficheiro obrigariam a descarregar a campanha
 * inteira para jogar o primeiro nível. O índice traz só o que a lista de níveis
 * precisa de mostrar — id, peças, selo por conquistar — e o tabuleiro fica no
 * ficheiro da banda.
 *
 * **A solução vai no ficheiro da banda**, porque é dela que saem as dicas
 * (spec §4.3). Não é um segredo a proteger: quem quiser ler o JSON já podia
 * resolver o nível com um solver em cinco linhas.
 */
async function comandoExport(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      pack: { type: "string", default: "packages/tools/out/level-pack.json" },
      out: { type: "string", default: "packages/game/public/levels" },
    },
  });

  const pack = JSON.parse(await readFile(values.pack, "utf8")) as Level[];

  if (pack.length === 0) {
    log("o pack está vazio");
    return 1;
  }

  await mkdir(values.out, { recursive: true });

  const porBanda = new Map<string, Level[]>();
  for (const nivel of pack) {
    const banda = nivel.band ?? "sem-banda";
    const lista = porBanda.get(banda) ?? [];
    lista.push(nivel);
    porBanda.set(banda, lista);
  }

  // A ordem do índice é a ordem das bandas em `BANDS`, que é a progressão
  // desenhada — e não a ordem por que os níveis calharam no ficheiro.
  const indice = BANDS.filter((b) => porBanda.has(b.id)).map((b) => {
    const niveis = porBanda.get(b.id) ?? [];
    return {
      id: b.id,
      label: b.label,
      niveis: niveis.map((n) => ({
        id: n.id,
        pieces: n.metrics?.pieces ?? 0,
        // O jogo precisa disto no arranque, para saber quando abrir o tutorial
        // do joker e durante quantos níveis manter o andaime da soma. Sem estar
        // no índice, obrigava a carregar as bandas todas para o descobrir.
        joker: n.joker !== undefined,
      })),
    };
  });

  for (const [banda, niveis] of porBanda) {
    const destino = resolve(values.out, `${banda}.json`);
    await writeFile(destino, `${JSON.stringify(niveis)}\n`, "utf8");
  }

  await writeFile(
    resolve(values.out, "index.json"),
    `${JSON.stringify(indice, null, 1)}\n`,
    "utf8",
  );

  log(
    `${pack.length} níveis em ${porBanda.size} bandas → ${resolve(values.out)}`,
  );
  for (const b of indice) {
    log(`  ${b.id.padEnd(11)} ${String(b.niveis.length).padStart(3)} níveis`);
  }

  return 0;
}

/* ─── verify ───────────────────────────────────────────────────────────────── */

/**
 * Reverifica um pack já escrito, sem confiar em nada do que lá está.
 *
 * É a rede final: seja qual for o caminho que produziu o ficheiro, nenhum nível
 * sai daqui sem que a solução guardada o esvazie mesmo.
 */
async function comandoVerify(args: string[]): Promise<number> {
  const caminho = args[0];
  if (caminho === undefined) {
    log("uso: septet verify <ficheiro.json>");
    return 1;
  }

  const pack = JSON.parse(await readFile(caminho, "utf8")) as Level[];
  const falhas: string[] = [];

  for (const nivel of pack) {
    let b = nivel.board;
    let ok = true;

    for (const g of nivel.solution) {
      if (!isValidGroup(b, g)) {
        falhas.push(`${nivel.id}: jogada inválida`);
        ok = false;
        break;
      }
      b = applyMove(b, g);
    }

    if (ok && b.length !== 0) falhas.push(`${nivel.id}: não esvazia`);

    const soma = totalSum(nivel.board) + (nivel.joker?.trueValue ?? 0);
    if (soma % 7 !== 0) falhas.push(`${nivel.id}: soma não múltipla de 7`);

    if (nivel.metrics !== undefined) {
      if (nivel.metrics.pieces !== pieceCount(nivel.board)) {
        falhas.push(`${nivel.id}: contagem de peças não bate com o tabuleiro`);
      }
    }
  }

  log(`${pack.length} níveis verificados, ${falhas.length} falhas`);
  for (const f of falhas.slice(0, 20)) log(`  ${f}`);

  return falhas.length === 0 ? 0 : 1;
}

/* ─── bands ────────────────────────────────────────────────────────────────── */

function comandoBands(): number {
  for (const b of BANDS) {
    const [min, max] = b.accept.survival;
    log(
      `${b.id.padEnd(10)} peças ${String(b.pieces[0]).padStart(2)}–${b.pieces[1]}  ` +
        `sobrevivência ${min.toFixed(2)}–${max.toFixed(2)}  ` +
        `${b.accept.requireGreedySafe === true ? "greedy-safe  " : "             "}` +
        `piso=${b.accept.fairnessDepth}`,
    );
    log(`           ${b.label}`);
  }
  return 0;
}

/* ─── entrada ──────────────────────────────────────────────────────────────── */

const [comando, ...resto] = process.argv.slice(2);

const codigo = await (async (): Promise<number> => {
  switch (comando) {
    case "build":
      return comandoBuild(resto);
    case "verify":
      return comandoVerify(resto);
    case "bands":
      return comandoBands();
    case "play": {
      const { values } = parseArgs({
        args: resto,
        options: {
          pack: { type: "string" },
          band: { type: "string" },
          id: { type: "string" },
          seed: { type: "string" },
          log: { type: "string" },
          passos: { type: "boolean", default: false },
        },
      });
      return comandoPlay(values);
    }
    case "export":
      return comandoExport(resto);
    default:
      log("uso: septet <build|bands|play|verify|export>");
      log("");
      log("  build   [--band <id>] [--count <n>] [--runs <n>] [--out <dir>]");
      log("  bands   lista as bandas e os seus critérios");
      log("  play    [--band <id>] [--id <levelId>] [--seed <n>]");
      log("          [--pack <ficheiro>] [--log <ficheiro>] [--passos]");
      log("  verify  <ficheiro.json>  reverifica um level pack");
      log("  export  [--pack <ficheiro>] [--out <dir>]  parte o pack por banda");
      return comando === undefined ? 0 : 1;
  }
})();

process.exitCode = codigo;
