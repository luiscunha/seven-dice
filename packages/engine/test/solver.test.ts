/**
 * Solver (spec §5).
 *
 * O tabuleiro-âncora destes testes é `[[1, 2, 4], [6, 5, 3]]`. Vale a pena
 * perceber porquê, porque é o jogo inteiro em seis peças:
 *
 *     4 3        As peças são 1..6, soma 21 = três jogadas.
 *     2 5        A única partição possível é {1,6}, {2,5}, {3,4} —
 *     1 6        os três pares horizontais.
 *
 * Mas a coluna da esquerda, 1+2+4, também soma 7 e é conexa. Quem a jogar fica
 * com {6, 5, 3}: soma 14, e nenhum subconjunto soma 7. O tabuleiro morre sem
 * aviso, exatamente como o plano descreve o joker mal gasto (plano §2.6).
 *
 * É portanto solúvel, mas não *greedy-safe* — a distinção que separa os corpora
 * dos dois modos (plano §6.1).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Board, Group } from "../src/types";
import { packed } from "../src/types";
import { applyMove } from "../src/moves";
import { totalSum } from "../src/board";
import { findAllGroups, hasAnyGroup } from "../src/groups";
import {
  DEFAULT_LIMITS,
  findSolution,
  isGreedySafe,
  isSolvable,
} from "../src/solver";
import { arbBoard, arbBoardSomavel } from "./support/arbitraries";

/** Aplica a solução passo a passo. Devolve o tabuleiro final. */
const jogar = (b: Board, solucao: readonly Group[]): Board =>
  solucao.reduce<Board>((atual, g) => applyMove(atual, g), b);

const ARMADILHA: Board = [
  [1, 2, 4],
  [6, 5, 3],
];

/** O que sobra de ARMADILHA depois da jogada fatal. */
const MORTO: Board = [[6, 5, 3]];

describe("isSolvable", () => {
  it("o tabuleiro vazio é trivialmente solúvel", () => {
    expect(isSolvable([])).toBe("yes");
  });

  it("um par simples", () => {
    expect(isSolvable([[3], [4]])).toBe("yes");
  });

  it("peças sem nenhuma jogada", () => {
    expect(isSolvable([[6], [6]])).toBe("no");
  });

  it("soma múltipla de 7 mas sem partição possível", () => {
    // 6+5+3 = 14, e nenhum subconjunto soma 7.
    expect(hasAnyGroup(MORTO)).toBe(false);
    expect(isSolvable(MORTO)).toBe("no");
  });

  it("o tabuleiro-armadilha é solúvel", () => {
    expect(isSolvable(ARMADILHA)).toBe("yes");
  });

  it("distingue solúvel de não-solúvel dentro do mesmo tabuleiro", () => {
    // A jogada boa mantém o tabuleiro vivo...
    const bom = applyMove(ARMADILHA, [packed(0, 0), packed(1, 0)]); // 1+6
    expect(isSolvable(bom)).toBe("yes");

    // ...a jogada fatal mata-o.
    const mau = applyMove(ARMADILHA, [
      packed(0, 0),
      packed(0, 1),
      packed(0, 2),
    ]); // 1+2+4
    expect(mau).toEqual(MORTO);
    expect(isSolvable(mau)).toBe("no");
  });
});

describe("limites", () => {
  it("um orçamento de estados demasiado curto dá inconclusive, não uma exceção", () => {
    // Um caso patológico não pode parar o pipeline (spec §5.1).
    expect(isSolvable(ARMADILHA, { maxStates: 1 })).toBe("inconclusive");
  });

  it("inconclusive não se confunde com no", () => {
    // O mesmo limite curto sobre um tabuleiro que *de facto* não tem solução.
    expect(isSolvable(MORTO, { maxStates: 1 })).toBe("no");
    // (o estado inicial não tem jogadas, portanto resolve-se sem expandir nada)
  });

  it("o orçamento de tempo exige o relógio injetado", () => {
    // A engine não tem relógio (spec §1.1). Quem quer um teto de latência
    // fornece o seu — e aceita que o veredicto passe a depender da máquina.
    let agora = 0;
    const veredicto = isSolvable(ARMADILHA, {
      maxStates: 1_000_000,
      timeBudget: {
        now: () => {
          agora += 1000;
          return agora;
        },
        millis: 1,
      },
    });

    expect(veredicto).toBe("inconclusive");
  });

  it("com limites folgados o veredicto é o mesmo com e sem relógio", () => {
    const semRelogio = isSolvable(ARMADILHA);
    const comRelogio = isSolvable(ARMADILHA, {
      maxStates: DEFAULT_LIMITS.maxStates,
      timeBudget: { now: () => 0, millis: 10_000 },
    });

    expect(comRelogio).toBe(semRelogio);
  });
});

