/**
 * Implementação de referência por força bruta.
 *
 * Serve dois propósitos:
 *
 * 1. Dá grupos válidos aos testes de propriedade da fase 1, sem depender da
 *    enumeração que só chega na fase 2.
 * 2. Será o **oráculo** contra o qual a enumeração por célula mínima (spec §3.2)
 *    se prova completa e sem duplicados.
 *
 * Repare-se no que este oráculo prova e no que não prova: reutiliza
 * `isValidGroup`, portanto testa a *completude da enumeração*, não a *definição
 * de validade*. A validade é verificada diretamente pelos testes de exemplo.
 */

import type { Board, Group, Packed } from "../../src/types";
import { packed } from "../../src/types";
import { isValidGroup } from "../../src/groups";

/** Limite de segurança: a enumeração é 2^n. */
const MAX_CELULAS = 20;

/** Todas as células, em ordem crescente de coordenada empacotada. */
export function allCells(b: Board): Packed[] {
  const out: Packed[] = [];
  for (let c = 0; c < b.length; c++) {
    const col = b[c];
    if (col === undefined) continue;
    for (let r = 0; r < col.length; r++) out.push(packed(c, r));
  }
  return out;
}

/**
 * Todos os grupos válidos, obtidos testando **todos os subconjuntos**.
 * Exponencial — só para tabuleiros pequenos.
 */
export function referenceGroups(b: Board): Group[] {
  const cells = allCells(b);

  if (cells.length > MAX_CELULAS) {
    throw new Error(
      `referenceGroups: ${cells.length} células excede o limite de ${MAX_CELULAS} (a enumeração é 2^n)`,
    );
  }

  const out: Group[] = [];
  const total = 1 << cells.length;

  for (let mask = 1; mask < total; mask++) {
    const g: Packed[] = [];
    // `cells` está ordenado e `i` cresce, portanto `g` sai canónico.
    for (let i = 0; i < cells.length; i++) {
      if ((mask & (1 << i)) !== 0) g.push(cells[i] as Packed);
    }
    if (isValidGroup(b, g)) out.push(g);
  }

  return out;
}
