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

import type { Board, Group, Packed } from "@dicetoseven/engine";
import { applyMove, boardKey, packed } from "@dicetoseven/engine";

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

/* ─── Dimensionamento ───────────────────────────────────────────────────────
 *
 * O tabuleiro nunca pode sair da bandeja. É um defeito que só aparece em ecrãs
 * baixos — num 7×7 a 1080×610 o palco tem 394px de altura e só 354 de espaço
 * útil, e as peças transbordavam 19px por cima e por baixo.
 *
 * A causa era `getBoundingClientRect` devolver a caixa de **bordo**, com o
 * padding lá dentro, e o cálculo dividir o tabuleiro por ela.
 */

describe("dimensionamento", () => {
  /** jsdom não faz layout: a caixa e o padding entram à mão. */
  const palcoDe = (largura: number, altura: number, padding: number): HTMLElement => {
    const el = document.createElement("div");
    el.style.padding = `${String(padding)}px`;
    el.getBoundingClientRect = () =>
      ({ width: largura, height: altura, top: 0, left: 0, right: largura, bottom: altura, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    document.body.appendChild(el);
    return el;
  };

  const ladoDe = (view: BoardView, palco: HTMLElement): number => {
    view.redimensionar();
    const grelha = palco.querySelector<HTMLElement>(".tabuleiro");
    return Number.parseFloat(grelha?.style.getPropertyValue("--lado") ?? "0");
  };

  /** Um tabuleiro cheio de `n` colunas por `n` linhas — o caso do `perito` 7×7. */
  const quadrado = (n: number): Board =>
    Array.from({ length: n }, () => Array.from({ length: n }, () => 1 as const));

  it("o tabuleiro cabe no espaço útil, e não na caixa com padding", () => {
    const padding = 20;
    const palco = palcoDe(888, 394, padding);

    const view = new BoardView(palco, { aoTocar: () => undefined });
    view.dimensionarPara(quadrado(7));
    view.montar(quadrado(7));

    const lado = ladoDe(view, palco);
    const gap = 0; // sem folha de estilos, `--gap-peca` resolve a zero
    const alturaDaGrelha = 7 * (lado + gap) - gap;

    expect(alturaDaGrelha).toBeLessThanOrEqual(394 - padding * 2);

    view.destruir();
  });

  it("sem padding, aproveita a caixa toda", () => {
    const semPadding = palcoDe(888, 394, 0);
    const comPadding = palcoDe(888, 394, 20);

    const a = new BoardView(semPadding, { aoTocar: () => undefined });
    a.dimensionarPara(quadrado(7));
    a.montar(quadrado(7));

    const b = new BoardView(comPadding, { aoTocar: () => undefined });
    b.dimensionarPara(quadrado(7));
    b.montar(quadrado(7));

    // A diferença é exatamente o padding vertical repartido pelas sete linhas.
    expect(ladoDe(a, semPadding)).toBeGreaterThan(ladoDe(b, comPadding));

    a.destruir();
    b.destruir();
  });

  it("nunca passa do lado máximo, por muito espaço que haja", () => {
    const palco = palcoDe(2000, 2000, 20);

    const view = new BoardView(palco, { aoTocar: () => undefined });
    view.dimensionarPara(quadrado(3));
    view.montar(quadrado(3));

    expect(ladoDe(view, palco)).toBeLessThanOrEqual(72);

    view.destruir();
  });
});
