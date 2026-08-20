/**
 * `transition()` — o mapa de cada peça durante uma jogada.
 *
 * O teste que interessa é um só, e é de equivalência: **aplicar o `transition`
 * às peças do tabuleiro tem de reproduzir exatamente `applyMove`**. Se algum dia
 * divergirem, a animação passa a mostrar uma coisa e o jogo a fazer outra — que
 * é a pior classe de defeito possível numa UI de puzzle.
 */

import { describe, expect, it } from "vitest";

import type { Board, Cell, Group, Packed } from "@septet/engine";
import {
  applyMove,
  boardKey,
  colOf,
  findAllGroups,
  generate,
  packed,
  rowOf,
} from "@septet/engine";

import { midpointOf, transition } from "../src/session/transition";

/**
 * Reconstrói o tabuleiro **só a partir do `transition`**, sem chamar `applyMove`.
 * É isto que torna a comparação uma prova e não uma tautologia.
 */
function reconstruir(board: Board, group: Group): Board {
  const t = transition(board, group);
  const removidas = new Set<Packed>(t.removed);

  const destino = new Map<Packed, Packed>();
  for (const m of t.moved) destino.set(m.from, m.to);

  const colunas = new Map<number, Map<number, Cell>>();

  for (let c = 0; c < board.length; c++) {
    const coluna = board[c];
    if (coluna === undefined) continue;

    for (let r = 0; r < coluna.length; r++) {
      const origem = packed(c, r);
      if (removidas.has(origem)) continue;

      const valor = coluna[r];
      if (valor === undefined) continue;

      const alvo = destino.get(origem) ?? origem;
      const nc = colOf(alvo);

      let celulas = colunas.get(nc);
      if (celulas === undefined) {
        celulas = new Map<number, Cell>();
        colunas.set(nc, celulas);
      }

      // Duas peças no mesmo destino seria um `transition` partido; o `Map`
      // esconderia a colisão, portanto acusa-se aqui.
      expect(celulas.has(rowOf(alvo))).toBe(false);
      celulas.set(rowOf(alvo), valor);
    }
  }

  const saida: Cell[][] = [];
  const indices = [...colunas.keys()].sort((a, b) => a - b);

  /*
   * As coordenadas de destino têm de formar um tabuleiro canónico: colunas
   * 0..n-1 sem buracos, e linhas 0..k-1 sem buracos dentro de cada coluna
   * (invariantes de §2.2).
   *
   * Sem esta verificação o teste ficava cego a uma classe inteira de defeitos —
   * ordenar os índices e mapeá-los para posições de array esconde qualquer
   * salto na numeração. Foi um teste de mutação que o expôs: partir o colapso de
   * colunas passava despercebido a 400 tabuleiros.
   */
  indices.forEach((c, i) => {
    expect(c).toBe(i);
  });

  for (const c of indices) {
    const celulas = colunas.get(c);
    if (celulas === undefined) continue;

    const linhas = [...celulas.keys()].sort((a, b) => a - b);
    linhas.forEach((r, i) => {
      expect(r).toBe(i);
    });

    saida.push(linhas.map((r) => celulas.get(r) as Cell));
  }

  return saida;
}

const grupo = (...ps: readonly Packed[]): Group =>
  [...ps].sort((a, b) => a - b) as Group;

