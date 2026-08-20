/**
 * Renderer de consola e sessão de jogo.
 *
 * A parte pura é testável a sério; o ciclo interativo é conduzido por um guião
 * de texto, que é a razão de a sessão não ter I/O nenhum.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Board, Level } from "@sete/engine";
import { escreverGrupo } from "../src/render";
import {
  desenharTabuleiro,
  descreverSelecao,
  lerCoordenada,
} from "../src/render";
import {
  desfazer,
  dica,
  eliminar,
  iniciar,
  reiniciar,
  selecaoPendente,
  selo,
  terminado,
  tocar,
  valorDoJoker,
} from "../src/session";
import { avaliar } from "../src/candidate";
import { bandById } from "../src/bands";
import { packed } from "@sete/engine";

const TABULEIRO: Board = [
  [1, 2],
  [4],
  [3, 4],
];

const nivel = (board: Board, solution: readonly number[][] = []): Level => ({
  id: "teste-000000",
  seed: 0,
  board,
  solution: solution as never,
});

describe("coordenadas", () => {
  it("lêem-se e escrevem-se com as coordenadas do motor", () => {
    // Coluna por letra, linha a partir da **base** — as mesmas de [E 2.2].
    // Uma numeração "amiga" contaminaria o que esta fase mede.
    expect(lerCoordenada("a0")).toBe(packed(0, 0));
    expect(lerCoordenada("c3")).toBe(packed(2, 3));
    expect(lerCoordenada("A1")).toBe(packed(26, 1));
  });

  it("recusam entrada que não seja coordenada", () => {
    for (const t of ["", "a", "0", "aa1", "a999", "!"]) {
      expect(lerCoordenada(t)).toBeUndefined();
    }
  });

  it("um grupo escreve-se em coordenadas legíveis", () => {
    expect(escreverGrupo([packed(0, 0), packed(0, 1), packed(1, 0)])).toBe(
      "a0 a1 b0",
    );
  });
});

describe("desenho", () => {
  it("a silhueta vê-se: as colunas curtas ficam em branco", () => {
    const texto = desenharTabuleiro(TABULEIRO);
    const linhas = texto.split("\n");

    // Linha 1 tem peças em a e c, mas não em b — que é mais baixa.
    const linha1 = linhas.find((l) => l.trimStart().startsWith("1 │"));
    expect(linha1).toBeDefined();
    expect(linha1).toContain("2");
    expect(linha1).toContain("4");
  });

  it("marca a seleção sem desalinhar as colunas", () => {
    const semSelecao = desenharTabuleiro(TABULEIRO);
    const comSelecao = desenharTabuleiro(TABULEIRO, {
      selecao: new Set([packed(0, 0)]),
    });

    expect(comSelecao).toContain("[1]");

    const largura = (t: string): number[] =>
      t.split("\n").map((l) => l.length);
    expect(largura(comSelecao)).toEqual(largura(semSelecao));
  });

  it("o estado intermédio desenha-se com buracos", () => {
    // Esse estado não é representável como Board — teria buracos a meio de uma
    // coluna, que as invariantes de [E 2.2] tornam impossíveis. Vive só aqui.
    const texto = desenharTabuleiro(TABULEIRO, {
      removidas: new Set([packed(0, 0)]),
    });

    expect(texto).toContain("·");
  });

  it("o tabuleiro vazio diz que está vazio", () => {
    expect(desenharTabuleiro([])).toContain("vazio");
  });

  it("a soma corrente é visível, como o plano §3.1 exige", () => {
    expect(descreverSelecao(TABULEIRO, [packed(0, 0), packed(0, 1)])).toContain(
      "3",
    );
    expect(descreverSelecao(TABULEIRO, [])).toContain("vazia");
  });

  it("o joker mostra-se como * e não conta para a soma", () => {
    const b: Board = [[0], [3]];
    expect(desenharTabuleiro(b)).toContain("*");
    expect(descreverSelecao(b, [packed(0, 0), packed(1, 0)])).toContain(
      "(+ joker)",
    );
  });
});

describe("seleção tocar-a-acumular", () => {
  it("elimina automaticamente ao formar um grupo válido", () => {
    let s = iniciar(nivel(TABULEIRO));

    s = tocar(s, packed(0, 0)); // 1
    expect(s.jogadas).toBe(0);

    s = tocar(s, packed(0, 1)); // +2
    expect(s.jogadas).toBe(0);

    s = tocar(s, packed(1, 0)); // +4 = 7, em L
    expect(s.jogadas).toBe(1);
    expect(s.selecao).toEqual([]);
  });

  it("tocar outra vez tira a peça da seleção", () => {
    let s = iniciar(nivel(TABULEIRO));

    s = tocar(s, packed(0, 0));
    s = tocar(s, packed(0, 0));

    expect(s.selecao).toEqual([]);
  });

  it("recusa a peça que faria passar de 7, em vez de atolar a seleção", () => {
    // O problema que o primeiro teste manual desta ferramenta expôs: aceitar a
    // peça deixava o jogador num estado morto que só se desfazia à mão.
    let s = iniciar(nivel([[4, 5]]));

    s = tocar(s, packed(0, 0)); // 4
    s = tocar(s, packed(0, 1)); // +5 = 9

    expect(s.selecao).toHaveLength(1);
    expect(s.mensagem).toContain("9");
  });

  it("com joker o teto das fixas é 6, e diz-se porquê", () => {
    let s = iniciar(nivel([[0, 1, 6], [1]]));

    s = tocar(s, packed(0, 0)); // joker
    s = tocar(s, packed(0, 1)); // +1 → fixas 1
    s = tocar(s, packed(0, 2)); // +6 → fixas 7, acima do teto de 6

    expect(s.selecao).toHaveLength(2);
    expect(s.mensagem).toContain("6");
  });

  /*
   * O joker não dispara sozinho — encontrado a jogar `meio-joker-000013`.
   *
   * Como `isValidGroup` aceita qualquer soma fixa entre 1 e 6, a eliminação
   * automática gastava o joker com a primeira peça que lhe encostasse, ao valor
   * que essa peça deixasse. O valor dele está globalmente determinado (plano
   * §2.6), portanto isso não é uma jogada alternativa: é matar o tabuleiro.
   */
  describe("seleção com joker (plano §2.6)", () => {
    it("fica pendente em vez de eliminar, e avisa que o valor está errado", () => {
      let s = iniciar(nivel([[0, 2], [2]]));

      s = tocar(s, packed(0, 0)); // joker
      s = tocar(s, packed(0, 1)); // +2 → fixas 2, já seria grupo válido

      expect(s.jogadas).toBe(0);
      expect(s.selecao).toHaveLength(2);
      expect(s.mensagem).toContain("5"); // 7 − 2, o que o joker tomaria
      expect(s.mensagem).toContain("tem de valer 3");
      expect(selecaoPendente(s)).toBe(true);
    });

    it("no valor obrigatório, a mensagem confirma em vez de sugerir mais peças", () => {
      let s = iniciar(nivel([[0, 2], [2]]));

      s = tocar(s, packed(0, 0)); // joker
      s = tocar(s, packed(0, 1)); // +2
      s = tocar(s, packed(1, 0)); // +2 → fixas 4, joker a 3

      expect(s.jogadas).toBe(0);
      expect(s.selecao).toHaveLength(3);
      expect(s.mensagem).toContain("valor certo");
      // O conselho que empurrava para o erro não pode reaparecer aqui.
      expect(s.mensagem).not.toContain("junta");
    });

    it("`x` elimina a seleção pendente", () => {
      let s = iniciar(nivel([[0, 2], [2]]));

      s = tocar(s, packed(0, 0));
      s = tocar(s, packed(0, 1));
      s = tocar(s, packed(1, 0));
      s = eliminar(s);

      expect(s.jogadas).toBe(1);
      expect(s.selecao).toEqual([]);
      expect(terminado(s)).toBe(true); // as três peças eram o tabuleiro todo
    });

    it("`x` recusa uma seleção que ainda não faz grupo", () => {
      let s = iniciar(nivel([[0, 2], [2]]));

      s = tocar(s, packed(0, 0)); // só o joker — nunca forma grupo sozinho
      s = eliminar(s);

      expect(s.jogadas).toBe(0);
      expect(s.mensagem).toContain("ainda não");
    });

    it("sem joker o disparo automático mantém-se", () => {
      let s = iniciar(nivel(TABULEIRO));

      s = tocar(s, packed(0, 0));
      s = tocar(s, packed(0, 1));
      s = tocar(s, packed(1, 0));

      expect(s.jogadas).toBe(1);
      expect(selecaoPendente(s)).toBe(false);
    });
  });

  /*
   * A conta do plano §2.6, que o playtest da fase 6 mostrou não ser descoberta a
   * jogar: soma das fixas + joker ≡ 0 (mod 7), com o joker entre 1 e 6.
   */
  describe("valor obrigatório do joker", () => {
    it("é o que fecha o total em múltiplo de 7", () => {
      expect(valorDoJoker([[0, 2], [2]])).toBe(3); // fixas 4 → 7 − 4
      expect(valorDoJoker([[0, 6], [1], [2]])).toBe(5); // fixas 9 → 7 − 2
    });

    it("não existe sem joker no tabuleiro", () => {
      expect(valorDoJoker([[1, 2], [4]])).toBeUndefined();
    });

    it("não existe quando as fixas já são múltiplas de 7 — nada fecha", () => {
      expect(valorDoJoker([[0, 3], [4]])).toBeUndefined();
    });

    it("não muda com as jogadas, porque cada uma tira exatamente 7", () => {
      // fixas 2+2+3+4+5 = 16 → 16 mod 7 = 2 → o joker vale 5
      const b: Board = [
        [0, 2],
        [2, 3],
        [4, 5],
      ];
      let s = iniciar(nivel(b));
      expect(valorDoJoker(s.board)).toBe(5);

      s = tocar(s, packed(0, 1)); // 2
      s = tocar(s, packed(1, 1)); // +3
      s = tocar(s, packed(1, 0)); // +2 = 7, em L e sem joker → dispara

      expect(s.jogadas).toBe(1);
      expect(valorDoJoker(s.board)).toBe(5);
    });
  });

  it("explica quando a soma é 7 mas as peças não estão ligadas", () => {
    const b: Board = [[1, 6], [1]];
    let s = iniciar(nivel(b));

    s = tocar(s, packed(0, 1)); // o 6 no topo
    s = tocar(s, packed(1, 0)); // o 1 na coluna baixa — sem adjacência lateral

    expect(s.jogadas).toBe(0);
    expect(s.mensagem).toContain("ligadas");
  });

  it("não deixa tocar onde não há peça", () => {
    const s = tocar(iniciar(nivel(TABULEIRO)), packed(1, 5));

    expect(s.mensagem).toContain("não há peça");
  });
});