describe("findSolution", () => {
  it("devolve uma sequência que esvazia o tabuleiro", () => {
    const solucao = findSolution(ARMADILHA);

    expect(solucao).not.toBeNull();
    expect(jogar(ARMADILHA, solucao as Group[])).toEqual([]);
  });

  it("a solução tem o comprimento certo: cada jogada retira 7", () => {
    const solucao = findSolution(ARMADILHA) as Group[];

    expect(solucao).toHaveLength(3); // soma 21
  });

  it("devolve null quando não há solução", () => {
    expect(findSolution(MORTO)).toBeNull();
    expect(findSolution([[6], [6]])).toBeNull();
  });

  it("o tabuleiro vazio resolve-se sem jogadas", () => {
    expect(findSolution([])).toEqual([]);
  });

  it("é determinístico", () => {
    expect(findSolution(ARMADILHA)).toEqual(findSolution(ARMADILHA));
  });

  it("recupera de um primeiro ramo fatal", () => {
    // Os grupos maiores são experimentados primeiro (spec §5.4), portanto a
    // coluna de três é a primeira tentativa — e é a fatal. A solução só aparece
    // por backtracking.
    const solucao = findSolution(ARMADILHA) as Group[];

    expect(solucao[0]).not.toEqual([packed(0, 0), packed(0, 1), packed(0, 2)]);
    expect(jogar(ARMADILHA, solucao)).toEqual([]);
  });
});

describe("isGreedySafe", () => {
  it("o tabuleiro vazio é seguro", () => {
    expect(isGreedySafe([])).toBe("yes");
  });

  it("um par simples é seguro: não há escolha errada", () => {
    expect(isGreedySafe([[3], [4]])).toBe("yes");
  });

  it("um tabuleiro onde todas as jogadas levam a bom porto", () => {
    // Quatro jogadas possíveis, todas deixando um par válido.
    expect(isGreedySafe([[1, 6], [6, 1]])).toBe("yes");
  });

  it("o tabuleiro-armadilha é solúvel mas NÃO é greedy-safe", () => {
    // É esta a diferença entre os corpora dos dois modos (plano §6.1): o modo
    // puzzle quer isto, o modo tempo não pode tê-lo.
    expect(isSolvable(ARMADILHA)).toBe("yes");
    expect(isGreedySafe(ARMADILHA)).toBe("no");
  });

  it("peças sem jogada nenhuma não são seguras", () => {
    expect(isGreedySafe([[6], [6]])).toBe("no");
  });

  it("um orçamento curto dá inconclusive", () => {
    expect(isGreedySafe(ARMADILHA, { maxStates: 1 })).toBe("inconclusive");
  });
});

