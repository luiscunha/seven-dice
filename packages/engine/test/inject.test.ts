/**
 * Injeção de linhas.
 *
 * O que estes testes protegem não é a aritmética — é a **composição com as duas
 * transformações que já existiam**. Uma linha injetada tem de sobreviver à
 * gravidade e ao colapso sem partir nenhuma invariante, senão o modo Survival
 * corrompe tabuleiros a meio de uma partida.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Board, Cell, Group } from "../src/types";
import { packed } from "../src/types";
import { InvalidInjectionError, pushRow, tallestColumn } from "../src/inject";
import { applyMove } from "../src/moves";
import { boardKey, checkInvariants, pieceCount, totalSum } from "../src/board";

const face = (): fc.Arbitrary<Cell> =>
  fc.integer({ min: 1, max: 6 }) as fc.Arbitrary<Cell>;

const tabuleiro = (): fc.Arbitrary<Board> =>
  fc.array(fc.array(face(), { minLength: 1, maxLength: 6 }), {
    minLength: 1,
    maxLength: 6,
  });

describe("pushRow", () => {
  it("acrescenta por cima e deixa a base como estava", () => {
    const b: Board = [
      [1, 2],
      [3],
    ];
    expect(pushRow(b, [4, 5])).toEqual([
      [1, 2, 4],
      [3, 5],
    ]);
  });

  it("`null` salta a coluna, o que dá linhas recortadas", () => {
    expect(pushRow([[1], [2], [3]], [4, null, 6])).toEqual([[1, 4], [2], [3, 6]]);
  });

  it("uma linha mais larga alarga o tabuleiro", () => {
    // O caso que impede a espiral de morte: o colapso estreitou, a linha repõe.
    expect(pushRow([[1]], [2, 3, 4])).toEqual([[1, 2], [3], [4]]);
  });

  it("as colunas que a linha não toca são partilhadas por referência", () => {
    const b: Board = [[1], [2]];
    const depois = pushRow(b, [5, null]);
    expect(depois[1]).toBe(b[1]);
  });

  it("recusa deixar um buraco na base", () => {
    // A coluna 1 não existe e não recebe célula: não há como a representar.
    expect(() => pushRow([[1]], [2, null, 3])).toThrow(InvalidInjectionError);
  });

  it("recusa passar do limite das coordenadas empacotadas", () => {
    const alta: Board = [Array.from({ length: 64 }, () => 1 as Cell)];
    expect(() => pushRow(alta, [1])).toThrow(InvalidInjectionError);
  });

  it("recusa um segundo joker", () => {
    expect(() => pushRow([[0]], [0])).toThrow(InvalidInjectionError);
    // Mas um joker num tabuleiro que não tem nenhum entra bem.
    expect(pushRow([[1]], [0])).toEqual([[1, 0]]);
  });

  it("não altera o tabuleiro de entrada", () => {
    const b: Board = [[1], [2]];
    const copia = JSON.parse(JSON.stringify(b)) as Board;
    pushRow(b, [3, 4]);
    expect(b).toEqual(copia);
  });
});

describe("tallestColumn", () => {
  it("mede a coluna mais alta, e um vazio é 0", () => {
    expect(tallestColumn([])).toBe(0);
    expect(tallestColumn([[1], [1, 2, 3], [1, 2]])).toBe(3);
  });
});

describe("as invariantes sobrevivem à injeção", () => {
  it("qualquer linha válida deixa o tabuleiro canónico", () => {
    fc.assert(
      fc.property(tabuleiro(), fc.array(face(), { minLength: 1, maxLength: 8 }), (b, row) => {
        const depois = pushRow(b, row);
        expect(checkInvariants(depois)).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it("a soma sobe exatamente o que a linha trouxe", () => {
    fc.assert(
      fc.property(tabuleiro(), fc.array(face(), { minLength: 1, maxLength: 8 }), (b, row) => {
        const trazido = row.reduce<number>((n, v) => n + v, 0);
        expect(totalSum(pushRow(b, row))).toBe(totalSum(b) + trazido);
        expect(pieceCount(pushRow(b, row))).toBe(pieceCount(b) + row.length);
      }),
      { numRuns: 300 },
    );
  });

  it("injetar antes ou depois da jogada dá tabuleiros diferentes", () => {
    /*
     * **Injetar e jogar não comutam**, e é essa a razão de a fila ter de mostrar
     * as peças e não só a contagem.
     *
     * `[[1,2],[4]]` — o L de 1+2+4 vive todo na base, e a linha entra acima.
     * Jogar primeiro colapsa as duas colunas antes de a linha existir; injetar
     * primeiro deixa o 5 e o 6 a descer para bases diferentes. O jogador tem de
     * poder ver qual das duas ordens lhe convém.
     */
    const b: Board = [
      [1, 2],
      [4],
    ];
    const g: Group = [packed(0, 0), packed(0, 1), packed(1, 0)] as Group;
    const row: readonly Cell[] = [5, 6];

    const injetarDepois = pushRow(applyMove(b, g), [6]);
    const jogarDepois = applyMove(pushRow(b, row), g);

    // Duas colunas de uma célula, contra uma só. `boardKey` separa-as com `|`.
    expect(boardKey(jogarDepois)).toBe("5|6");
    expect(boardKey(injetarDepois)).toBe("6");
    expect(totalSum(jogarDepois)).toBe(11);
  });
});
