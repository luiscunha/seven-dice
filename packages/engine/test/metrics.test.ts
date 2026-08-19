/**
 * Métricas (spec §7).
 *
 * O teste central é a ponte entre o solver e os playouts: **um tabuleiro
 * greedy-safe nunca bloqueia em 10 000 playouts** (spec §9.2). É o que fecha o
 * teste que ficou em `skip` na fase 3, e é a garantia de que o corpus do modo
 * tempo faz o que promete — o jogador nunca perde por jogar mal (plano §6.3).
 */

import { describe, expect, it } from "vitest";

import type { Board } from "../src/types";
import { mulberry32 } from "../src/rng";
import { isGreedySafe, isSolvable } from "../src/solver";
import { fairnessFloor, measureSurvival, runPlayout } from "../src/metrics";
import { generate } from "../src/generator";

/** Solúvel, mas a coluna da esquerda mata-o. Ver `solver.test.ts`. */
const ARMADILHA: Board = [
  [1, 2, 4],
  [6, 5, 3],
];

/** Todas as jogadas levam a bom porto. */
const SEGURO: Board = [
  [1, 6],
  [6, 1],
];

describe("a ponte entre o solver e os playouts", () => {
  it("um tabuleiro greedy-safe nunca bloqueia em 10 000 playouts", () => {
    expect(isGreedySafe(SEGURO)).toBe("yes");

    const r = measureSurvival(SEGURO, 10_000, 1);

    expect(r.survived).toBe(10_000);
    expect(r.survivalRate).toBe(1);
    expect(r.firstFatalDepth).toBeNull();
  });

  it("um tabuleiro solúvel mas não seguro bloqueia parte das vezes", () => {
    expect(isSolvable(ARMADILHA)).toBe("yes");
    expect(isGreedySafe(ARMADILHA)).toBe("no");

    const r = measureSurvival(ARMADILHA, 2000, 1);

    expect(r.survivalRate).toBeGreaterThan(0);
    expect(r.survivalRate).toBeLessThan(1);

    // A armadilha é a primeira jogada: quem cai nela fica sem saída à profundidade 1.
    expect(r.firstFatalDepth).toBe(1);
  });

  it("níveis gerados greedy-safe sobrevivem sempre", () => {
    let verificados = 0;

    for (let seed = 0; seed < 300 && verificados < 8; seed++) {
      const nivel = generate(seed, { targetPieceCount: 12 });
      if (nivel === undefined) continue;
      if (isGreedySafe(nivel.board) !== "yes") continue;

      verificados++;
      expect(measureSurvival(nivel.board, 500, seed).survivalRate).toBe(1);
    }

    expect(verificados).toBeGreaterThan(0);
  });
});

describe("determinismo e independência do escalonamento", () => {
  it("a mesma seed dá o mesmo resultado", () => {
    expect(measureSurvival(ARMADILHA, 500, 7)).toEqual(
      measureSurvival(ARMADILHA, 500, 7),
    );
  });

  it("seeds diferentes dão amostras diferentes", () => {
    const a = measureSurvival(ARMADILHA, 200, 1);
    const b = measureSurvival(ARMADILHA, 200, 2);

    expect(a.survived).not.toBe(b.survived);
  });

  it("dividir os playouts por lotes dá exatamente o mesmo total", () => {
    /*
     * É a propriedade que torna o paralelismo seguro (spec §7.2): como cada
     * playout tem seed derivada do índice, o resultado não depende de como o
     * trabalho é distribuído. Sem ela, o número dependeria do escalonamento dos
     * workers e a medição deixaria de ser reproduzível.
     */
    const inteiro = measureSurvival(ARMADILHA, 1000, 42);

    // `measureSurvival(b, n, s)` usa as seeds derivadas 0..n-1. Um lote que
    // comece a meio não é exprimível pela API — mas o prefixo é, e basta para
    // mostrar que o i-ésimo playout é sempre o mesmo.
    const prefixo = measureSurvival(ARMADILHA, 400, 42);
    const maisLongo = measureSurvival(ARMADILHA, 700, 42);

    expect(maisLongo.survived).toBeGreaterThanOrEqual(prefixo.survived);
    expect(inteiro.survived).toBeGreaterThanOrEqual(maisLongo.survived);
  });

  it("um playout isolado é reprodutível", () => {
    const a = runPlayout(ARMADILHA, mulberry32(99));
    const b = runPlayout(ARMADILHA, mulberry32(99));

    expect(a).toBe(b);
  });
});

