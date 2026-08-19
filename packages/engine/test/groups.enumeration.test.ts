/**
 * Enumeração de grupos (spec §3.2).
 *
 * O teste que carrega esta fase é o de **paridade com a implementação de
 * referência**: a enumeração por célula mínima tem de devolver exatamente o
 * mesmo conjunto que a força bruta sobre todos os subconjuntos, nem mais nem
 * menos, e sem repetir.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Board, Group } from "../src/types";
import { packed } from "../src/types";
import { findAllGroups, hasAnyGroup, isValidGroup } from "../src/groups";
import { arbBoard, arbBoardComJoker } from "./support/arbitraries";
import { referenceGroups } from "./support/reference";

const chave = (g: Group): string => g.join(",");
const chaves = (gs: readonly Group[]): string[] => gs.map(chave).sort();

describe("exemplos", () => {
  it("um par simples dá exatamente um grupo", () => {
    const b: Board = [[3], [4]];

    expect([...findAllGroups(b)]).toEqual([[packed(0, 0), packed(1, 0)]]);
  });

  it("um tabuleiro bloqueado não dá nenhum", () => {
    const b: Board = [[6], [6]];

    expect([...findAllGroups(b)]).toEqual([]);
    expect(hasAnyGroup(b)).toBe(false);
  });

  it("os grupos saem em forma canónica, ordenados", () => {
    const b: Board = [
      [1, 2],
      [4],
    ];

    for (const g of findAllGroups(b)) {
      expect([...g].sort((x, y) => x - y)).toEqual(g);
    }
  });

  it("encontra o mesmo conjunto por caminhos diferentes uma só vez", () => {
    // Quadrado 2x2 de 1s mais um 3: o grupo {1,1,1,3} e o grupo {1,1,1,1,3}
    // podem construir-se por várias ordens de visita. A enumeração ingénua
    // devolveria cada um várias vezes.
    const b: Board = [
      [1, 1],
      [1, 1],
      [3],
    ];

    const grupos = [...findAllGroups(b)];

    expect(new Set(grupos.map(chave)).size).toBe(grupos.length);
    expect(chaves(grupos)).toEqual(chaves(referenceGroups(b)));
  });

  it("encontra o grupo de 7 peças", () => {
    const b: Board = [[1, 1], [1, 1], [1, 1], [1]];

    const grupos = [...findAllGroups(b)];

    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toHaveLength(7);
  });

  it("enumera grupos com joker", () => {
    const b: Board = [[0], [3]];

    expect([...findAllGroups(b)]).toEqual([[packed(0, 0), packed(1, 0)]]);
  });

  it("não enumera o joker sozinho", () => {
    const b: Board = [[0]];

    expect([...findAllGroups(b)]).toEqual([]);
    expect(hasAnyGroup(b)).toBe(false);
  });

  it("respeita a silhueta", () => {
    // O 6 no topo não tem vizinho à direita, portanto 6+1 não é grupo.
    const b: Board = [
      [1, 6],
      [1],
    ];

    expect([...findAllGroups(b)]).toEqual([[packed(0, 0), packed(0, 1)]]);
  });
});

describe("paridade com a implementação de referência", () => {
  it("devolve exatamente os mesmos grupos, sem joker", () => {
    fc.assert(
      fc.property(arbBoard(), (b) => {
        expect(chaves([...findAllGroups(b)])).toEqual(
          chaves(referenceGroups(b)),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("devolve exatamente os mesmos grupos, com joker", () => {
    fc.assert(
      fc.property(arbBoardComJoker(), (b) => {
        expect(chaves([...findAllGroups(b)])).toEqual(
          chaves(referenceGroups(b)),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("é exaustiva num tabuleiro cheio de 1s e 2s, onde há muitos grupos", () => {
    // O caso adverso: faces pequenas fazem explodir o número de subgrafos
    // conexos com soma ≤ 7, que é exatamente onde a poda e a desduplicação têm
    // de estar certas.
    const b: Board = [
      [1, 2, 1],
      [2, 1, 2],
      [1, 2, 1],
    ];

    const meus = [...findAllGroups(b)];

    expect(chaves(meus)).toEqual(chaves(referenceGroups(b)));
    expect(meus.length).toBeGreaterThan(20);
  });
});

describe("propriedades (spec §9.2)", () => {
  it("todo o grupo devolvido passa isValidGroup", () => {
    fc.assert(
      fc.property(arbBoardComJoker(), (b) => {
        for (const g of findAllGroups(b)) {
          expect(isValidGroup(b, g)).toBe(true);
        }
      }),
    );
  });

  it("não devolve duplicados", () => {
    fc.assert(
      fc.property(arbBoardComJoker(), (b) => {
        const grupos = [...findAllGroups(b)];

        expect(new Set(grupos.map(chave)).size).toBe(grupos.length);
      }),
    );
  });

  it("nenhum grupo excede 7 células", () => {
    fc.assert(
      fc.property(arbBoardComJoker(), (b) => {
        for (const g of findAllGroups(b)) {
          expect(g.length).toBeLessThanOrEqual(7);
        }
      }),
    );
  });

  it("cada grupo tem a raiz como célula mínima e é conexo", () => {
    fc.assert(
      fc.property(arbBoard(), (b) => {
        for (const g of findAllGroups(b)) {
          expect(g.length).toBeGreaterThan(0);
          expect(Math.min(...g)).toBe(g[0]);
        }
      }),
    );
  });
});

describe("hasAnyGroup", () => {
  it("concorda com findAllGroups", () => {
    // Guarda a duplicação deliberada entre `procurar` e `expandir`: são duas
    // travessias da mesma árvore e têm de responder o mesmo.
    fc.assert(
      fc.property(arbBoardComJoker(), (b) => {
        const existe = !findAllGroups(b).next().done;

        expect(hasAnyGroup(b)).toBe(existe);
      }),
      { numRuns: 500 },
    );
  });

  it("é verdadeiro para um par simples e falso para um bloqueio", () => {
    expect(hasAnyGroup([[3], [4]])).toBe(true);
    expect(hasAnyGroup([[5, 5]])).toBe(false);
    expect(hasAnyGroup([])).toBe(false);
  });
});

describe("custo", () => {
  it("um 6x6 denso enumera-se sem explodir", () => {
    // Não é uma medição — é uma rede de segurança contra uma regressão que torne
    // a enumeração exponencial. A spec §3.2 estima dezenas de microssegundos;
    // o limite aqui é folgado três ordens de grandeza acima.
    const b: Board = Array.from({ length: 6 }, () => [1, 2, 1, 2, 1, 2] as const);

    const inicio = Date.now();
    const grupos = [...findAllGroups(b)];
    const decorrido = Date.now() - inicio;

    expect(grupos.length).toBeGreaterThan(100);
    expect(decorrido).toBeLessThan(200);
  });
});
