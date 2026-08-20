/**
 * O que acontece a cada peça durante uma jogada.
 *
 * **O problema.** `Board` é uma lista de listas de números e **não tem
 * identidade de peça**. Depois de `applyMove`, olhando só para o resultado, não
 * há como saber que peça foi parar onde — e sem isso não há animação nenhuma, só
 * um tabuleiro a piscar de um estado para o outro.
 *
 * **Porque é derivável na mesma.** Pelas duas propriedades que a spec sublinha, e
 * que existem para tornar a construção reversa possível (spec §2.4):
 *
 * - A gravidade é `col.filter`, e `filter` **preserva a ordem relativa**: numa
 *   coluna afetada, a k-ésima célula sobrevivente a contar da base passa a
 *   ocupar a linha k.
 * - O colapso é a coluna vazia **não entrar**: a nova coluna de uma antiga é
 *   quantas colunas não-vazias existem à esquerda dela.
 *
 * A mesma escolha de representação que torna o gerador possível torna a animação
 * possível. Não é coincidência — é a ordem relativa preservada a pagar duas
 * vezes.
 *
 * **Onde isto vive.** Na camada de sessão e não na engine: a engine não sabe o
 * que é uma animação, e isto só existe por causa de uma. Mas também não pertence
 * ao DOM — é aritmética sobre o tabuleiro, e tem de ser testável como tal.
 */

import type { Board, Group, Packed } from "@septet/engine";
import { colOf, packed, rowOf } from "@septet/engine";

export interface PieceMove {
  readonly from: Packed;
  readonly to: Packed;
}

export interface Transition {
  /** Peças do grupo eliminado, na ordem canónica do grupo. */
  readonly removed: readonly Packed[];
  /** Só as peças que **mudam** de sítio. Quem fica onde estava não aparece. */
  readonly moved: readonly PieceMove[];
}

/**
 * A posição intermédia de uma peça: depois da gravidade, antes do colapso.
 *
 * É a coluna de onde veio com a linha para onde vai — porque a gravidade só
 * mexe em linhas dentro da coluna, e o colapso só remapeia índices de coluna.
 * É este estado que a animação em três tempos mostra, e que **não é
 * representável como `Board`**: teria colunas vazias no meio, que as invariantes
 * de §2.2 proíbem.
 */
export const midpointOf = (m: PieceMove): Packed =>
  packed(colOf(m.from), rowOf(m.to));

export function transition(board: Board, group: Group): Transition {
  const removedRows = new Map<number, Set<number>>();

  for (const p of group) {
    const c = colOf(p);
    let rows = removedRows.get(c);
    if (rows === undefined) {
      rows = new Set<number>();
      removedRows.set(c, rows);
    }
    rows.add(rowOf(p));
  }

  const moved: PieceMove[] = [];
  let newCol = 0;

  for (let c = 0; c < board.length; c++) {
    const column = board[c];
    if (column === undefined) continue;

    const removed = removedRows.get(c);

    if (removed === undefined) {
      // Coluna intacta: as linhas não mexem, mas a coluna pode deslizar.
      if (newCol !== c) {
        for (let r = 0; r < column.length; r++) {
          moved.push({ from: packed(c, r), to: packed(newCol, r) });
        }
      }
      newCol++;
      continue;
    }

    let newRow = 0;
    for (let r = 0; r < column.length; r++) {
      if (removed.has(r)) continue;

      const from = packed(c, r);
      const to = packed(newCol, newRow);
      if (from !== to) moved.push({ from, to });
      newRow++;
    }

    // `newRow === 0` significa coluna inteiramente eliminada: não entra, e as
    // que vêm a seguir tomam-lhe o índice.
    if (newRow > 0) newCol++;
  }

  return { removed: [...group], moved };
}
