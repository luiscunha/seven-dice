// @vitest-environment jsdom

/**
 * `BoardView` — o tabuleiro em DOM.
 *
 * O que vale a pena testar aqui não é o aspeto: é a **identidade das peças** e o
 * que acontece quando uma jogada chega a meio de uma animação. Sem jsdom, as
 * durações do CSS não existem e resolvem a zero — o que dá exatamente o mesmo
 * caminho de código que `prefers-reduced-motion`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { Board, Group, Packed } from "@septet/engine";
import { applyMove, boardKey, packed } from "@septet/engine";

import { BoardView } from "../src/ui/BoardView";

const TABULEIRO: Board = [
  [3, 4],
  [4, 3],
  [1, 6],
];

const grupo = (...ps: readonly Packed[]): Group =>
  [...ps].sort((a, b) => a - b) as Group;

/** O que o DOM diz que o tabuleiro é, lido só a partir dos elementos. */
function lerDoDom(host: HTMLElement): Board {
  const colunas = new Map<number, Map<number, number>>();

  for (const el of host.querySelectorAll<HTMLElement>(".peca")) {
    const c = Number(el.style.getPropertyValue("--c"));
    const r = Number(el.style.getPropertyValue("--r"));
    const v = Number(el.dataset["valor"]);

    let coluna = colunas.get(c);
    if (coluna === undefined) {
      coluna = new Map<number, number>();
      colunas.set(c, coluna);
    }
    coluna.set(r, v);
  }

  return [...colunas.keys()]
    .sort((a, b) => a - b)
    .map((c) => {
      const coluna = colunas.get(c);
      if (coluna === undefined) return [];
      return [...coluna.keys()].sort((a, b) => a - b).map((r) => {
        const v = coluna.get(r);
        return (v ?? 0) as never;
      });
    }) as Board;
}

let host: HTMLElement;
let tocadas: Packed[];

beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement("div");
  document.body.appendChild(host);
  tocadas = [];
});

const criar = (): BoardView =>
  new BoardView(host, {
    aoTocar: (p) => {
      tocadas.push(p);
    },
  });

describe("montagem", () => {
  it("cria uma peça por célula, com a face e a posição certas", () => {
    const view = criar();
    view.montar(TABULEIRO);

    expect(host.querySelectorAll(".peca")).toHaveLength(6);
    expect(boardKey(lerDoDom(host))).toBe(boardKey(TABULEIRO));

    view.destruir();
  });

  it("tocar numa peça devolve a coordenada empacotada", () => {
    const view = criar();
    view.montar(TABULEIRO);

    const alvo = host.querySelector<HTMLElement>(
      `.peca[data-pos="${String(packed(1, 1))}"]`,
    );
    expect(alvo).not.toBeNull();
    alvo?.click();

    expect(tocadas).toEqual([packed(1, 1)]);

    view.destruir();
  });
});

describe("a jogada", () => {
  it("deixa o DOM exatamente no estado de applyMove", async () => {
    const view = criar();
    view.montar(TABULEIRO);

    // a0 = 3 e b0 = 4, lado a lado na base.
    const g = grupo(packed(0, 0), packed(1, 0));
    await view.aplicarJogada(g);

    expect(boardKey(lerDoDom(host))).toBe(boardKey(applyMove(TABULEIRO, g)));
    expect(host.querySelectorAll(".peca")).toHaveLength(4);

    view.destruir();
  });

  /*
   * A propriedade que interessa: **a peça é o mesmo nó do DOM antes e depois**.
   * Se a jogada recriasse elementos, não haveria nada para animar — e o
   * tabuleiro passaria a piscar de um estado para o outro.
   */
  it("mantém o mesmo elemento para a peça que se moveu", async () => {
    const view = criar();
    view.montar(TABULEIRO);

    const antes = host.querySelector<HTMLElement>(
      `.peca[data-pos="${String(packed(0, 1))}"]`,
    );

    await view.aplicarJogada(grupo(packed(0, 0), packed(1, 0)));

    const depois = host.querySelector<HTMLElement>(
      `.peca[data-pos="${String(packed(0, 0))}"]`,
    );

    expect(antes).not.toBeNull();
    expect(depois).toBe(antes);

    view.destruir();
  });

  it("uma coluna inteira eliminada desaparece do DOM", async () => {
    const view = criar();
    view.montar(TABULEIRO);

    // A coluna c inteira: 1 + 6 = 7.
    await view.aplicarJogada(grupo(packed(2, 0), packed(2, 1)));

    expect(host.querySelectorAll(".peca")).toHaveLength(4);
    expect(
      host.querySelector(`.peca[data-pos="${String(packed(2, 0))}"]`),
    ).toBeNull();

    view.destruir();
  });

  /*
   * O defeito que esta estrutura existe para evitar: se o estado lógico só
   * avançasse no fim da animação, a jogada seguinte calcularia a transição
   * contra um tabuleiro que já não existe.
   */
  it("duas jogadas seguidas não se atropelam", async () => {
    const view = criar();
    view.montar(TABULEIRO);

    const primeira = grupo(packed(0, 0), packed(1, 0));
    const p1 = view.aplicarJogada(primeira);

    const meio = applyMove(TABULEIRO, primeira);
    expect(boardKey(view.tabuleiro)).toBe(boardKey(meio));

    // Sem esperar pela primeira: o tabuleiro já é o de depois dela.
    const segunda = grupo(packed(0, 0), packed(1, 0)); // 4 + 3 = 7
    const p2 = view.aplicarJogada(segunda);

    await Promise.all([p1, p2]);

    const fim = applyMove(meio, segunda);
    expect(boardKey(view.tabuleiro)).toBe(boardKey(fim));
    expect(boardKey(lerDoDom(host))).toBe(boardKey(fim));

    view.destruir();
  });
});

describe("seleção e sugestão", () => {
  it("marca e desmarca as peças selecionadas", () => {
    const view = criar();
    view.montar(TABULEIRO);

    view.marcarSelecao(new Set([packed(0, 0), packed(1, 0)]));
    expect(host.querySelectorAll(".peca.selecionada")).toHaveLength(2);

    view.marcarSelecao(new Set());
    expect(host.querySelectorAll(".peca.selecionada")).toHaveLength(0);

    view.destruir();
  });

  it("a sugestão da dica substitui a anterior", () => {
    const view = criar();
    view.montar(TABULEIRO);

    view.marcarSugestao([packed(0, 0)]);
    expect(host.querySelectorAll(".peca.sugerida")).toHaveLength(1);

    view.marcarSugestao([packed(1, 0), packed(1, 1)]);
    expect(host.querySelectorAll(".peca.sugerida")).toHaveLength(2);

    view.marcarSugestao(undefined);
    expect(host.querySelectorAll(".peca.sugerida")).toHaveLength(0);

    view.destruir();
  });
});

describe("faces", () => {
  it("as pintas são o padrão, e os dígitos uma alternativa", () => {
    const view = criar();
    view.montar([[6]] as Board);

    expect(host.querySelectorAll(".pinta")).toHaveLength(6);

    view.trocarModoFace("digitos");
    expect(host.querySelectorAll(".pinta")).toHaveLength(0);
    expect(host.querySelector(".glifo")?.textContent).toBe("6");

    view.destruir();
  });

  it("o joker tem glifo próprio e nunca pintas", () => {
    const view = criar();
    view.montar([[0]] as Board);

    expect(host.querySelectorAll(".pinta")).toHaveLength(0);
    expect(host.querySelector(".peca")?.getAttribute("aria-label")).toBe(
      "joker",
    );

    view.destruir();
  });
});
