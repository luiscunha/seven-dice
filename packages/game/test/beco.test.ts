// @vitest-environment jsdom

/**
 * O pop-up de beco sem saída.
 *
 * Vale a pena estar em jsdom e não só na lógica: o que já partiu aqui não foi a
 * deteção — foi o diálogo não voltar a abrir depois de um desfazer, que é
 * exatamente o caminho que o jogador faz quando encrava duas vezes seguidas.
 *
 * `showModal` não existe em jsdom; o ecrã cai para `open = true`, e é o `open`
 * que estes testes lêem.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { Board, Level } from "@dicetoseven/engine";
import { packed } from "@dicetoseven/engine";

import { PuzzleScreen } from "../src/ui/PuzzleScreen";

/*
 * A única jogada é 3+4. Depois dela sobram dois 5, que somam 10 — beco.
 *
 * Não serve `[[3],[4],[5],[2]]`: tirar o 3 e o 4 colapsa as colunas, volta a
 * encostar o 5 ao 2, e há jogada outra vez.
 */
const BOARD: Board = [[3], [4], [5], [5]];

const NIVEL: Level = {
  id: "beco-000000",
  seed: 0,
  board: BOARD,
  solution: [] as never,
};

const A = packed(0, 0);
const B = packed(1, 0);

describe("beco sem saída", () => {
  let host: HTMLElement;
  let ecra: PuzzleScreen;

  const popup = (): HTMLDialogElement | null =>
    host.querySelector("dialog.popup");

  const clicar = (p: number): void => {
    host
      .querySelector(`.peca[data-pos="${String(p)}"]`)
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };

  const botao = (rotulo: string): HTMLButtonElement | undefined =>
    [...(popup()?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === rotulo,
    );

  /** A jogada fatal, e o tempo que a animação leva a assentar. */
  const jogadaFatal = async (): Promise<void> => {
    clicar(A);
    clicar(B);
    await new Promise((r) => {
      setTimeout(r, 0);
    });
  };

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement("div");
    document.body.appendChild(host);
    ecra = new PuzzleScreen(host, NIVEL, {});
  });

  it("fica fechado enquanto houver jogadas", () => {
    expect(popup()?.open).toBe(false);
    ecra.destruir();
  });

  it("abre com o texto do playtest quando o tabuleiro encrava", async () => {
    await jogadaFatal();

    expect(popup()?.open).toBe(true);
    expect(host.querySelector(".popup-titulo")?.textContent).toBe(
      "Ups! Beco sem saída!",
    );
    expect(host.querySelector(".popup-texto")?.textContent).toContain(
      "Sobraram 2 peças",
    );

    ecra.destruir();
  });

  it("desfazer é o botão principal, e reiniciar o secundário", async () => {
    await jogadaFatal();

    expect(botao("Desfazer")?.className).toContain("primario");
    expect(botao("Reiniciar")?.className).not.toContain("primario");

    ecra.destruir();
  });

  it("o ✕ fecha sem sair do beco, e não o traz de volta sozinho", async () => {
    await jogadaFatal();
    botao("✕")?.click();

    expect(popup()?.open).toBe(false);

    // Um repintar qualquer não pode fazê-lo saltar outra vez ao ecrã.
    clicar(packed(0, 0));
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    expect(popup()?.open).toBe(false);

    ecra.destruir();
  });

  it("volta a abrir se o jogador voltar a encravar", async () => {
    await jogadaFatal();
    expect(popup()?.open).toBe(true);

    botao("Desfazer")?.click();
    await new Promise((r) => {
      setTimeout(r, 0);
    });
    expect(popup()?.open).toBe(false);

    await jogadaFatal();
    expect(popup()?.open).toBe(true);

    ecra.destruir();
  });

  it("sair do nível com ele aberto não deixa o modal para trás", async () => {
    await jogadaFatal();
    expect(popup()?.open).toBe(true);

    const d = popup();
    ecra.destruir();

    // Um modal aberto vive na camada de topo, e sobreviveria à remoção da
    // árvore: o ecrã seguinte nascia por baixo do escurecimento.
    expect(d?.open).toBe(false);
    expect(host.querySelector("dialog.popup")).toBeNull();
  });

  it("reiniciar fecha-o e devolve o tabuleiro inteiro", async () => {
    await jogadaFatal();
    botao("Reiniciar")?.click();
    await new Promise((r) => {
      setTimeout(r, 0);
    });

    expect(popup()?.open).toBe(false);
    expect(host.querySelectorAll(".peca").length).toBe(4);

    ecra.destruir();
  });
});
