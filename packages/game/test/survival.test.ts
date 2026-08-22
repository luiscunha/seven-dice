/**
 * Modo Survival.
 *
 * Três coisas para proteger, e nenhuma é a aritmética da pontuação:
 *
 * 1. **A fila que se vê é a que se recebe.** Sem isto a previsão é decoração, e
 *    a previsão é a razão de ser do modo.
 * 2. **A mesma seed dá a mesma corrida.** Sem isto não há pontuação comparável.
 * 3. **A largura repõe-se.** Sem isto limpar uma coluna estreita o tabuleiro
 *    para sempre e jogar bem passa a ser um erro.
 */

import { describe, expect, it } from "vitest";

import {
  boardKey,
  findAllGroups,
  pieceCount,
  tallestColumn,
  totalSum,
  width,
} from "@dicetoseven/engine";

import {
  DEFAULT_SURVIVAL,
  cadencia,
  filaVisivel,
  injectRow,
  linhaDe,
  multiplicadorAoPuxar,
  puxarLinha,
  restoParaLimpar,
  startSurvival,
  survivalTap,
} from "../src/session/SurvivalSession";
import type { SurvivalState } from "../src/session/SurvivalSession";

const SEED = 20260822;

describe("a fila", () => {
  it("é determinística na seed e no índice", () => {
    expect(linhaDe(SEED, 0)).toEqual(linhaDe(SEED, 0));
    expect(linhaDe(SEED, 0)).not.toEqual(linhaDe(SEED, 1));
    expect(linhaDe(SEED, 0)).not.toEqual(linhaDe(SEED + 1, 0));
  });

  it("tem a largura configurada e só faces jogáveis", () => {
    const linha = linhaDe(SEED, 3);
    expect(linha).toHaveLength(DEFAULT_SURVIVAL.largura);
    for (const v of linha) expect(v).toBeGreaterThanOrEqual(1);
    for (const v of linha) expect(v).toBeLessThanOrEqual(6);
  });

  it("**a linha que se vê é a que entra** — a promessa do modo", () => {
    const s = startSurvival(SEED);
    const [primeira, segunda] = filaVisivel(s);

    const depois = injectRow(s, false);
    // O topo de cada coluna passou a ser exatamente a linha que estava à frente.
    const topos = depois.game.board.map((col) => col[col.length - 1]);
    expect(topos).toEqual([...(primeira ?? [])]);

    // E a que era a segunda passou a ser a primeira.
    expect(filaVisivel(depois)[0]).toEqual(segunda);
  });

  it("o tabuleiro não muda o que está na fila", () => {
    const s = startSurvival(SEED);
    const antes = filaVisivel(s);

    // Jogar não pode reescrever o futuro que já foi mostrado.
    let depois: SurvivalState = s;
    for (const p of [0, 64, 128]) depois = survivalTap(depois, p).state;

    expect(filaVisivel(depois)).toEqual(antes);
  });
});

describe("o arranque", () => {
  it("a mesma seed dá a mesma corrida", () => {
    expect(boardKey(startSurvival(SEED).game.board)).toBe(
      boardKey(startSurvival(SEED).game.board),
    );
    expect(boardKey(startSurvival(SEED).game.board)).not.toBe(
      boardKey(startSurvival(SEED + 1).game.board),
    );
  });

  it("começa com folga e sem joker", () => {
    const s = startSurvival(SEED);
    expect(tallestColumn(s.game.board)).toBe(DEFAULT_SURVIVAL.alturaInicial);
    expect(width(s.game.board)).toBe(DEFAULT_SURVIVAL.largura);
    expect(s.game.board.flat()).not.toContain(0);
    expect(s.morto).toBe(false);
  });
});

