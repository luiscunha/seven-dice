import { describe, expect, it } from "vitest";

import type { Board, Cell, Column } from "../src/types";
import {
  boardKey,
  cellAt,
  checkInvariants,
  height,
  jokerAt,
  neighbours,
  pieceCount,
  totalSum,
  width,
} from "../src/board";
import { colOf, packed, rowOf, toGroup } from "../src/types";

describe("coordenadas empacotadas", () => {
  it("são reversíveis", () => {
    for (const c of [0, 1, 7, 63]) {
      for (const r of [0, 1, 7, 63]) {
        const p = packed(c, r);
        expect(colOf(p)).toBe(c);
        expect(rowOf(p)).toBe(r);
      }
    }
  });

  it("ordenam por coluna e depois por linha", () => {
    expect(packed(0, 63)).toBeLessThan(packed(1, 0));
    expect(packed(2, 0)).toBeLessThan(packed(2, 1));
  });
});

describe("toGroup", () => {
  it("ordena e desduplica a entrada solta da UI", () => {
    const toques = [packed(1, 0), packed(0, 1), packed(1, 0), packed(0, 0)];

    expect(toGroup(toques)).toEqual([packed(0, 0), packed(0, 1), packed(1, 0)]);
  });
});

describe("dimensões", () => {
  const b: Board = [[1, 2, 3], [4], [5, 6]];

  it("largura e alturas", () => {
    expect(width(b)).toBe(3);
    expect(height(b, 0)).toBe(3);
    expect(height(b, 1)).toBe(1);
    expect(height(b, 2)).toBe(2);
  });

  it("uma coluna que não existe tem altura zero, não é erro", () => {
    expect(height(b, 99)).toBe(0);
    expect(cellAt(b, packed(99, 0))).toBeUndefined();
  });

  it("células fora da silhueta não existem", () => {
    expect(cellAt(b, packed(1, 0))).toBe(4);
    expect(cellAt(b, packed(1, 1))).toBeUndefined();
  });

  it("contagem e soma", () => {
    expect(pieceCount(b)).toBe(6);
    expect(totalSum(b)).toBe(21);
  });
});

describe("adjacência", () => {
  const quadrado: Board = [
    [1, 2, 3],
    [4, 5, 6],
    [1, 2, 3],
  ];

  it("uma célula interior tem quatro vizinhos", () => {
    expect(neighbours(quadrado, packed(1, 1))).toEqual([
      packed(0, 1),
      packed(1, 0),
      packed(1, 2),
      packed(2, 1),
    ]);
  });

  it("os vizinhos saem em ordem crescente de coordenada empacotada", () => {
    const vizinhos = neighbours(quadrado, packed(1, 1));

    expect([...vizinhos].sort((x, y) => x - y)).toEqual(vizinhos);
  });

  it("a base não tem vizinho abaixo e o topo não tem acima", () => {
    const b: Board = [[1, 2]];

    expect(neighbours(b, packed(0, 0))).toEqual([packed(0, 1)]);
    expect(neighbours(b, packed(0, 1))).toEqual([packed(0, 0)]);
  });

  it("a adjacência lateral depende da altura da coluna vizinha", () => {
    // Pirâmide: as colunas laterais são mais baixas, portanto as células altas
    // do centro perdem vizinhos laterais. É isto que muda a ordem natural de
    // resolução numa silhueta (plano §7.1).
    const b: Board = [[1], [2, 3, 4], [5]];

    expect(neighbours(b, packed(1, 0))).toEqual([
      packed(0, 0),
      packed(1, 1),
      packed(2, 0),
    ]);

    // Na linha 1 já não há nada à esquerda nem à direita.
    expect(neighbours(b, packed(1, 1))).toEqual([packed(1, 0), packed(1, 2)]);
    expect(neighbours(b, packed(1, 2))).toEqual([packed(1, 1)]);
  });

  it("a adjacência é simétrica", () => {
    const b: Board = [[1], [2, 3, 4], [5], [6, 1]];

    for (let c = 0; c < b.length; c++) {
      const col = b[c] as Column;
      for (let r = 0; r < col.length; r++) {
        const p = packed(c, r);
        for (const q of neighbours(b, p)) {
          expect(neighbours(b, q)).toContain(p);
        }
      }
    }
  });
});

describe("joker", () => {
  it("localiza-se, e vale 0 na soma do tabuleiro", () => {
    const b: Board = [[1, 0], [3]];

    expect(jokerAt(b)).toBe(packed(0, 1));
    expect(totalSum(b)).toBe(4);
  });

  it("é undefined quando não há", () => {
    const b: Board = [[1], [2]];

    expect(jokerAt(b)).toBeUndefined();
  });
});

describe("boardKey", () => {
  it("é curta e distingue tabuleiros", () => {
    const b: Board = [[3, 4, 1], [2, 5], [0]];

    expect(boardKey(b)).toBe("341|25|0");
    expect(boardKey([])).toBe("");
  });

  it("distingue um tabuleiro do seu espelho", () => {
    // Não se aplica redução por simetria: um tabuleiro espelhado é um estado
    // distinto, e a redução falsearia a contagem de estados (spec §2.6).
    const original: Board = [[1], [2]];
    const espelho: Board = [[2], [1]];

    expect(boardKey(original)).not.toBe(boardKey(espelho));
  });

  it("o separador impede que colunas diferentes colidam", () => {
    const a: Board = [[1, 2], [3]];
    const b: Board = [[1], [2, 3]];

    expect(boardKey(a)).not.toBe(boardKey(b));
  });
});

describe("checkInvariants", () => {
  it("aceita um tabuleiro bem formado", () => {
    const b: Board = [[1, 2], [3], [0, 4]];

    expect(checkInvariants(b)).toEqual([]);
    expect(checkInvariants([])).toEqual([]);
  });

  it("acusa coluna vazia", () => {
    const b: Board = [[1], [], [2]];

    expect(checkInvariants(b)).toEqual([
      expect.stringContaining("invariante 1"),
    ]);
  });

  it("acusa mais do que um joker", () => {
    const b: Board = [[0], [0]];

    expect(checkInvariants(b)).toEqual([
      expect.stringContaining("invariante 3"),
    ]);
  });

  it("acusa valores fora de 0–6", () => {
    // O compilador já rejeita isto; a verificação existe para tabuleiros que
    // entrem por JSON, onde não há tipos a proteger.
    const malformado = [[9]] as unknown as Board;

    expect(checkInvariants(malformado)).toEqual([
      expect.stringContaining("fora de 0–6"),
    ]);
  });

  it("acusa colunas mais altas do que as coordenadas empacotadas suportam", () => {
    const alta: Column = Array.from({ length: 65 }, () => 1 as Cell);
    const b: Board = [alta];

    expect(checkInvariants(b)).toEqual([
      expect.stringContaining("excede o limite de 64"),
    ]);
  });
});