describe("undo, reinício e selos (plano §3.3, §6.2)", () => {
  it("desfazer tira primeiro a peça, depois a jogada", () => {
    let s = iniciar(nivel(TABULEIRO));

    s = tocar(s, packed(0, 0));
    s = desfazer(s);
    expect(s.selecao).toEqual([]);
    expect(s.undos).toBe(0); // desfazer uma seleção não é um undo de jogada

    s = tocar(s, packed(0, 0));
    s = tocar(s, packed(0, 1));
    s = tocar(s, packed(1, 0)); // jogada
    expect(s.jogadas).toBe(1);

    s = desfazer(s);
    expect(s.jogadas).toBe(0);
    expect(s.undos).toBe(1);
    expect(s.board).toEqual(TABULEIRO);
  });

  it("o undo é ilimitado — é só uma pilha de tabuleiros imutáveis", () => {
    let s = iniciar(nivel(TABULEIRO));

    s = tocar(s, packed(0, 0));
    s = tocar(s, packed(0, 1));
    s = tocar(s, packed(1, 0));
    s = tocar(s, packed(1, 0)); // 3+4 na coluna que sobrou
    s = tocar(s, packed(1, 1));

    const jogadas = s.jogadas;
    for (let i = 0; i < jogadas; i++) s = desfazer(s);

    expect(s.board).toEqual(TABULEIRO);
    expect(desfazer(s).mensagem).toContain("nada a desfazer");
  });

  it("o selo perfeito perde-se à primeira dica", () => {
    const solucao = [
      [packed(0, 0), packed(0, 1), packed(1, 0)],
      [packed(0, 0), packed(0, 1)],
    ];

    let s = iniciar(nivel(TABULEIRO, solucao));
    s = tocar(s, packed(0, 0));
    s = tocar(s, packed(0, 1));
    s = tocar(s, packed(1, 0));
    s = tocar(s, packed(0, 0));
    s = tocar(s, packed(0, 1));

    expect(terminado(s)).toBe(true);
    expect(selo(s)).toBe("perfeito");
  });

  it("um undo degrada o selo de limpo para concluído", () => {
    // Plano §6.2: "Limpo" é sem undo **e** sem reinício. O avanço nunca é
    // bloqueado; é o selo que carrega a exigência.
    let s = iniciar(nivel(TABULEIRO));
    s = tocar(s, packed(0, 0));
    s = tocar(s, packed(0, 1));
    s = tocar(s, packed(1, 0));
    s = desfazer(s);
    s = tocar(s, packed(0, 0));
    s = tocar(s, packed(0, 1));
    s = tocar(s, packed(1, 0));
    s = tocar(s, packed(0, 0));
    s = tocar(s, packed(0, 1));

    expect(s.undos).toBe(1);
    expect(selo(s)).toBe("concluido");

    // Reiniciar volta a pôr peças no tabuleiro, portanto deixa de haver selo.
    expect(selo(reiniciar(s))).toBeNull();
  });

  it("sem undo nem reinício, mas com dica, o selo é limpo", () => {
    const solucao = [
      [packed(0, 0), packed(0, 1), packed(1, 0)],
      [packed(0, 0), packed(0, 1)],
    ];

    let s = iniciar(nivel(TABULEIRO, solucao));
    s = dica(s).sessao;

    for (const grupo of solucao) for (const p of grupo) s = tocar(s, p);

    expect(terminado(s)).toBe(true);
    expect(selo(s)).toBe("limpo");
  });
});

