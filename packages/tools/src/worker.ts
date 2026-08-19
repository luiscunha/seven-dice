/**
 * Worker de avaliação. Recebe uma fatia de seeds, devolve as avaliações.
 *
 * O paralelismo vive aqui e não na engine (spec §7.2). Como cada seed é
 * independente e cada playout tem seed derivada do seu índice, o resultado não
 * depende de como as seeds foram distribuídas nem da ordem por que os workers
 * responderam.
 */

import { parentPort, workerData } from "node:worker_threads";

import type { BandSpec } from "./bands";
import type { Avaliacao } from "./candidate";
import { avaliar } from "./candidate";

export interface TarefaWorker {
  readonly seeds: readonly number[];
  readonly band: BandSpec;
  readonly runs: number;
}

const tarefa = workerData as TarefaWorker;

const resultado: Avaliacao[] = tarefa.seeds.map((seed) =>
  avaliar(seed, tarefa.band, tarefa.runs),
);

parentPort?.postMessage(resultado);
