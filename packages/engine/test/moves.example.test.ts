/**
 * Os casos de exemplo da spec §9.1.
 *
 * Como um `Board` é JSON, estes testes escrevem-se como literais legíveis — são
 * tanto verificação como documentação executável das regras.
 *
 * Convenção de leitura: `[[3, 4], [5]]` é um tabuleiro de duas colunas; a
 * primeira tem o 3 na base e o 4 por cima, a segunda tem só o 5. As coordenadas
 * são `(coluna, linha-a-partir-da-base)`. A anotação `: Board` não é cerimónia —
 * é ela que faz o compilador verificar que os valores cabem em `Cell`.
 */

import { describe, expect, it } from "vitest";

import type { Board } from "../src/types";
import { applyMove, InvalidMoveError } from "../src/moves";
import { isValidGroup } from "../src/groups";
import { neighbours } from "../src/board";
import { packed } from "../src/types";
import { referenceGroups } from "./support/reference";

describe("eliminação de par simples", () => {
  it("limpa o tabuleiro", () => {
    const b: Board = [[3], [4]];
    const g = [packed(0, 0), packed(1, 0)];

    expect(applyMove(b, g)).toEqual([]);
  });
});

describe("gravidade dentro de uma coluna", () => {
  it("faz descer o que estava por cima do buraco", () => {
    const b: Board = [[3, 4, 5]];
    const g = [packed(0, 0), packed(0, 1)]; // 3 + 4

    // O 5 estava na linha 2 e passa a estar na base.
    expect(applyMove(b, g)).toEqual([[5]]);
  });
});

describe("colapso de colunas", () => {
  it("remove a coluna vazia e desliza as da direita para a esquerda", () => {
    const b: Board = [[3], [4], [2]];
    const g = [packed(0, 0), packed(1, 0)]; // 3 + 4

    expect(applyMove(b, g)).toEqual([[2]]);
  });

  it("colapsa várias colunas de uma vez, e não a que sobreviveu", () => {
    const b: Board = [[3], [2, 6], [2]];
    const g = [packed(0, 0), packed(1, 0), packed(2, 0)]; // 3 + 2 + 2

    // As colunas 0 e 2 esvaziam-se; a do meio fica com o 6, que desce à base.
    expect(applyMove(b, g)).toEqual([[6]]);
  });
});

describe("formas conexas livres", () => {
  it("grupo em L", () => {
    const b: Board = [
      [1, 2],
      [4],
    ];
    const g = [packed(0, 0), packed(0, 1), packed(1, 0)]; // 1 + 2 + 4

    expect(isValidGroup(b, g)).toBe(true);
    expect(applyMove(b, g)).toEqual([]);
  });

  it("grupo em T", () => {
    const b: Board = [
      [6, 2],
      [2, 1],
      [6, 2],
    ];
    // Barra horizontal na linha 1, com o pé a descer no meio.
    const g = [packed(0, 1), packed(1, 0), packed(1, 1), packed(2, 1)]; // 2+2+1+2

    expect(isValidGroup(b, g)).toBe(true);
    expect(applyMove(b, g)).toEqual([[6], [6]]);
  });

  it("grupo em S", () => {
    const b: Board = [
      [1, 2],
      [5, 3, 1],
    ];
    const g = [packed(0, 0), packed(0, 1), packed(1, 1), packed(1, 2)]; // 1+2+3+1

    expect(isValidGroup(b, g)).toBe(true);
    expect(applyMove(b, g)).toEqual([[5]]);
  });
});

describe("grupo de 7 peças", () => {
  it("sete 1s é o maior grupo possível", () => {
    // O mínimo de uma face é 1 e o alvo é 7, portanto nenhum grupo passa de 7
    // células (spec §2.2).
    const b: Board = [[1, 1], [1, 1], [1, 1], [1]];
    const g = [
      packed(0, 0),
      packed(0, 1),
      packed(1, 0),
      packed(1, 1),
      packed(2, 0),
      packed(2, 1),
      packed(3, 0),
    ];

    expect(g).toHaveLength(7);
    expect(isValidGroup(b, g)).toBe(true);
    expect(applyMove(b, g)).toEqual([]);
  });
});

describe("joker", () => {
  it("toma o valor que falta para 7", () => {
    const b: Board = [[0], [3]]; // joker + 3
    const g = [packed(0, 0), packed(1, 0)];

    expect(isValidGroup(b, g)).toBe(true);
    expect(applyMove(b, g)).toEqual([]);
  });

  it("nunca forma grupo sozinho", () => {
    const b: Board = [[0]];
    const g = [packed(0, 0)];

    // O valor máximo de uma face é 6, portanto o joker precisa sempre de pelo
    // menos uma peça normal (spec §2.6).
    expect(isValidGroup(b, g)).toBe(false);
    expect(() => applyMove(b, g)).toThrow(InvalidMoveError);
  });

  it("não entra num grupo cujas fixas já somam 7", () => {
    const b: Board = [[0], [3], [4]];
    const g = [packed(0, 0), packed(1, 0), packed(2, 0)];

    // As fixas somam 7 e não sobra valor entre 1 e 6 para o joker tomar.
    expect(isValidGroup(b, g)).toBe(false);

    // O par sem o joker é que é a jogada.
    expect(isValidGroup(b, [packed(1, 0), packed(2, 0)])).toBe(true);
  });
});

describe("estado bloqueado", () => {
  it("há peças e nenhum grupo válido", () => {
    const b: Board = [[6], [6]];

    expect(referenceGroups(b)).toEqual([]);
  });
});

describe("silhueta", () => {
  it("não há adjacência lateral quando a coluna do lado é mais baixa", () => {
    const b: Board = [
      [1, 6], // coluna alta
      [1], // coluna baixa
    ];

    const topo = packed(0, 1); // o 6, no topo da coluna alta

    // À direita, na linha 1, não existe célula nenhuma.
    expect(neighbours(b, topo)).toEqual([packed(0, 0)]);

    // Logo este par soma 7 mas não é conexo — não é jogada.
    expect(isValidGroup(b, [topo, packed(1, 0)])).toBe(false);

    // A jogada real é vertical, dentro da coluna alta.
    expect(isValidGroup(b, [packed(0, 0), packed(0, 1)])).toBe(true);
    expect(applyMove(b, [packed(0, 0), packed(0, 1)])).toEqual([[1]]);
  });
});
