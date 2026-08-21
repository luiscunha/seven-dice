/**
 * `@septet/tools` — pipeline offline (spec §7.5) e renderer de consola (spec §10,
 * fase 6).
 *
 * É aqui que vive o paralelismo (`worker_threads`): a engine mantém-se
 * single-threaded e agnóstica (spec §7.2).
 *
 * Comandos previstos: `septet generate`, `septet measure`, `septet export`, `septet play`.
 */

export {};
