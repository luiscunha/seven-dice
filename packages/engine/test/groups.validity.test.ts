import { describe, expect, it } from "vitest";

import type { Board } from "../src/types";
import {
  groupHasJoker,
  groupJokerValue,
  groupSum,
  isConnected,
  isValidGroup,
} from "../src/groups";
import { packed } from "../src/types";

describe("soma", () => {
  const b: Board = [[0, 3], [4]];

  it("só conta as faces fixas — o joker vale 0", () => {
    expect(groupSum(b, [packed(0, 0), packed(0, 1)])).toBe(3);
    expect(groupHasJoker(b, [packed(0, 0), packed(0, 1)])).toBe(true);
    expect(groupHasJoker(b, [packed(0, 1), packed(1, 0)])).toBe(false);
  });

  it("o valor do joker é o que falta para 7, e resolve-se sozinho", () => {
    // O jogador nunca escolhe o valor: dentro de um grupo válido só existe um
    // possível (spec §2.6).
    expect(groupJokerValue(b, [packed(0, 0), packed(0, 1)])).toBe(4);
    expect(groupJokerValue(b, [packed(0, 1), packed(1, 0)])).toBeUndefined();
  });
});

describe("conexão", () => {
  const b: Board = [
    [1, 2],
    [3, 4],
  ];

  it("uma célula sozinha é conexa", () => {
    expect(isConnected(b, [packed(0, 0)])).toBe(true);
  });

  it("células separadas não são", () => {
    expect(isConnected(b, [packed(0, 0), packed(1, 1)])).toBe(false);
  });

  it("um grupo vazio não é conexo", () => {
    expect(isConnected(b, [])).toBe(false);
  });
});

describe("isValidGroup — sem joker", () => {
  const b: Board = [
    [1, 6],
    [3, 4],
  ];

  it("aceita soma exatamente 7 num grupo conexo", () => {
    expect(isValidGroup(b, [packed(0, 0), packed(0, 1)])).toBe(true); // 1+6
    expect(isValidGroup(b, [packed(1, 0), packed(1, 1)])).toBe(true); // 3+4
  });

  it("rejeita soma diferente de 7", () => {
    expect(isValidGroup(b, [packed(0, 0), packed(1, 0)])).toBe(false); // 1+3
    expect(isValidGroup(b, [packed(0, 1), packed(1, 1)])).toBe(false); // 6+4
  });

  it("rejeita um grupo desconexo, mesmo somando 7", () => {
    // 6 + 1 = 7, mas as células estão na diagonal.
    expect(isValidGroup(b, [packed(0, 1), packed(1, 0)])).toBe(false);
  });

  it("rejeita o grupo vazio", () => {
    expect(isValidGroup(b, [])).toBe(false);
  });
});

describe("isValidGroup — forma canónica", () => {
  const par: Board = [[3], [4]];

  it("rejeita um grupo fora de ordem", () => {
    // A ordenação canónica é o que permite comparar e desduplicar grupos sem
    // esforço (spec §3.3). Normalizar com `toGroup` antes de chamar.
    expect(isValidGroup(par, [packed(1, 0), packed(0, 0)])).toBe(false);
  });

  it("rejeita células repetidas", () => {
    const coluna: Board = [[3, 4]];

    expect(isValidGroup(coluna, [packed(0, 0), packed(0, 0)])).toBe(false);
  });

  it("rejeita células fora da silhueta", () => {
    expect(isValidGroup(par, [packed(0, 0), packed(0, 1)])).toBe(false);
    expect(isValidGroup(par, [packed(0, 0), packed(9, 0)])).toBe(false);
  });
});

describe("isValidGroup — com joker", () => {
  it("aceita fixas entre 1 e 6", () => {
    const minimo: Board = [[0], [1]];
    const maximo: Board = [[0], [6]];

    expect(isValidGroup(minimo, [packed(0, 0), packed(1, 0)])).toBe(true);
    expect(isValidGroup(maximo, [packed(0, 0), packed(1, 0)])).toBe(true);
  });

  it("rejeita o joker sozinho, porque fixas seria 0", () => {
    const b: Board = [[0]];

    expect(isValidGroup(b, [packed(0, 0)])).toBe(false);
  });

  it("rejeita fixas iguais ou superiores a 7", () => {
    // Não sobra valor entre 1 e 6 para o joker tomar.
    const b: Board = [[0], [3], [4]];

    expect(
      isValidGroup(b, [packed(0, 0), packed(1, 0), packed(2, 0)]),
    ).toBe(false);
  });

  it("rejeita dois jokers, que deixariam o valor indeterminado", () => {
    // Um tabuleiro canónico nunca chega aqui, mas a ambiguidade não pode entrar
    // por esta porta.
    const b: Board = [[0], [0], [5]]; // viola a invariante 3 de propósito

    expect(isValidGroup(b, [packed(0, 0), packed(1, 0)])).toBe(false);
  });

  it("o mesmo valor de joker serve grupos de tamanhos diferentes", () => {
    // É flexível em posição, não em valor: um joker que vale 4 tanto se junta a
    // um 3 como a 1+2 (plano §2.6). A decisão do jogador é *em que grupo o
    // gasta*, não que valor lhe dá.
    const comTrio: Board = [[0], [3]];
    const comPar: Board = [[0], [1], [2]];

    expect(isValidGroup(comTrio, [packed(0, 0), packed(1, 0)])).toBe(true);
    expect(groupJokerValue(comTrio, [packed(0, 0), packed(1, 0)])).toBe(4);

    const g = [packed(0, 0), packed(1, 0), packed(2, 0)];
    expect(isValidGroup(comPar, g)).toBe(true);
    expect(groupJokerValue(comPar, g)).toBe(4);
  });
});
