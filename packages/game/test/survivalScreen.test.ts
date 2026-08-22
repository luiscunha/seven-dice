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

  /** Só as do tabuleiro: a fila também tem `.peca`, e não conta. */
  const pecas = (): number =>
    host.querySelectorAll(".tabuleiro .peca").length;
  const botaoPuxar = (): HTMLButtonElement | null =>
    host.querySelector(".rodape .acoes .btn");
  const relogio = (): string =>
    host.querySelector(".relogio")?.textContent ?? "";
  /** As faces da próxima linha, lidas das peças a sério. */
  const fila = (): string[] =>
    [...host.querySelectorAll(".fila .peca")].map(
      (p) => (p as HTMLElement).dataset["valor"] ?? "",
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
      melhorTempo: 0,
      aoGuardar: () => undefined,
      aoTerminar: () => undefined,
      aoSair: () => undefined,
      aoRecomecar: () => undefined,
    });
  });

  it("arranca com o tabuleiro da seed e a fila à frente", () => {
    expect(pecas()).toBe(
      DEFAULT_SURVIVAL.largura * DEFAULT_SURVIVAL.alturaInicial,
    );
    expect(fila()).toHaveLength(DEFAULT_SURVIVAL.largura);
    // O cronómetro só arranca ao primeiro toque.
    expect(relogio()).toBe("0:00.0");
    ecra.destruir();
  });

  it("puxar uma linha faz o tabuleiro crescer e a fila andar", async () => {
    const antes = fila();
    const contagem = pecas();

    botaoPuxar()?.click();
    // A queda é animada, portanto a fila só anda quando ela assenta.
    await assentar();

    expect(pecas()).toBe(contagem + DEFAULT_SURVIVAL.largura);
    // A linha que estava à frente entrou, e a fila mostra outra.
    expect(fila()).not.toEqual(antes);
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
    const d = host.querySelector("dialog.confirmacao");
    ecra.destruir();
    expect((d as HTMLDialogElement | null)?.open ?? false).toBe(false);
    expect(host.querySelector(".ecra.survival")).toBeNull();
  });
});

describe("o joker no Survival", () => {
  /** Um estado com joker no tabuleiro, para o ecrã retomar. */
  const comJoker = (): { estado: ReturnType<typeof startSurvival>; decorridoMs: number } => {
    const base = startSurvival(SEED);
    return {
      estado: {
        ...base,
        // `✳ + 5` fecha em 7 assim que o joker valer 2.
        game: { ...base.game, board: [[0], [5]] },
      },
      decorridoMs: 0,
    };
  };

  it("tocar-lhe abre a escolha do valor", () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);

    const ecra = new SurvivalScreen(host, {
      seed: SEED,
      retomar: comJoker(),
      aoGuardar: () => undefined,
      melhorTempo: 0,
      aoTerminar: () => undefined,
      aoSair: () => undefined,
      aoRecomecar: () => undefined,
    });

    // Antes: o seletor não existe no ecrã.
    expect(host.querySelector(".joker-opcao")).toBeNull();

    host
      .querySelector('.tabuleiro .peca[data-valor="0"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Sem isto, tocar no joker não fazia rigorosamente nada.
    expect(host.querySelectorAll(".joker-opcao").length).toBeGreaterThan(0);

    ecra.destruir();
  });

  it("escolher o valor faz a jogada", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);

    const ecra = new SurvivalScreen(host, {
      seed: SEED,
      retomar: comJoker(),
      aoGuardar: () => undefined,
      melhorTempo: 0,
      aoTerminar: () => undefined,
      aoSair: () => undefined,
      aoRecomecar: () => undefined,
    });

    host
      .querySelector('.tabuleiro .peca[data-valor="0"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    host
      .querySelector('.joker-opcao[aria-label="2"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => {
      setTimeout(r, 0);
    });

    // O joker entrou na seleção com o valor 2; falta o 5 para fechar em 7.
    host
      .querySelector('.tabuleiro .peca[data-valor="5"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => {
      setTimeout(r, 900);
    });

    expect(host.querySelectorAll(".tabuleiro .peca").length).toBe(0);
    ecra.destruir();
  });
});

describe("sair não perde a corrida", () => {
  it("guarda o estado e o tempo, e retoma no mesmo sítio", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);

    let guardado: { estado: ReturnType<typeof startSurvival>; decorridoMs: number } | undefined;

    const abrir = (
      retomar?: { estado: ReturnType<typeof startSurvival>; decorridoMs: number },
    ): SurvivalScreen =>
      new SurvivalScreen(host, {
        seed: SEED,
        ...(retomar === undefined ? {} : { retomar }),
        aoGuardar: (c) => {
          guardado = c as typeof guardado;
        },
        melhorTempo: 0,
        aoTerminar: () => undefined,
        aoSair: () => undefined,
        aoRecomecar: () => undefined,
      });

    let ecra = abrir();

    // Uma linha puxada, para o estado deixar de ser o inicial.
    host.querySelector<HTMLElement>(".rodape .acoes .btn")?.click();
    await new Promise((r) => {
      setTimeout(r, 900);
    });

    const pecasAntes = host.querySelectorAll(".tabuleiro .peca").length;
    const filaAntes = [...host.querySelectorAll(".fila .peca")].map(
      (p) => (p as HTMLElement).dataset["valor"],
    );

    ecra.destruir();
    expect(guardado).toBeDefined();

    // Voltar ao modo: o tabuleiro e a fila são os mesmos.
    ecra = abrir(guardado);
    expect(host.querySelectorAll(".tabuleiro .peca").length).toBe(pecasAntes);
    expect(
      [...host.querySelectorAll(".fila .peca")].map(
        (p) => (p as HTMLElement).dataset["valor"],
      ),
    ).toEqual(filaAntes);

    ecra.destruir();
  });
});

describe("recomeçar pergunta antes", () => {
  it("um toque por engano não deita a corrida fora", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);

    let recomecou = 0;
    const ecra = new SurvivalScreen(host, {
      seed: SEED,
      aoGuardar: () => undefined,
      melhorTempo: 0,
      aoTerminar: () => undefined,
      aoSair: () => undefined,
      aoRecomecar: () => {
        recomecou++;
      },
    });

    const btRecomecar = [
      ...host.querySelectorAll<HTMLButtonElement>(".rodape .acoes .btn"),
    ].find((b) => b.textContent === "Recomeçar");
    expect(btRecomecar).toBeDefined();

    btRecomecar?.click();
    expect(recomecou).toBe(0);

    const caixa = host.querySelector("dialog.confirmacao");
    expect(caixa?.textContent).toContain("Recomeçar?");

    // Cancelar deixa tudo como estava.
    [...(caixa?.querySelectorAll("button") ?? [])]
      .find((b) => b.textContent === "Cancelar")
      ?.click();
    expect(recomecou).toBe(0);
    expect(host.querySelector("dialog.confirmacao")).toBeNull();

    // E confirmar recomeça mesmo.
    btRecomecar?.click();
    [...(host.querySelector("dialog.confirmacao")?.querySelectorAll("button") ?? [])]
      .find((b) => b.textContent === "Recomeçar")
      ?.click();
    expect(recomecou).toBe(1);

    ecra.destruir();
  });
});