describe("propriedades", () => {
  /*
   * Os arbitrários aqui são `arbBoardSomavel`, não `arbBoard`: um tabuleiro
   * aleatório tem 1/7 de hipóteses de a soma ser múltipla de 7, e sem essa
   * condição a maioria das execuções passa pelo ramo "insolúvel" sem exercitar
   * nada. Medido antes e depois, em 200 execuções:
   *
   *              greedy-safe   solúvel mas não   insolúvel
   *   arbBoard            22                 0         178
   *   arbBoardSomavel    159                 8          33
   *
   * A coluna do meio é a que interessa e a que não existia.
   *
   * Os testes que dependem de uma condição contam quantas vezes ela se
   * verificou e falham se for zero — uma propriedade vacuamente verdadeira é
   * pior do que nenhuma, porque parece cobertura.
   */

  it("greedy-safe implica solúvel", () => {
    // Se nenhum estado alcançável é beco sem saída e cada jogada retira peças,
    // então todo o caminho acaba em tabuleiro vazio.
    let exercitados = 0;

    fc.assert(
      fc.property(arbBoardSomavel(), (b) => {
        if (isGreedySafe(b) !== "yes") return;
        exercitados++;

        expect(isSolvable(b)).toBe("yes");
      }),
      { numRuns: 200 },
    );

    expect(exercitados).toBeGreaterThan(0);
  });

  it("um tabuleiro greedy-safe nunca bloqueia, escolha-se o que se escolher", () => {
    // A versão em pequeno do teste de 10 000 playouts da spec §9.2, que só fecha
    // na fase 5. As escolhas vêm do fast-check em vez de um RNG semeado, porque
    // o `Rng` só chega na fase 4.
    let exercitados = 0;

    fc.assert(
      fc.property(
        arbBoardSomavel(),
        fc.array(fc.nat({ max: 50 }), { minLength: 20, maxLength: 20 }),
        (inicial, escolhas) => {
          if (isGreedySafe(inicial) !== "yes") return;
          exercitados++;

          let b = inicial;

          for (const escolha of escolhas) {
            if (b.length === 0) break;

            const grupos = [...findAllGroups(b)];
            expect(grupos.length).toBeGreaterThan(0); // nunca bloqueia

            b = applyMove(b, grupos[escolha % grupos.length] as Group);
          }

          expect(b).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );

    expect(exercitados).toBeGreaterThan(0);
  });

  it("isSolvable concorda com findSolution", () => {
    let comSolucao = 0;
    let semSolucao = 0;

    fc.assert(
      fc.property(arbBoardSomavel(), (b) => {
        const veredicto = isSolvable(b);
        const solucao = findSolution(b);

        if (veredicto === "yes") {
          comSolucao++;
          expect(solucao).not.toBeNull();
          expect(jogar(b, solucao as Group[])).toEqual([]);
        } else if (veredicto === "no") {
          semSolucao++;
          expect(solucao).toBeNull();
        }
      }),
      { numRuns: 200 },
    );

    // Os dois lados da equivalência têm de aparecer.
    expect(comSolucao).toBeGreaterThan(0);
    expect(semSolucao).toBeGreaterThan(0);
  });

  it("toda a solução devolvida esvazia mesmo o tabuleiro", () => {
    let exercitados = 0;

    fc.assert(
      fc.property(arbBoardSomavel(), (b) => {
        const solucao = findSolution(b);
        if (solucao === null) return;
        exercitados++;

        expect(jogar(b, solucao)).toEqual([]);
      }),
      { numRuns: 200 },
    );

    expect(exercitados).toBeGreaterThan(0);
  });

  it("a solução tem sempre soma/7 jogadas", () => {
    fc.assert(
      fc.property(arbBoardSomavel(), (b) => {
        const solucao = findSolution(b);
        if (solucao === null) return;

        // Cada jogada retira exatamente 7 (plano §4.1).
        expect(solucao.length).toBe(totalSum(b) / 7);
      }),
      { numRuns: 200 },
    );
  });

  it("um veredicto nunca é uma exceção, por mais apertado que seja o limite", () => {
    // Aqui usa-se `arbBoard` cru de propósito: quer-se a variedade toda,
    // incluindo os tabuleiros que não têm hipótese nenhuma.
    fc.assert(
      fc.property(arbBoard(), fc.nat({ max: 5 }), (b, teto) => {
        const limites = { maxStates: teto };

        expect(["yes", "no", "inconclusive"]).toContain(isSolvable(b, limites));
        expect(["yes", "no", "inconclusive"]).toContain(
          isGreedySafe(b, limites),
        );
        expect(() => findSolution(b, limites)).not.toThrow();
      }),
    );
  });
});
