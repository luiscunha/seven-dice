// @vitest-environment jsdom

/**
 * O ecrã do Survival.
 *
 * O que se protege aqui não é o desenho — é o **travão**. O ecrã bloqueia toques
 * enquanto a jogada anima, e um travão que fique preso mata o jogo em silêncio:
 * sem toques, sem botão, e sem nada no ecrã a dizer porquê. Foi exatamente o que
 * aconteceu a testar no browser.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { findAllGroups } from "@dicetoseven/engine";

import { DEFAULT_SURVIVAL, startSurvival } from "../src/session/SurvivalSession";
import { SurvivalScreen } from "../src/ui/SurvivalScreen";

const SEED = 424242;

describe("SurvivalScreen", () => {
  let host: HTMLElement;
  let ecra: SurvivalScreen;

  const pecas = (): number => host.querySelectorAll(".peca").length;
  const botaoPuxar = (): HTMLButtonElement | null =>
    host.querySelector(".rodape .acoes .btn");
  const folga = (): string =>
    host.querySelector(".folga-numero")?.textContent ?? "";
  const fila = (): string[] =>
    [...host.querySelectorAll(".fila-linha")].map((l) =>
      [...l.querySelectorAll(".fila-peca")].map((p) => p.textContent).join(""),
    );

  const clicar = (p: number): void => {
    host
      .querySelector(`.peca[data-pos="${String(p)}"]`)
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };

  const assentar = async (): Promise<void> => {
    // As animações do BoardView são `setTimeout`, e somam ~620ms.
    await new Promise((r) => {
      setTimeout(r, 900);
    });
  };

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement("div");
    document.body.appendChild(host);
    ecra = new SurvivalScreen(host, {
      seed: SEED,
      melhorPontuacao: 0,
      aoTerminar: () => undefined,
      aoSair: () => undefined,
      aoRecomecar: () => undefined,
    });
  });

  it("arranca com o tabuleiro da seed e a fila à frente", () => {
    expect(pecas()).toBe(
      DEFAULT_SURVIVAL.largura * DEFAULT_SURVIVAL.alturaInicial,
    );
    expect(fila()).toHaveLength(DEFAULT_SURVIVAL.previsao);
    expect(folga()).toBe(
      String(DEFAULT_SURVIVAL.alturaMaxima - DEFAULT_SURVIVAL.alturaInicial),
    );
    ecra.destruir();
  });

  it("puxar uma linha faz o tabuleiro crescer e a fila andar", () => {
    const antes = fila();
    const contagem = pecas();

    botaoPuxar()?.click();

    expect(pecas()).toBe(contagem + DEFAULT_SURVIVAL.largura);
    expect(fila()[0]).toBe(antes[1]);
    expect(folga()).toBe(
      String(DEFAULT_SURVIVAL.alturaMaxima - DEFAULT_SURVIVAL.alturaInicial - 1),
    );
    ecra.destruir();
  });

  it("**o travão solta-se depois da jogada** — o ecrã não fica morto", async () => {
    const s = startSurvival(SEED);
    const grupo = [...findAllGroups(s.game.board)][0];
    expect(grupo).toBeDefined();

    for (const p of grupo ?? []) clicar(p);
    await assentar();

    // Se o `ocupado` tivesse ficado preso, isto não fazia nada.
    const contagem = pecas();
    botaoPuxar()?.click();
    expect(pecas()).toBeGreaterThan(contagem);

    ecra.destruir();
  });

  it("mostra o resto para limpar, e só o realça quando é acionável", () => {
    const resto = host.querySelector(".resto");
    expect(resto?.textContent).toMatch(/limpar/);
    // A seed de teste não arranca em múltiplo de 7 — o realce fica reservado.
    expect(resto?.getAttribute("data-pronto")).toBe("nao");
    ecra.destruir();
  });

  it("sair não deixa o modal de fim para trás", () => {
    const d = host.querySelector("dialog.popup");
    ecra.destruir();
    expect((d as HTMLDialogElement | null)?.open ?? false).toBe(false);
    expect(host.querySelector(".ecra.survival")).toBeNull();
  });
});
