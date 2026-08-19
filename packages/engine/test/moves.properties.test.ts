/**
 * As quatro pós-condições de `applyMove` (spec §4.2), verificadas sobre entrada
 * gerada em vez de valores concretos.
 *
 * A última — a preservação da ordem relativa — é a que torna a construção
 * reversa possível (plano §4.2) e merece o teste explícito que aqui tem.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Board, Cell } from "../src/types";
import { packed } from "../src/types";
import { checkInvariants, pieceCount, totalSum } from "../src/board";
import { groupJokerValue, groupSum, isValidGroup } from "../src/groups";
import { applyMove } from "../src/moves";
import { arbBoard, arbBoardComJoker, arbJogada } from "./support/arbitraries";
import { referenceGroups } from "./support/reference";

const TARGET = 7;

describe("pós-condições de applyMove", () => {
  it("a soma desce exatamente 7, contando o joker pelo valor que tomou", () => {
    fc.assert(
      fc.property(arbJogada(arbBoardComJoker()), ({ board, group }) => {
        const antes = totalSum(board);
        const depois = totalSum(applyMove(board, group));

        // `totalSum` conta o joker como 0, portanto o que sai do tabuleiro é a
        // soma das fixas do grupo...
        expect(antes - depois).toBe(groupSum(board, group));

        // ...e essa soma, mais o valor que o joker tomou, é sempre 7.
        const joker = groupJokerValue(board, group) ?? 0;
        expect(groupSum(board, group) + joker).toBe(TARGET);
      }),
    );
  });

  it("a contagem de peças desce exatamente o tamanho do grupo", () => {
    fc.assert(
      fc.property(arbJogada(), ({ board, group }) => {
        expect(pieceCount(applyMove(board, group))).toBe(
          pieceCount(board) - group.length,
        );
      }),
    );
  });

  it("as invariantes de §2.2 mantêm-se", () => {
    fc.assert(
      fc.property(arbJogada(arbBoardComJoker()), ({ board, group }) => {
        expect(checkInvariants(applyMove(board, group))).toEqual([]);
      }),
    );
  });

  it("a ordem relativa das peças não removidas é preservada", () => {
    fc.assert(
      fc.property(arbJogada(arbBoardComJoker()), ({ board, group }) => {
        const removidas = new Set<number>(group);
        const esperado: Cell[] = [];

        for (let c = 0; c < board.length; c++) {
          const col = board[c] as readonly Cell[];
          for (let r = 0; r < col.length; r++) {
            if (!removidas.has(packed(c, r))) esperado.push(col[r] as Cell);
          }
        }

        // Achatar coluna a coluna, da base para o topo, dá a ordem de leitura
        // canónica. Gravidade e colapso movem as peças, mas nunca as reordenam —
        // é essa a propriedade de que depende toda a construção reversa.
        expect(applyMove(board, group).flat()).toEqual(esperado);
      }),
    );
  });

  it("nunca devolve o mesmo objeto: o tabuleiro de entrada fica intacto", () => {
    fc.assert(
      fc.property(arbJogada(), ({ board, group }) => {
        const copia = JSON.parse(JSON.stringify(board)) as Board;
        const depois = applyMove(board, group);

        expect(depois).not.toBe(board);
        expect(board).toEqual(copia);
      }),
    );
  });
});

describe("invariantes gerais", () => {
  it("todo o grupo devolvido pela referência passa isValidGroup", () => {
    fc.assert(
      fc.property(arbBoardComJoker(), (board) => {
        for (const g of referenceGroups(board)) {
          expect(isValidGroup(board, g)).toBe(true);
        }
      }),
    );
  });

  it("nenhum grupo válido excede 7 células", () => {
    // O mínimo de uma face é 1 e o alvo é 7 (spec §3.2).
    fc.assert(
      fc.property(arbBoard(), (board) => {
        for (const g of referenceGroups(board)) {
          expect(g.length).toBeLessThanOrEqual(TARGET);
        }
      }),
    );
  });

  it("um tabuleiro arbitrário respeita as invariantes por construção", () => {
    fc.assert(
      fc.property(arbBoardComJoker(), (board) => {
        expect(checkInvariants(board)).toEqual([]);
      }),
    );
  });

  it("aplicar jogadas até bloquear nunca viola as invariantes", () => {
    fc.assert(
      fc.property(arbBoard(), (inicial) => {
        let board: Board = inicial;

        for (let passo = 0; passo < 20; passo++) {
          const grupos = referenceGroups(board);
          const escolhido = grupos[0];
          if (escolhido === undefined) break;

          board = applyMove(board, escolhido);
          expect(checkInvariants(board)).toEqual([]);
        }

        // Ou esvaziou, ou bloqueou — em qualquer dos casos sem estados inválidos
        // pelo caminho.
        expect(referenceGroups(board).length === 0 || board.length === 0).toBe(
          true,
        );
      }),
    );
  });
});