describe("a injeção", () => {
  it("empilha por cima e sobe a coluna mais alta", () => {
    const s = startSurvival(SEED);
    const depois = injectRow(s, false);

    expect(tallestColumn(depois.game.board)).toBe(
      tallestColumn(s.game.board) + 1,
    );
    expect(pieceCount(depois.game.board)).toBe(
      pieceCount(s.game.board) + DEFAULT_SURVIVAL.largura,
    );
  });

  it("**repõe a largura** depois de o colapso a ter encolhido", () => {
    /*
     * O caso que impede a espiral de morte. Um tabuleiro estreito recebe a linha
     * à largura cheia e volta ao normal — as peças sobre o vazio caem à base.
     */
    const s: SurvivalState = { ...startSurvival(SEED), linhasInjetadas: 0 };
    const estreito: SurvivalState = {
      ...s,
      game: { ...s.game, board: [[3]] },
    };

    expect(width(estreito.game.board)).toBe(1);
    const depois = injectRow(estreito, false);
    expect(width(depois.game.board)).toBe(DEFAULT_SURVIVAL.largura);

    // As colunas novas têm uma célula só: caíram até à base.
    expect(depois.game.board.slice(1).every((col) => col.length === 1)).toBe(true);
  });

  it("passar do teto é morrer", () => {
    let s = startSurvival(SEED);
    for (let i = 0; i < 20 && !s.morto; i++) s = injectRow(s, false);

    expect(s.morto).toBe(true);
    expect(tallestColumn(s.game.board)).toBeGreaterThan(
      DEFAULT_SURVIVAL.alturaMaxima,
    );
  });

  it("depois de morto nada mais conta", () => {
    let s = startSurvival(SEED);
    for (let i = 0; i < 20 && !s.morto; i++) s = injectRow(s, false);

    const congelado = injectRow(s, true);
    expect(congelado).toBe(s);
    expect(survivalTap(s, 0).moved).toBe(false);
  });
});

describe("puxar a linha", () => {
  it("dá multiplicador e não pontos — a automática não dá nada", () => {
    /*
     * A forma do prémio é o que aqui interessa. Um prémio fixo foi medido e é
     * uma armadilha: puxar custa espaço, o espaço gera todos os pontos futuros,
     * e nenhuma soma fixa compete com um valor que compõe.
     */
    const s = startSurvival(SEED);

    const puxada = puxarLinha(s);
    expect(puxada.score).toBe(s.score);
    expect(puxada.multiplicador).toBeGreaterThan(1);
    expect(puxada.jogadasComBonus).toBe(DEFAULT_SURVIVAL.jogadasComBonus);

    const automatica = injectRow(s, false);
    expect(automatica.multiplicador).toBe(1);
    expect(automatica.jogadasComBonus).toBe(0);
  });

  it("vale mais com folga — é o prémio a ensinar a estratégia", () => {
    let s = startSurvival(SEED);
    const cedo = multiplicadorAoPuxar(s);

    for (let i = 0; i < 3; i++) s = injectRow(s, false);
    expect(multiplicadorAoPuxar(s)).toBeLessThan(cedo);
  });

  it("o multiplicador aplica-se às jogadas seguintes e expira", () => {
    const base: SurvivalState = { ...startSurvival(SEED), jogadasComBonus: 0, multiplicador: 1 };
    const comBonus: SurvivalState = { ...base, multiplicador: 2, jogadasComBonus: 1 };

    // O mesmo toque, com e sem multiplicador em vigor.
    const grupo = [...findAllGroups(base.game.board)][0];
    expect(grupo).toBeDefined();

    const jogar = (s: SurvivalState): SurvivalState => {
      for (const p of grupo ?? []) s = survivalTap(s, p).state;
      return s;
    };

    const semGanho = jogar(base).score;
    const comGanho = jogar(comBonus).score;

    expect(comGanho).toBe(semGanho * 2);
    // E expira: uma jogada só é o que ele durava.
    expect(jogar(comBonus).jogadasComBonus).toBe(0);
    expect(jogar(comBonus).multiplicador).toBe(1);
  });

  it("reinicia o contador da automática", () => {
    let s = startSurvival(SEED);
    s = { ...s, jogadasDesdeLinha: 4 };
    expect(puxarLinha(s).jogadasDesdeLinha).toBe(0);
  });
});

describe("a cadência", () => {
  it("aperta com a corrida, até ao piso", () => {
    const em = (linhas: number): number =>
      cadencia({ ...startSurvival(SEED), linhasInjetadas: linhas });

    expect(em(0)).toBe(DEFAULT_SURVIVAL.jogadasPorLinha);
    expect(em(DEFAULT_SURVIVAL.linhasPorDegrau)).toBe(
      DEFAULT_SURVIVAL.jogadasPorLinha - 1,
    );
    expect(em(500)).toBe(DEFAULT_SURVIVAL.minJogadasPorLinha);
  });
});

describe("o resto para limpar", () => {
  it("é a condição necessária para o tabuleiro poder esvaziar", () => {
    const s = startSurvival(SEED);
    expect(restoParaLimpar(s)).toBe(totalSum(s.game.board) % 7);

    // Uma jogada tira exatamente 7, portanto o resto nunca muda por jogar.
    const board = [[1, 2], [4]] as const;
    const fixo: SurvivalState = { ...s, game: { ...s.game, board } };
    expect(restoParaLimpar(fixo)).toBe(0);
  });
});
