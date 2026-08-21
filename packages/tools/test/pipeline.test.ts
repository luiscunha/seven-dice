/**
 * Pipeline offline.
 *
 * O que se testa aqui não é a engine — é a promessa do pipeline: **nada é
 * publicado sem passar a ida-e-volta e o piso de justiça**, e a saída não depende
 * de quantos workers a produziram.
 */

import { describe, expect, it } from "vitest";

import { applyMove, isGreedySafe, isValidGroup, pieceCount } from "@septet/engine";

import { BANDS, bandById } from "../src/bands";
import { avaliar } from "../src/candidate";
import { avaliarEmParalelo } from "../src/pool";
import { construirBanda, passagensDe } from "../src/pipeline";

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
        "forma",
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

/*
 * O pré-filtro corta cedo, com uma amostra curta e a banda alargada, os
 * candidatos que a medição completa iria rejeitar por sobrevivência.
 *
 * A propriedade que tem de valer é uma só: **o que é aceite tem de ser aceite
 * exatamente igual**. O atalho pode perder candidatos — isso só custa procurar
 * mais uma seed — mas não pode mudar um nível nem uma métrica.
 */
describe("pré-filtro de sobrevivência", () => {
  it("não altera nenhum nível aceite, nem as suas métricas", () => {
    for (let seed = 0; seed < 60; seed++) {
      const sem = avaliar(seed, DENSO!, 200);
      const com = avaliar(seed, DENSO!, 200, 50);

      if (com.level !== undefined) {
        expect(com).toEqual(sem);
      }
    }
  }, 120_000);

  it("só descarta candidatos que a medição completa também descartaria", () => {
    /*
     * Não é uma garantia matemática — é ruído de amostragem, e a margem existe
     * para o tornar improvável, não impossível. O teste vigia a taxa: se um dia
     * passar a haver descartes falsos, a margem é curta de mais.
     */
    let falsos = 0;

    for (let seed = 0; seed < 60; seed++) {
      const sem = avaliar(seed, DENSO!, 200);
      const com = avaliar(seed, DENSO!, 200, 50);

      if (sem.level !== undefined && com.level === undefined) falsos++;
    }

    expect(falsos).toBe(0);
  }, 120_000);

  it("desligado, é indistinguível de não existir", () => {
    expect(avaliar(17, TUTORIAL!, 200, 0)).toEqual(avaliar(17, TUTORIAL!, 200));
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

/* ─── Formas cheias ─────────────────────────────────────────────────────────
 *
 * A promessa é: **metade dos níveis publicados são retângulos cheios**. Tem duas
 * metades a proteger, e nenhuma se vê a olho no pack.
 *
 * A primeira é que o perfil de silhueta é uma *preferência* do gerador, não uma
 * garantia — sem a rejeição por forma, "metade cheios" degenerava em "metade
 * tentados, quase todos recortados", e o pack passaria a parecer o antigo.
 *
 * A segunda é a quota. As formas têm custos muito diferentes — um `denso` 3×4
 * custa 12 candidatos e um `perito` 7×7 custa 150 — portanto misturar seeds e
 * deixar a proporção ao acaso dava um pack dominado pelas baratas, sem as caras.
 * É precisamente o 7×7 que se quer garantir.
 */

describe("formas cheias", () => {
  const soForma = (id: string, forma: readonly [number, number]) => {
    const b = bandById(id);
    if (b === undefined) throw new Error(`banda ${id} não existe`);
    return { ...b, formas: [forma] };
  };

  it("um nível aceite com forma pedida está mesmo cheio", () => {
    const banda = soForma("denso", [3, 4]);
    let aceites = 0;

    for (let seed = 1_000_000; seed < 1_000_120; seed++) {
      const a = avaliar(seed, banda, 100);
      if (a.level === undefined) continue;

      aceites++;
      expect(a.level.board).toHaveLength(3);
      for (const coluna of a.level.board) expect(coluna).toHaveLength(4);
      expect(pieceCount(a.level.board)).toBe(12);
    }

    expect(aceites).toBeGreaterThan(0);
  }, 60_000);

  it("os candidatos que saem recortados são rejeitados por forma", () => {
    const banda = soForma("denso", [3, 5]);
    let porForma = 0;

    for (let seed = 2_000_000; seed < 2_000_120; seed++) {
      if (avaliar(seed, banda, 100).rejeicao === "forma") porForma++;
    }

    // Medido: com perfil plano a 3 colunas, cerca de metade sai cheia. Se isto
    // chegar a zero, ou o gerador passou a garantir a forma — e então a
    // verificação é redundante — ou deixou de a tentar.
    expect(porForma).toBeGreaterThan(0);
  }, 60_000);

  it("uma banda sem formas continua a ter uma passagem só", () => {
    const tutorial = bandById("tutorial");
    if (tutorial === undefined) throw new Error("sem tutorial");

    const passagens = passagensDe(tutorial, 30);

    expect(passagens).toHaveLength(1);
    expect(passagens[0]?.alvo).toBe(30);
    expect(passagens[0]?.band.formas).toBeUndefined();
  });

  it("as quotas somam o alvo, e metade é cheia", () => {
    for (const band of BANDS) {
      const passagens = passagensDe(band, 30);
      const soma = passagens.reduce((n, p) => n + p.alvo, 0);

      expect(soma).toBe(30);

      if (band.formas === undefined) continue;

      const cheias = passagens.filter((p) => p.band.formas !== undefined);
      const pedidosCheios = cheias.reduce((n, p) => n + p.alvo, 0);

      expect(pedidosCheios).toBe(15);
      expect(cheias).toHaveLength(band.formas.length);

      // Cada forma leva a sua quota, e nenhuma fica de fora — é isto que garante
      // que o 7×7 do `perito` existe mesmo, sendo a forma mais cara do pack.
      for (const forma of band.formas) {
        expect(cheias.some((p) => p.band.formas?.[0] === forma)).toBe(true);
      }
    }
  });

  it("as passagens não colidem em seeds — a seed é a identidade do nível", () => {
    for (const band of BANDS) {
      const inicios = passagensDe(band, 30).map((p) => p.seedInicial);
      expect(new Set(inicios).size).toBe(inicios.length);
    }
  });
});
