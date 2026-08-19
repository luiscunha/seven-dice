/**
 * Ida-e-volta do gerador (spec §9.3).
 *
 * **É o teste mais valioso do projeto.** Toda a arquitetura existe para garantir
 * que nenhum nível publicado é impossível, e esta é a verificação empírica dessa
 * garantia: para cada tabuleiro gerado, aplicar a solução guardada passo a passo
 * e confirmar que termina vazio.
 *
 * Barato, e apanha qualquer erro na inversão de §6.3. Sem tolerância: uma única
 * falha significa níveis impossíveis em produção.
 */

import { describe, expect, it } from "vitest";

import type { Board, Group } from "../src/types";
import { checkInvariants, pieceCount, totalSum } from "../src/board";
import { isValidGroup } from "../src/groups";
import { applyMove } from "../src/moves";
import { generate } from "../src/generator";
import type { GeneratorParams } from "../src/generator";
import { COMPOSITIONS } from "../src/compositions";

/**
 * Aplica a solução passo a passo, verificando cada jogada em vez de confiar no
 * resultado final — se falhar, quer-se saber *em que passo*.
 */
function jogarSolucao(
  inicial: Board,
  solucao: readonly Group[],
): { final: Board; passos: number } {
  let b = inicial;
  let passos = 0;

  for (const g of solucao) {
    expect(isValidGroup(b, g)).toBe(true);
    b = applyMove(b, g);
    passos++;
  }

  return { final: b, passos };
}

/** Perfis variados, para o teste não se limitar a um canto do espaço. */
const PERFIS: readonly (readonly [string, GeneratorParams])[] = [
  ["pequeno", { targetPieceCount: 12 }],
  ["médio", { targetPieceCount: 24 }],
  ["grande", { targetPieceCount: 42 }],
  ["colunas altas", { targetPieceCount: 28, newColumnProbability: 0.1 }],
  ["colunas largas", { targetPieceCount: 28, newColumnProbability: 0.8 }],
  ["fundo enviesado", { targetPieceCount: 30, insertionDepthBias: 3 }],
  ["com joker", { targetPieceCount: 26, includeJoker: true }],
  [
    "só grupos grandes",
    {
      targetPieceCount: 30,
      compositionWeights: COMPOSITIONS.map((c) => (c.length >= 5 ? 1 : 0)),
    },
  ],
  [
    "só pares",
    {
      targetPieceCount: 20,
      compositionWeights: COMPOSITIONS.map((c) => (c.length === 2 ? 1 : 0)),
    },
  ],
  [
    "pirâmide",
    { targetPieceCount: 20, silhouetteProfile: [2, 4, 6, 4, 2] },
  ],
];

describe("ida-e-volta — a garantia central", () => {
  it.each(PERFIS)("%s: 200 níveis resolvem-se pela solução guardada", (_nome, params) => {
    for (let seed = 0; seed < 200; seed++) {
      const nivel = generate(seed, params);
      expect(nivel).toBeDefined();
      if (nivel === undefined) return;

      const { final, passos } = jogarSolucao(nivel.board, nivel.solution);

      expect(final).toEqual([]);
      expect(passos).toBe(nivel.solution.length);
    }
  });
});

describe("invariantes de qualquer nível gerado", () => {
  const params: GeneratorParams = { targetPieceCount: 30, includeJoker: true };

  it("2000 níveis: soma múltipla de 7, contagem exata, invariantes de §2.2", () => {
    for (let seed = 0; seed < 2000; seed++) {
      const nivel = generate(seed, params);
      expect(nivel).toBeDefined();
      if (nivel === undefined) return;

      // Condição necessária para haver solução (plano §4.1). Com joker, a soma
      // das fixas mais o valor verdadeiro é que é múltipla de 7.
      const soma = totalSum(nivel.board) + (nivel.joker?.trueValue ?? 0);
      expect(soma % 7).toBe(0);

      expect(pieceCount(nivel.board)).toBe(params.targetPieceCount);
      expect(checkInvariants(nivel.board)).toEqual([]);

      // Cada jogada retira exatamente 7.
      expect(nivel.solution.length).toBe(soma / 7);
    }
  });
});