describe("dicas — e a questão de desenho que levantam", () => {
  it("enquanto o jogador segue a solução guardada, a dica é de graça", () => {
    const solucao = [[packed(0, 0), packed(0, 1), packed(1, 0)]];
    const r = dica(iniciar(nivel(TABULEIRO, solucao)));

    expect(r.origem).toBe("guardada");
    expect(r.grupo).toEqual(solucao[0]);
  });

  it("depois de um undo, a dica tem de ser calculada", () => {
    /*
     * A spec §7.5 diz que o jogo em produção nunca calcula nada. Uma dica depois
     * de o jogador sair do caminho guardado obriga a correr o solver em runtime,
     * ou a limitar a dica a "desfaz até ao último ponto conhecido". Fica por
     * decidir na fase 8 — este contador existe para medir com que frequência
     * acontece de facto.
     */
    const solucao = [[packed(0, 0), packed(0, 1), packed(1, 0)]];
    let s = iniciar(nivel(TABULEIRO, solucao));

    s = tocar(s, packed(0, 0));
    s = tocar(s, packed(0, 1));
    s = tocar(s, packed(1, 0));
    s = desfazer(s);

    const r = dica(s);
    expect(r.origem).toBe("calculada");
    expect(r.sessao.dicasCalculadas).toBe(1);
    expect(r.grupo).toBeDefined();
  });
});

