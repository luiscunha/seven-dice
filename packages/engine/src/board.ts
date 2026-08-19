/**
 * Consultas sobre o tabuleiro: dimensões, adjacência, somas e invariantes
 * (spec §2.2, §2.4, §2.6).
 */

import type { Board, Cell, Packed } from "./types";
import { JOKER, MAX_ROWS, colOf, packed, rowOf } from "./types";

export const width = (b: Board): number => b.length;

/** Altura da coluna `c`. Zero se a coluna não existe — não é erro, é a silhueta. */
export const height = (b: Board, c: number): number => b[c]?.length ?? 0;

/** `undefined` quando a célula está fora da silhueta. */
export const cellAt = (b: Board, p: Packed): Cell | undefined =>
  b[colOf(p)]?.[rowOf(p)];

export const exists = (b: Board, p: Packed): boolean =>
  cellAt(b, p) !== undefined;

export const isEmpty = (b: Board): boolean => b.length === 0;

export function pieceCount(b: Board): number {
  let n = 0;
  for (const col of b) n += col.length;
  return n;
}

/**
 * Soma das faces. O joker vale 0 (spec §3.2) — o valor que ele *toma* dentro de
 * um grupo obtém-se com `groupJokerValue`.
 */
export function totalSum(b: Board): number {
  let s = 0;
  for (const col of b) for (const cell of col) s += cell;
  return s;
}

/**
 * Vizinhos ortogonais de `p`, em ordem crescente de coordenada empacotada
 * (spec §2.4).
 *
 * A **condição de altura na vizinhança lateral** é o que faz as silhuetas
 * funcionarem: uma célula no topo de uma coluna alta não tem vizinho à direita
 * se a coluna do lado for mais baixa. Sem ela, tudo passa em tabuleiros
 * retangulares e falha em pirâmides.
 */
export function neighbours(b: Board, p: Packed): Packed[] {
  const c = colOf(p);
  const r = rowOf(p);
  const out: Packed[] = [];

  if (c > 0 && r < height(b, c - 1)) out.push(packed(c - 1, r));
  if (r > 0) out.push(packed(c, r - 1));
  if (r + 1 < height(b, c)) out.push(packed(c, r + 1));
  if (c + 1 < width(b) && r < height(b, c + 1)) out.push(packed(c + 1, r));

  return out;
}

/** Posição do joker, se existir. No máximo um por tabuleiro (spec §2.2). */
export function jokerAt(b: Board): Packed | undefined {
  for (let c = 0; c < b.length; c++) {
    const col = b[c];
    if (col === undefined) continue;
    for (let r = 0; r < col.length; r++) {
      if (col[r] === JOKER) return packed(c, r);
    }
  }
  return undefined;
}

/**
 * Chave canónica para memoização (spec §2.6).
 *
 * O tabuleiro produzido pelo motor está sempre em forma canónica, portanto serve
 * diretamente de chave sem normalização prévia. Como as células vão de 0 a 6,
 * cada uma ocupa exatamente um caractere.
 *
 * **Não aplicar redução por simetria:** um tabuleiro espelhado é um estado
 * distinto, e a redução falsearia a contagem de estados.
 */
export const boardKey = (b: Board): string =>
  b.map((col) => col.join("")).join("|");

/**
 * Verifica as invariantes de §2.2. Devolve a lista de violações — vazia se o
 * tabuleiro está bem formado.
 *
 * Função de teste e debug, fora do caminho quente. As invariantes 1 e 2 são
 * automáticas em qualquer tabuleiro produzido pelo motor; esta verificação
 * existe para apanhar literais escritos à mão e regressões no gerador.
 */
export function checkInvariants(b: Board): string[] {
  const problemas: string[] = [];
  let jokers = 0;

  for (let c = 0; c < b.length; c++) {
    const col = b[c];

    if (col === undefined) {
      problemas.push(`coluna ${c} em falta`);
      continue;
    }

    if (col.length === 0) {
      problemas.push(`invariante 1: coluna ${c} vazia`);
    }

    if (col.length > MAX_ROWS) {
      problemas.push(
        `coluna ${c} tem ${col.length} células e excede o limite de ${MAX_ROWS} das coordenadas empacotadas`,
      );
    }

    for (let r = 0; r < col.length; r++) {
      const cell = col[r];

      if (cell === undefined) {
        problemas.push(`invariante 2: buraco em (${c}, ${r})`);
        continue;
      }

      if (!Number.isInteger(cell) || cell < 0 || cell > 6) {
        problemas.push(`célula (${c}, ${r}) fora de 0–6: ${String(cell)}`);
      }

      if (cell === JOKER) jokers++;
    }
  }

  if (jokers > 1) {
    problemas.push(`invariante 3: ${jokers} jokers no tabuleiro, no máximo um`);
  }

  return problemas;
}