describe("transition — exemplos legíveis", () => {
  it("um par no fundo de uma coluna: o que estava acima desce", () => {
    //  b: 5        a: 2
    //  a: 2  b: 5  →  (a0 e b0 saem? não — saem a1 e b0)
    const b: Board = [
      [3, 4],
      [4, 2],
    ];
    // a1 = 4 e b1 = 2 não somam 7. Usa-se a0=3 + b0=4 = 7, lado a lado na base.
    const t = transition(b, grupo(packed(0, 0), packed(1, 0)));

    expect(t.removed).toEqual([packed(0, 0), packed(1, 0)]);
    // As duas peças de cima descem uma linha, cada uma na sua coluna.
    expect(t.moved).toEqual([
      { from: packed(0, 1), to: packed(0, 0) },
      { from: packed(1, 1), to: packed(1, 0) },
    ]);
  });

  it("uma coluna inteira eliminada: as da direita deslizam", () => {
    const b: Board = [
      [3, 4],
      [1, 6],
      [2, 5],
    ];
    // A coluna a inteira: 3 + 4 = 7.
    const t = transition(b, grupo(packed(0, 0), packed(0, 1)));

    expect(t.moved).toEqual([
      { from: packed(1, 0), to: packed(0, 0) },
      { from: packed(1, 1), to: packed(0, 1) },
      { from: packed(2, 0), to: packed(1, 0) },
      { from: packed(2, 1), to: packed(1, 1) },
    ]);
  });

  it("quem não se mexe não aparece na lista", () => {
    const b: Board = [
      [1, 6],
      [2, 5],
    ];
    // A coluna b inteira sai; a coluna a fica exatamente onde estava.
    const t = transition(b, grupo(packed(1, 0), packed(1, 1)));

    expect(t.moved).toEqual([]);
  });

  it("o ponto intermédio é a coluna de origem com a linha de destino", () => {
    // É o estado depois da gravidade e antes do colapso — o que a animação
    // mostra no segundo tempo, e que não é representável como Board.
    const m = { from: packed(3, 5), to: packed(1, 2) };
    expect(midpointOf(m)).toBe(packed(3, 2));
  });
});

describe("transition — a equivalência com applyMove", () => {
  it("reproduz applyMove em tabuleiros escritos à mão", () => {
    const casos: ReadonlyArray<readonly [Board, Group]> = [
      // Grupo em L que esvazia o tabuleiro todo.
      [
        [[1, 2], [4]],
        grupo(packed(0, 0), packed(0, 1), packed(1, 0)),
      ],
      // Coluna inteira eliminada, com duas colunas a deslizar.
      [
        [[3, 4], [1, 6], [2, 5]],
        grupo(packed(0, 0), packed(0, 1)),
      ],
      // Buraco a meio de uma coluna: 3 + 4 saem das linhas 1 e 2, e a peça da
      // linha 3 cai duas linhas de uma vez.
      [
        [[5, 3, 4, 1], [3]],
        grupo(packed(0, 1), packed(0, 2)),
      ],
    ];

    for (const [b, g] of casos) {
      expect(boardKey(reconstruir(b, g))).toBe(boardKey(applyMove(b, g)));
    }
  });

  /*
   * A prova a sério: milhares de tabuleiros gerados, e **todos** os grupos
   * válidos de cada um. É o mesmo padrão do teste de ida-e-volta do gerador, que
   * é o teste mais valioso do projeto — pela mesma razão.
   */
  it("reproduz applyMove em todos os grupos de 400 tabuleiros gerados", () => {
    let tabuleiros = 0;
    let jogadas = 0;

    for (let seed = 0; seed < 400; seed++) {
      const gerado = generate(seed, { targetPieceCount: 16 });
      if (gerado === undefined) continue;

      tabuleiros++;
      const b = gerado.board;

      for (const g of findAllGroups(b)) {
        jogadas++;
        expect(boardKey(reconstruir(b, g))).toBe(boardKey(applyMove(b, g)));
      }
    }

    expect(tabuleiros).toBeGreaterThan(300);
    expect(jogadas).toBeGreaterThan(1000);
  }, 60_000);

  it("aguenta uma partida inteira, jogada a jogada", () => {
    // Um tabuleiro percorrido até ficar vazio: é onde aparecem os colapsos
    // múltiplos e as colunas que desaparecem já a meio da sequência.
    const gerado = generate(4242, { targetPieceCount: 28 });
    expect(gerado).toBeDefined();
    if (gerado === undefined) return;

    let b = gerado.board;
    let passos = 0;

    for (const g of gerado.solution) {
      expect(boardKey(reconstruir(b, g))).toBe(boardKey(applyMove(b, g)));
      b = applyMove(b, g);
      passos++;
    }

    expect(b).toEqual([]);
    expect(passos).toBeGreaterThan(2);
  });
});
