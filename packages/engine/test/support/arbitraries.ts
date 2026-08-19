/**
 * Arbitrários fast-check para tabuleiros.
 *
 * Os tabuleiros são deliberadamente pequenos (≤ 9 células): `referenceGroups` é
 * exponencial, e o que se quer aqui é variedade de *forma* — silhuetas,
 * diferenças de altura, colunas de uma só célula — não tamanho.
 *
 * As faces pendem para valores baixos porque tabuleiros só com 5s e 6s quase
 * nunca têm grupos válidos, e um arbitrário que é maioritariamente rejeitado
 * testa pouco.
 */

import fc from "fast-check";

import type { Board, Cell, Column, Group } from "../../src/types";
import { JOKER } from "../../src/types";
import { totalSum } from "../../src/board";
import { referenceGroups } from "./reference";

const arbFace = fc.constantFrom<Cell>(1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6);

const arbColumn = (maxRows: number): fc.Arbitrary<Column> =>
  fc.array(arbFace, { minLength: 1, maxLength: maxRows });

/** Tabuleiro canónico: nenhuma coluna vazia, sem buracos, sem joker. */
export const arbBoard = (maxCols = 3, maxRows = 3): fc.Arbitrary<Board> =>
  fc.array(arbColumn(maxRows), { minLength: 1, maxLength: maxCols });

/** O mesmo, com exatamente um joker numa célula ao acaso. */
export const arbBoardComJoker = (maxCols = 3, maxRows = 3): fc.Arbitrary<Board> =>
  arbBoard(maxCols, maxRows).chain((b) => {
    const total = b.reduce((n, col) => n + col.length, 0);
    return fc.nat({ max: total - 1 }).map((alvo) => {
      let visto = 0;
      return b.map((col) =>
        col.map((cell) => (visto++ === alvo ? JOKER : cell)),
      );
    });
  });

/**
 * Tabuleiros cuja soma é múltipla de 7 — condição necessária para haver solução
 * (plano §4.1).
 *
 * Sem esta condição, seis em cada sete tabuleiros gerados são insolúveis só por
 * aritmética, e os testes do solver passam quase sempre pelo ramo aborrecido.
 * Medido: com `arbBoard` cru, 178 em 200 tabuleiros eram insolúveis e nenhum era
 * solúvel-mas-não-seguro, que é justamente o caso que interessa.
 */
export const arbBoardSomavel = (
  maxCols = 3,
  maxRows = 3,
): fc.Arbitrary<Board> =>
  arbBoard(maxCols, maxRows).filter((b) => totalSum(b) % 7 === 0);

/**
 * Um tabuleiro **e uma jogada legal nele**, para os testes de pós-condição de
 * §4.2. Tabuleiros sem nenhum grupo válido são descartados: não há jogada a
 * fazer, e o estado bloqueado tem testes próprios.
 */
export const arbJogada = (
  board: fc.Arbitrary<Board> = arbBoard(),
): fc.Arbitrary<{ board: Board; group: Group }> =>
  board
    .map((b) => ({ b, grupos: referenceGroups(b) }))
    .filter(({ grupos }) => grupos.length > 0)
    .chain(({ b, grupos }) =>
      fc
        .nat({ max: grupos.length - 1 })
        .map((i) => ({ board: b, group: grupos[i] as Group })),
    );
