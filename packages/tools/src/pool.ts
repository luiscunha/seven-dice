/**
 * Pool de workers para a medição (spec §7.2).
 *
 * O trabalho é CPU-bound e perfeitamente paralelo: cada seed é um candidato
 * independente. A única regra que importa é que **o resultado não pode depender
 * do escalonamento** — por isso as avaliações são reordenadas por seed antes de
 * sair daqui, e cada playout já traz a sua seed derivada de dentro da engine.
 */

import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

import type { BandSpec } from "./bands";
import type { Avaliacao } from "./candidate";
import { avaliar } from "./candidate";
import type { TarefaWorker } from "./worker";

const URL_WORKER = new URL("./worker.ts", import.meta.url);

function correrFatia(tarefa: TarefaWorker): Promise<Avaliacao[]> {
  return new Promise((resolve, reject) => {
    /*
     * `--import tsx` no worker, e não só no processo principal.
     *
     * O worker é TypeScript e um `Worker` do Node arranca sem herdar o loader
     * de quem o criou. Sob `pnpm sete` o tsx do processo principal chegaria por
     * acaso; sob o Vitest não chega, porque aí quem transforma o TypeScript é o
     * Vite e o worker corre em Node puro. Pedir o loader explicitamente faz os
     * dois caminhos funcionarem — e é o que permite que este código seja
     * testado em vez de só executado à mão.
     */
    const worker = new Worker(URL_WORKER, {
      workerData: tarefa,
      execArgv: ["--import", "tsx"],
    });

    worker.once("message", (m: Avaliacao[]) => {
      void worker.terminate();
      resolve(m);
    });

    worker.once("error", reject);

    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`worker terminou com código ${code}`));
    });
  });
}

export interface OpcoesPool {
  readonly seeds: readonly number[];
  readonly band: BandSpec;
  readonly runs: number;
  /** 1 força execução no processo principal — útil para depurar. */
  readonly workers?: number;
  readonly onProgresso?: (feitos: number, total: number) => void;
}

export async function avaliarEmParalelo(
  opcoes: OpcoesPool,
): Promise<Avaliacao[]> {
  const { seeds, band, runs } = opcoes;
  const n = Math.max(1, opcoes.workers ?? availableParallelism());

  if (n === 1 || seeds.length < 8) {
    const out: Avaliacao[] = [];
    for (const seed of seeds) {
      out.push(avaliar(seed, band, runs));
      opcoes.onProgresso?.(out.length, seeds.length);
    }
    return out;
  }

  // Fatias intercaladas em vez de blocos contíguos: seeds vizinhas produzem
  // tabuleiros de tamanhos parecidos, e blocos contíguos deixariam um worker com
  // todos os grandes.
  const fatias: number[][] = Array.from({ length: n }, () => []);
  seeds.forEach((seed, i) => (fatias[i % n] as number[]).push(seed));

  let feitos = 0;
  const resultados = await Promise.all(
    fatias
      .filter((f) => f.length > 0)
      .map((f) =>
        correrFatia({ seeds: f, band, runs }).then((r) => {
          feitos += r.length;
          opcoes.onProgresso?.(feitos, seeds.length);
          return r;
        }),
      ),
  );

  // A reordenação é o que torna a saída independente do escalonamento.
  return resultados.flat().sort((a, b) => a.seed - b.seed);
}