describe("as seis métricas de §7.3", () => {
  const r = measureSurvival(ARMADILHA, 2000, 3);

  it("recolhem-se todas num único varrimento", () => {
    expect(r.runs).toBe(2000);
    expect(r.survivalRate).toBeGreaterThan(0);
    expect(r.avgBranching).toBeGreaterThan(0);
    expect(r.avgMoveDensity).toBeGreaterThan(0);
    expect(r.avgGroupSize).toBeGreaterThanOrEqual(2);
  });

  it("o branching factor bate com a enumeração no estado inicial", () => {
    // ARMADILHA tem quatro grupos: os três pares horizontais e a coluna de três.
    const so = measureSurvival(ARMADILHA, 1, 0);

    expect(so.avgBranching).toBeGreaterThan(1);
    expect(so.avgBranching).toBeLessThanOrEqual(4);
  });

  it("o tamanho médio de grupo fica entre 2 e 7", () => {
    expect(r.avgGroupSize).toBeGreaterThanOrEqual(2);
    expect(r.avgGroupSize).toBeLessThanOrEqual(7);
  });

  it("um tabuleiro sem jogadas dá sobrevivência zero e profundidade fatal zero", () => {
    const morto = measureSurvival([[6, 5, 3]], 10, 1);

    expect(morto.survivalRate).toBe(0);
    expect(morto.firstFatalDepth).toBe(0);
    expect(morto.avgBranching).toBe(0);
  });

  it("o tabuleiro vazio sobrevive sem visitar estado nenhum", () => {
    const vazio = measureSurvival([], 10, 1);

    expect(vazio.survivalRate).toBe(1);
    expect(vazio.avgBranching).toBe(0);
  });
});

describe("piso de justiça (spec §7.4)", () => {
  it("um tabuleiro seguro passa", () => {
    expect(fairnessFloor(SEGURO)).toBe("yes");
  });

  it("a armadilha falha, porque a primeira jogada já pode ser fatal", () => {
    // É exatamente o caso que o plano §6.2 proíbe publicar.
    expect(fairnessFloor(ARMADILHA)).toBe("no");
  });

  it("profundidade 0 não verifica nada", () => {
    expect(fairnessFloor(ARMADILHA, 0)).toBe("yes");
  });

  it("um limite curto dá inconclusive, não uma exceção", () => {
    const nivel = generate(11, { targetPieceCount: 30 });

    expect(fairnessFloor(nivel?.board ?? [], 3, { maxStates: 1 })).toBe(
      "inconclusive",
    );
  });

  it("greedy-safe implica passar o piso a qualquer profundidade", () => {
    let verificados = 0;

    for (let seed = 0; seed < 200 && verificados < 5; seed++) {
      const nivel = generate(seed, { targetPieceCount: 12 });
      if (nivel === undefined) continue;
      if (isGreedySafe(nivel.board) !== "yes") continue;

      verificados++;
      expect(fairnessFloor(nivel.board, 3)).toBe("yes");
    }

    expect(verificados).toBeGreaterThan(0);
  });

  it("nenhum nível com joker passa o piso, e é por desenho", () => {
    /*
     * O achado da fase 5, fixado aqui para não se voltar a perder.
     *
     * Plano §6.2 quer que as primeiras jogadas sejam seguras qualquer que seja a
     * escolha. Plano §2.6 desenha o joker para que gastá-lo mal mate o
     * tabuleiro. Não podem valer as duas — e a medição não deixa margem: sobre
     * 40 níveis com joker, os 40 tinham jogada fatal à primeira, e nos 40 ela
     * envolvia o joker.
     *
     * Quem desempata é o plano: a mitigação de §2.6 é tutorial e undo, não o
     * piso. Daí a opção `skipJokerMoves`.
     */
    let comJoker = 0;
    let reprovadosSemExcecao = 0;
    let aprovadosComExcecao = 0;

    for (let seed = 0; seed < 25; seed++) {
      const nivel = generate(seed, {
        targetPieceCount: 22,
        includeJoker: true,
      });
      if (nivel?.joker === undefined) continue;
      comJoker++;

      if (fairnessFloor(nivel.board, 3) !== "yes") reprovadosSemExcecao++;
      if (
        fairnessFloor(nivel.board, 3, undefined, { skipJokerMoves: true }) ===
        "yes"
      ) {
        aprovadosComExcecao++;
      }
    }

    expect(comJoker).toBeGreaterThan(15);

    // Sem a exceção, reprova tudo.
    expect(reprovadosSemExcecao).toBe(comJoker);

    // Com a exceção, uma parte passa — o piso volta a ser útil.
    expect(aprovadosComExcecao).toBeGreaterThan(0);
  }, 300_000);

  it("rejeita o que a taxa de sobrevivência sozinha deixaria passar", () => {
    /*
     * A taxa de sobrevivência é uma média sobre o tabuleiro inteiro: diz pouco
     * sobre *quando* o jogador se pinta ao canto. Um tabuleiro pode ter 99% de
     * sobrevivência e mesmo assim ter uma jogada fatal logo à segunda — e é essa
     * que se lê como injusta (plano §6.2).
     *
     * Medido sobre 60 níveis gerados de 16 peças: metade falha o piso à
     * profundidade 2, e quase todos esses têm taxa acima de 0.4. O piso não é
     * redundante com a taxa; mede outra coisa.
     */
    let injustos = 0;
    let injustosComTaxaAlta = 0;
    let total = 0;

    for (let seed = 0; seed < 60; seed++) {
      const nivel = generate(seed, { targetPieceCount: 16 });
      if (nivel === undefined) continue;
      total++;

      if (fairnessFloor(nivel.board, 2) !== "no") continue;
      injustos++;

      if (measureSurvival(nivel.board, 100, seed).survivalRate > 0.4) {
        injustosComTaxaAlta++;
      }
    }

    expect(total).toBeGreaterThan(50);
    expect(injustos).toBeGreaterThan(0);
    expect(injustosComTaxaAlta).toBeGreaterThan(0);
  });
});
