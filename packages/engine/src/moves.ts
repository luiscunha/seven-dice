/**
 * Aplicação de jogada (spec §4).
 *
 * O algoritmo inteiro cabe em quatro passos, e dois deles saem de graça da
 * representação por colunas: remover células de uma lista *é* a gravidade,
 * remover listas vazias *é* o colapso de colunas.
 */

import type { Board, Column, Group } from "./types";
import { colOf, rowOf } from "./types";
import { isValidGroup } from "./groups";

export class InvalidMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoveError";
  }
}

/**
 * Devolve um tabuleiro **novo** com o grupo eliminado, a gravidade aplicada e as
 * colunas vazias colapsadas.
 *
 * As colunas não afetadas são partilhadas por referência — são imutáveis, e uma
 * jogada toca em 1–4 colunas, portanto o custo é proporcional ao grupo e não ao
 * tabuleiro.
 *
 * **Cascatas não eliminam automaticamente** (spec §4.3). Se novos grupos se
 * formarem, ficam disponíveis, mas só desaparecem se o jogador os escolher: uma
 * eliminação automática seguiria um caminho que o jogador não escolheu e podia
 * levar o tabuleiro a um estado bloqueado, destruindo a garantia de
 * terminabilidade. "Cascata" e "combo" pertencem à `GameSession`.
 *
 * @throws {InvalidMoveError} se o grupo não for uma jogada legal (spec §3.1).
 */
export function applyMove(b: Board, g: Group): Board {
  if (!isValidGroup(b, g)) {
    throw new InvalidMoveError(
      `Grupo inválido em ${JSON.stringify(b)}: [${g.join(", ")}]`,
    );
  }

  const removidas = new Map<number, Set<number>>();
  for (const p of g) {
    const c = colOf(p);
    let linhas = removidas.get(c);
    if (linhas === undefined) {
      linhas = new Set<number>();
      removidas.set(c, linhas);
    }
    linhas.add(rowOf(p));
  }

  const saida: Column[] = [];

  for (let c = 0; c < b.length; c++) {
    const col = b[c] as Column;
    const linhas = removidas.get(c);

    if (linhas === undefined) {
      saida.push(col); // intacta: partilhada por referência
      continue;
    }

    // Gravidade: filtrar preserva a ordem, portanto o que estava acima desce.
    const nova = col.filter((_, r) => !linhas.has(r));

    // Colapso: a coluna que ficou vazia simplesmente não entra.
    if (nova.length > 0) saida.push(nova);
  }

  return saida;
}