describe("uma partida completa, conduzida por guião", () => {
  it("resolve um nível real seguindo a própria solução guardada", () => {
    // Procura o primeiro nível aceite em vez de fixar uma seed: as bandas são
    // recalibradas à medida que se mede, e um teste preso a uma seed concreta
    // parte-se sempre que isso acontece.
    const banda = bandById("tutorial");
    let level;
    for (let seed = 0; seed < 200 && level === undefined; seed++) {
      level = avaliar(seed, banda!, 200).level;
    }

    expect(level).toBeDefined();
    if (level === undefined) return;

    let s = iniciar(level);

    for (const grupo of level.solution) {
      for (const p of grupo) s = tocar(s, p);
    }

    expect(terminado(s)).toBe(true);
    expect(selo(s)).toBe("perfeito");
    expect(s.jogadas).toBe(level.solution.length);
  }, 120_000);
});

describe("o comando `sete play` ponta a ponta", () => {
  it("carrega um nível, aceita jogadas e escreve o registo", () => {
    const log = `${process.env["TEMP"] ?? "."}/sete-play-teste.jsonl`;

    const guiao = "h\ng\nz\nr\nq\n";
    const saida = execFileSync(
      "node",
      [
        "--import",
        "tsx",
        "packages/tools/src/cli.ts",
        "play",
        "--band",
        "tutorial",
        "--log",
        log,
      ],
      { input: guiao, encoding: "utf8", timeout: 120_000 },
    );

    expect(saida).toContain("dica");
    expect(saida).toContain("grupos válidos");
    expect(saida).toContain("fim ·");

    const linhas = readFileSync(log, "utf8").trim().split("\n");
    const ultima = JSON.parse(linhas[linhas.length - 1] as string) as {
      nivel: string;
      reinicios: number;
      dicas: number;
    };

    expect(ultima.nivel).toContain("tutorial");
    expect(ultima.reinicios).toBe(1);
    expect(ultima.dicas).toBe(1);
  }, 180_000);
});
