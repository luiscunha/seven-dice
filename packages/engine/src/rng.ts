/**
 * Aleatoriedade semeada (spec §7.1).
 *
 * O JavaScript não tem PRNG semeável nativo, e `Math.random()` está proibido na
 * engine — há uma regra de lint que o garante. Sem isto nada é reproduzível, e a
 * reprodutibilidade é o que sustenta as seeds determinísticas, o puzzle diário e
 * os leaderboards justos (plano §4.3, §6.4).
 */

/** Devolve um número em `[0, 1)`. */
export type Rng = () => number;

/**
 * mulberry32 — pequeno, rápido e com qualidade mais do que suficiente para
 * escolher composições e posições. Não é criptográfico, e não precisa de ser.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seed derivada, para dar a cada playout ou tentativa uma sequência própria
 * (spec §7.2).
 *
 * `seed + índice` seria suficiente para os workers, mas seeds consecutivas
 * produzem primeiros valores parecidos em geradores desta família. Uma mistura
 * barata evita correlação entre tarefas vizinhas sem custar reprodutibilidade.
 */
export const deriveSeed = (seed: number, index: number): number =>
  (Math.imul(seed ^ (index + 0x9e3779b9), 0x85ebca6b) ^ index) >>> 0;

/** Inteiro em `[0, n)`. */
export const randInt = (rng: Rng, n: number): number => Math.floor(rng() * n);

/** Elemento ao acaso, ou `undefined` se a lista estiver vazia. */
export const pick = <T>(rng: Rng, items: readonly T[]): T | undefined =>
  items.length === 0 ? undefined : items[randInt(rng, items.length)];

/**
 * Índice ao acaso, proporcional aos pesos. Pesos negativos contam como zero.
 * Devolve `-1` se todos forem zero — o chamador decide o que fazer.
 */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) return -1;

  let alvo = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] as number;
    if (w <= 0) continue;
    alvo -= w;
    if (alvo < 0) return i;
  }

  // Só alcançável por erro de arredondamento no último elemento.
  for (let i = weights.length - 1; i >= 0; i--) {
    if ((weights[i] as number) > 0) return i;
  }
  return -1;
}

/** Baralha uma cópia (Fisher–Yates). Não altera a entrada. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