describe("determinismo", () => {
  it("a mesma seed dá o mesmo nível", () => {
    const params: GeneratorParams = { targetPieceCount: 24, includeJoker: true };

    for (const seed of [0, 1, 7, 12345, 999999]) {
      expect(generate(seed, params)).toEqual(generate(seed, params));
    }
  });

  it("seeds diferentes dão níveis diferentes", () => {
    const params: GeneratorParams = { targetPieceCount: 24 };
    const chaves = new Set<string>();

    for (let seed = 0; seed < 100; seed++) {
      chaves.add(JSON.stringify(generate(seed, params)?.board));
    }

    // Alguma colisão é aceitável; um gerador colado numa saída só não é.
    expect(chaves.size).toBeGreaterThan(90);
  });

  it("os parâmetros não vazam entre chamadas", () => {
    const a = generate(42, { targetPieceCount: 20 });
    generate(7, { targetPieceCount: 40, insertionDepthBias: 5 });
    const b = generate(42, { targetPieceCount: 20 });

    expect(a).toEqual(b);
  });
});

describe("joker (spec §6.4)", () => {
  const params: GeneratorParams = { targetPieceCount: 26, includeJoker: true };

  it("no máximo um, e o valor verdadeiro fecha a aritmética", () => {
    let comJoker = 0;

    for (let seed = 0; seed < 200; seed++) {
      const nivel = generate(seed, params);
      if (nivel?.joker === undefined) continue;
      comJoker++;

      const [c, r] = nivel.joker.at;
      expect(nivel.board[c]?.[r]).toBe(0);

      // A propriedade de plano §2.6 confirma-se sozinha: soma das fixas mais o
      // valor verdadeiro é múltiplo de 7, por construção.
      expect((totalSum(nivel.board) + nivel.joker.trueValue) % 7).toBe(0);
      expect(nivel.joker.trueValue).toBeGreaterThanOrEqual(1);
      expect(nivel.joker.trueValue).toBeLessThanOrEqual(6);

      // Exatamente um zero no tabuleiro.
      const zeros = nivel.board.flat().filter((v) => v === 0).length;
      expect(zeros).toBe(1);
    }

    expect(comJoker).toBeGreaterThan(150);
  });

  it("sem includeJoker não aparece nenhum", () => {
    for (let seed = 0; seed < 200; seed++) {
      const nivel = generate(seed, { targetPieceCount: 26 });

      expect(nivel?.joker).toBeUndefined();
      expect(nivel?.board.flat().includes(0)).toBe(false);
    }
  });
});

describe("parâmetros", () => {
  it("targetPieceCount é exato, não aproximado", () => {
    for (const alvo of [2, 3, 5, 8, 13, 21, 34, 50]) {
      const nivel = generate(alvo * 7, { targetPieceCount: alvo });

      expect(pieceCount(nivel?.board ?? [])).toBe(alvo);
    }
  });

  it("newColumnProbability desloca largura contra altura", () => {
    const largura = (p: number): number => {
      let total = 0;
      for (let seed = 0; seed < 60; seed++) {
        total += generate(seed, {
          targetPieceCount: 30,
          newColumnProbability: p,
        })?.board.length ?? 0;
      }
      return total / 60;
    };

    expect(largura(0.8)).toBeGreaterThan(largura(0.1));
  });

  it("compositionWeights a zero excluem mesmo a composição", () => {
    // Só pares: nenhuma jogada da solução pode ter mais de duas peças.
    const nivel = generate(3, {
      targetPieceCount: 20,
      compositionWeights: COMPOSITIONS.map((c) => (c.length === 2 ? 1 : 0)),
    });

    for (const g of nivel?.solution ?? []) expect(g).toHaveLength(2);
  });

  it("silhouetteProfile aproxima o tabuleiro do perfil pedido", () => {
    const perfil = [2, 4, 6, 4, 2];

    const desvio = (usarPerfil: boolean): number => {
      let total = 0;
      let n = 0;

      for (let seed = 0; seed < 60; seed++) {
        const nivel = generate(
          seed,
          usarPerfil
            ? { targetPieceCount: 18, silhouetteProfile: perfil }
            : { targetPieceCount: 18 },
        );
        if (nivel === undefined) continue;

        for (let c = 0; c < perfil.length; c++) {
          total += Math.abs((nivel.board[c]?.length ?? 0) - (perfil[c] as number));
        }
        n++;
      }

      return total / n;
    };

    // É uma preferência, não uma garantia — basta que aproxime.
    expect(desvio(true)).toBeLessThan(desvio(false));
  });

  it("um alvo impossível devolve undefined em vez de pender", () => {
    expect(generate(1, { targetPieceCount: 1 })).toBeUndefined();
    expect(generate(1, { targetPieceCount: 0 })).toBeUndefined();
  });

  it("pesos todos a zero desistem sem lançar", () => {
    expect(() =>
      generate(1, {
        targetPieceCount: 20,
        compositionWeights: COMPOSITIONS.map(() => 0),
      }),
    ).not.toThrow();
  });
});
