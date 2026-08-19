/**
 * `@sete/tools` — pipeline offline (spec §7.5) e renderer de consola (spec §10,
 * fase 6).
 *
 * É aqui que vive o paralelismo (`worker_threads`): a engine mantém-se
 * single-threaded e agnóstica (spec §7.2).
 *
 * Comandos previstos: `sete generate`, `sete measure`, `sete export`, `sete play`.
 */

export {};
