/**
 * Pipeline offline.
 *
 * O que se testa aqui não é a engine — é a promessa do pipeline: **nada é
 * publicado sem passar a ida-e-volta e o piso de justiça**, e a saída não depende
 * de quantos workers a produziram.
 */

import { describe, expect, it } from "vitest";

import { applyMove, isGreedySafe, isValidGroup, pieceCount } from "@sete/engine";

import { BANDS, bandById } from "../src/bands";
import { avaliar } from "../src/candidate";
import { avaliarEmParalelo } from "../src/pool";
import { construirBanda } from "../src/pipeline";

const TUTORIAL = bandById("tutorial");
const DENSO = bandById("denso");

describe("bandas", () => {
  it("estão todas bem formadas", () => {
    for (const b of BANDS) {
      const [min, max] = b.accept.survival;

      expect(min).toBeLessThanOrEqual(max);
      expect(b.pieces[0]).toBeLessThanOrEqual(b.pieces[1]);
      expect(b.pieces[0]).toBeGreaterThanOrEqual(2);
    }
  });

  it("os corpora dos dois modos são opostos (plano §6.1)", () => {
    const tempo = bandById("tempo");
    const avancado = bandById("avancado");

    // O modo tempo exige que seja impossível bloquear...
    expect(tempo?.accept.requireGreedySafe).toBe(true);
    expect(tempo?.accept.survival).toEqual([1, 1]);

    // ...e o modo puzzle quer exatamente o contrário.
    expect(avancado?.accept.requireGreedySafe).toBeUndefined();
    expect(avancado?.accept.survival[1]).toBeLessThan(1);
  });

  it("o modo tempo não pede joker", () => {
    expect(bandById("tempo")?.params.includeJoker).toBeUndefined();
  });
});

describe("avaliação de um candidato", () => {
  it("um nível aceite traz métricas completas e solução válida", () => {
    let aceite;

    for (let seed = 0; seed < 200 && aceite === undefined; seed++) {
      const a = avaliar(seed, TUTORIAL!, 200);
      if (a.level !== undefined) aceite = a.level;
    }

    expect(aceite).toBeDefined();
    if (aceite === undefined) return;

    expect(aceite.band).toBe("tutorial");
    expect(aceite.metrics?.pieces).toBe(pieceCount(aceite.board));
    expect(aceite.metrics?.solutionLength).toBe(aceite.solution.length);

    let b = aceite.board;
    for (const g of aceite.solution) {
      expect(isValidGroup(b, g)).toBe(true);
      b = applyMove(b, g);
    }
    expect(b).toEqual([]);
  });

  it("a banda do tutorial só aceita tabuleiros provadamente sem becos", () => {
    // A taxa de 100% numa amostra não prova nada; é `isGreedySafe` que prova.
    let verificados = 0;

    for (let seed = 0; seed < 150 && verificados < 5; seed++) {
      const a = avaliar(seed, TUTORIAL!, 200);
      if (a.level === undefined) continue;

      verificados++;
      expect(isGreedySafe(a.level.board)).toBe("yes");
    }

    expect(verificados).toBeGreaterThan(0);
  });

  it("as rejeições são registadas com a razão", () => {
    const razoes = new Set<string>();

    for (let seed = 0; seed < 60; seed++) {
      const a = avaliar(seed, DENSO!, 100);
      if (a.rejeicao !== undefined) razoes.add(a.rejeicao);
    }

    // A banda densa é estreita: alguma coisa tem de ser rejeitada, e por razão
    // conhecida.
    expect(razoes.size).toBeGreaterThan(0);
    for (const r of razoes) {
      expect([
        "geracao",
        "ida-e-volta",
        "sobrevivencia",
        "greedy-safe",
        "piso-de-justica",
      ]).toContain(r);
    }
  }, 60_000);

  it("nenhum candidato é alguma vez rejeitado por ida-e-volta", () => {
    // Se isto alguma vez falhar, o gerador partiu-se e a garantia central caiu.
    for (let seed = 0; seed < 300; seed++) {
      expect(avaliar(seed, DENSO!, 50).rejeicao).not.toBe("ida-e-volta");
    }
  }, 120_000);

  it("é determinístico", () => {
    expect(avaliar(17, TUTORIAL!, 200)).toEqual(avaliar(17, TUTORIAL!, 200));
  });
});

describe("paralelismo (spec §7.2)", () => {
  it("o resultado não depende do número de workers", async () => {
    /*
     * É a propriedade que torna o pipeline reproduzível. Cada seed é
     * independente e cada playout tem seed derivada do índice; o pool só tem de
     * reordenar por seed antes de devolver.
     */
    const seeds = Array.from({ length: 48 }, (_, i) => i);

    const [umWorker, muitos] = await Promise.all([
      avaliarEmParalelo({ seeds, band: TUTORIAL!, runs: 200, workers: 1 }),
      avaliarEmParalelo({ seeds, band: TUTORIAL!, runs: 200, workers: 4 }),
    ]);

    expect(muitos).toEqual(umWorker);
  }, 120_000);
});

describe("construção de uma banda", () => {
  it("devolve o número pedido e contabiliza as rejeições", async () => {
    const r = await construirBanda({
      band: TUTORIAL!,
      alvo: 6,
      runs: 200,
      workers: 1,
      loteInicial: 32,
    });

    expect(r.levels).toHaveLength(6);
    expect(r.avaliados).toBeGreaterThanOrEqual(6);
    expect(r.taxas.length).toBeGreaterThan(0);

    // Os ids são únicos e trazem a banda.
    const ids = new Set(r.levels.map((l) => l.id));
    expect(ids.size).toBe(r.levels.length);
    for (const l of r.levels) expect(l.id.startsWith("tutorial-")).toBe(true);
  }, 120_000);

  it("desiste em vez de pender quando a banda é inalcançável", async () => {
    const impossivel = {
      ...TUTORIAL!,
      accept: { ...TUTORIAL!.accept, survival: [0.5, 0.5] as const },
    };

    const r = await construirBanda({
      band: impossivel,
      alvo: 5,
      runs: 100,
      workers: 1,
      loteInicial: 16,
      maxCandidatos: 64,
    });

    expect(r.levels.length).toBeLessThan(5);
    expect(r.avaliados).toBeLessThanOrEqual(128);
  }, 120_000);
});
