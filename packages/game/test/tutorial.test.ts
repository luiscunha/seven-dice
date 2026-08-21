// @vitest-environment jsdom

/**
 * O tutorial do joker.
 *
 * A parte que interessa proteger não é o aspeto do ecrã — é o **tabuleiro**. Ele
 * ensina três coisas concretas (`session/tutorial.ts`), e se alguma deixar de
 * valer o tutorial passa a ensinar outra coisa sem que ninguém dê por isso:
 *
 * 1. as faces somam 12, e o joker tem de valer 2;
 * 2. há duas maneiras de o limpar;
 * 3. há uma escolha que o jogo aceita e que o mata numa jogada.
 *
 * A terceira é a lição toda. Um tabuleiro onde escolher mal não doesse era uma
 * demonstração, não um tutorial.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { Board, Group } from "@dicetoseven/engine";
import {
  applyMove,
  findSolution,
  hasAnyGroup,
  isEmpty,
  isValidGroup,
  jokerValue,
  packed,
  totalSum,
} from "@dicetoseven/engine";

import {
  NIVEIS_COM_ANDAIME,
  NIVEL_TUTORIAL_JOKER,
  contaDoJoker,
  mostraSomaDasFaces,
} from "../src/session/tutorial";
import {
  countCompleted,
  emptyProfile,
  load,
  markJokerTutorialSeen,
  recordLevel,
  save,
} from "../src/session/progress";
import { JokerTutorial } from "../src/ui/JokerTutorial";
import { PuzzleScreen } from "../src/ui/PuzzleScreen";

const TAB = NIVEL_TUTORIAL_JOKER.board;

/* Coordenadas do tabuleiro do tutorial, com os nomes que o jogador vê. */
const a0 = packed(0, 0); // ✳
const a1 = packed(0, 1); // 4
const b0 = packed(1, 0); // 5
const b1 = packed(1, 1); // 3

const grupo = (...ps: readonly number[]): Group =>
  [...ps].sort((a, b) => a - b) as Group;

describe("o tabuleiro do tutorial", () => {
  it("vale o que a conta diz que vale", () => {
    const conta = contaDoJoker(TAB);

    expect(conta).toEqual({ faces: 12, joker: 2, total: 14, jogadas: 2 });
    expect(totalSum(TAB)).toBe(12);
    expect(jokerValue(TAB)).toBe(2);
    expect(NIVEL_TUTORIAL_JOKER.joker?.trueValue).toBe(2);
  });

  it("é limpo pela solução que traz guardada", () => {
    let b: Board = TAB;

    for (const g of NIVEL_TUTORIAL_JOKER.solution) {
      expect(isValidGroup(b, g)).toBe(true);
      b = applyMove(b, g);
    }

    expect(isEmpty(b)).toBe(true);
  });

  /*
   * Duas saídas boas, e não uma. Um tabuleiro com um só caminho seria um carril:
   * o jogador seguia-o sem decidir nada, e o tutorial não ensinava que há uma
   * escolha a fazer.
   */
  it("tem duas maneiras de ser limpo", () => {
    const pelaJoker = applyMove(TAB, grupo(a0, b0)); // ✳2 + 5
    const pelas4e3 = applyMove(TAB, grupo(a1, b1)); //  4 + 3

    expect(findSolution(pelaJoker)).not.toBeNull();
    expect(findSolution(pelas4e3)).not.toBeNull();

    // E o joker continua a valer 2 no caminho que o deixa para o fim.
    expect(jokerValue(pelas4e3)).toBe(2);
  });

  /**
   * A lição. O jogo **aceita** gastar o joker com o 4 — soma 7, está conexo — e
   * o tabuleiro morre imediatamente a seguir, sem um aviso.
   */
  it("morre numa jogada se o joker for gasto no valor errado", () => {
    const errado = grupo(a0, a1); // ✳3 + 4

    expect(isValidGroup(TAB, errado)).toBe(true);

    const depois = applyMove(TAB, errado);

    expect(isEmpty(depois)).toBe(false);
    expect(totalSum(depois)).toBe(8);
    expect(jokerValue(depois)).toBeUndefined();
    expect(hasAnyGroup(depois)).toBe(false);
    expect(findSolution(depois)).toBeNull();
  });
});

describe("o andaime da soma das faces", () => {
  it("dura três níveis com joker e depois desaparece", () => {
    expect(NIVEIS_COM_ANDAIME).toBe(3);

    expect(mostraSomaDasFaces(0)).toBe(true);
    expect(mostraSomaDasFaces(2)).toBe(true);
    expect(mostraSomaDasFaces(3)).toBe(false);
    expect(mostraSomaDasFaces(30)).toBe(false);
  });

  /* Conta níveis distintos, não sessões: repetir o mesmo não ensina outra vez. */
  it("conta níveis distintos", () => {
    const ids = ["meio-joker-1", "meio-joker-2", "denso-1"];

    let p = emptyProfile();
    expect(countCompleted(p, ids)).toBe(0);

    p = recordLevel(p, "meio-joker-1", "completed", 4);
    p = recordLevel(p, "meio-joker-1", "perfect", 4);
    expect(countCompleted(p, ids)).toBe(1);

    p = recordLevel(p, "inicio-9", "perfect", 3);
    expect(countCompleted(p, ids)).toBe(1);

    p = recordLevel(p, "denso-1", "clean", 2);
    expect(countCompleted(p, ids)).toBe(2);
  });
});

describe("a bandeira do tutorial no perfil", () => {
  it("nasce por levantar e sobrevive a gravar e reler", () => {
    const memoria = new Map<string, string>();
    const armazem = {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memoria.set(k, v);
      },
    };

    expect(emptyProfile().sawJokerTutorial).toBe(false);

    const visto = markJokerTutorialSeen(emptyProfile());
    expect(visto.sawJokerTutorial).toBe(true);

    save(armazem, visto);
    expect(load(armazem).sawJokerTutorial).toBe(true);
  });

  it("um perfil de outra versão não traz a bandeira levantada por engano", () => {
    const armazem = {
      getItem: () => JSON.stringify({ version: 1, sawJokerTutorial: true }),
      setItem: () => undefined,
    };

    expect(load(armazem).sawJokerTutorial).toBe(false);
  });
});

/* ─── o ecrã ────────────────────────────────────────────────────────────────
 *
 * Aqui só se testam as duas propriedades que o desenho exige e que um refactor
 * pode partir sem dar nas vistas: não há saída antes de o tabuleiro estar limpo,
 * e o caminho fatal é nomeado quando acontece.
 */

describe("o ecrã do tutorial", () => {
  let host: HTMLElement;
  let ecra: JokerTutorial;
  let fechou = 0;

  const abrir = (revisao: boolean): void => {
    ecra = new JokerTutorial(host, {
      revisao,
      aoFechar: () => {
        fechou++;
      },
    });
  };

  const botoes = (): readonly string[] =>
    [...host.querySelectorAll(".acoes .btn")].map((b) => b.textContent ?? "");

  const clicar = (el: Element | null): void => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };

  const peca = (p: number): Element | null =>
    host.querySelector(`.peca[data-pos="${String(p)}"]`);

  /** Toca no joker e escolhe um valor no seletor que abre. */
  const jokerVale = (v: number): void => {
    clicar(peca(a0));
    clicar(host.querySelector(`.joker-opcao[aria-label="${String(v)}"]`));
  };

  /** As jogadas são `async`; sem isto lê-se o ecrã antes de ele repintar. */
  const assentar = (): Promise<void> =>
    new Promise((r) => {
      setTimeout(r, 0);
    });

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement("div");
    document.body.appendChild(host);
    fechou = 0;
  });

  it("não deixa sair antes de o tabuleiro estar limpo", async () => {
    abrir(false);
    expect(botoes()).toEqual([]);

    jokerVale(2);
    clicar(peca(b0)); // ✳2 + 5 = 7
    await assentar();

    clicar(peca(a0)); // o 4, já caído para a base
    clicar(peca(b0)); // o 3
    await assentar();

    expect(botoes()).toContain("Já percebi");

    clicar(host.querySelector(".acoes .btn.primario"));
    expect(fechou).toBe(1);

    ecra.destruir();
  });

  it("em revisão, fecha-se sem jogar", () => {
    abrir(true);

    expect(botoes()).toEqual(["Fechar"]);
    clicar(host.querySelector(".acoes .btn"));
    expect(fechou).toBe(1);

    ecra.destruir();
  });

  it("nomeia o que aconteceu quando o joker é gasto no valor errado", async () => {
    abrir(false);

    jokerVale(3);
    clicar(peca(a1)); // ✳3 + 4 = 7, e o jogo aceita
    await assentar();

    const estado = host.querySelector(".tutorial-estado")?.textContent ?? "";

    expect(estado).toContain("Sobram 8");
    expect(estado).toContain("não te avisou");
    expect(botoes()).toEqual(["Tentar outra vez"]);

    // E dá para voltar atrás sem sair do tutorial.
    clicar(host.querySelector(".acoes .btn"));
    expect(host.querySelectorAll(".peca[data-pos]")).toHaveLength(4);

    ecra.destruir();
  });
});

/* ─── o andaime no cabeçalho ────────────────────────────────────────────────
 *
 * A regra de quando ele aparece está testada acima como aritmética. Aqui testa-se
 * a outra metade, que é a que um refactor parte sem avisar: o número tem de sair
 * do cabeçalho **assim que o joker for gasto**, porque a partir daí a soma é
 * múltipla de 7 e não informa nada.
 */

describe("a soma das faces no cabeçalho", () => {
  let host: HTMLElement;
  let ecra: PuzzleScreen;

  const meta = (): string =>
    host.querySelector(".topo .meta")?.textContent ?? "";

  const clicar = (p: number): void => {
    host
      .querySelector(`.peca[data-pos="${String(p)}"]`)
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  };

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  it("aparece com o andaime ligado, e sai quando o joker é gasto", async () => {
    ecra = new PuzzleScreen(host, NIVEL_TUTORIAL_JOKER, {
      mostrarSomaDasFaces: true,
    });

    expect(meta()).toContain("faces somam 12");

    clicar(a0);
    host
      .querySelector('.joker-opcao[aria-label="2"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    clicar(b0); // ✳2 + 5 = 7, e o joker sai do tabuleiro

    await new Promise((r) => {
      setTimeout(r, 0);
    });

    expect(meta()).not.toContain("faces somam");

    ecra.destruir();
  });

  it("não aparece com o andaime desligado", () => {
    ecra = new PuzzleScreen(host, NIVEL_TUTORIAL_JOKER, {});

    expect(meta()).toContain("4/4 peças");
    expect(meta()).not.toContain("faces somam");

    ecra.destruir();
  });

  it("o `?` só existe quando há para onde ir", () => {
    ecra = new PuzzleScreen(host, NIVEL_TUTORIAL_JOKER, {});
    expect(host.querySelector(".topo .btn.redondo")).toBeNull();
    ecra.destruir();

    ecra = new PuzzleScreen(host, NIVEL_TUTORIAL_JOKER, {
      aoPedirAjuda: () => undefined,
    });
    expect(host.querySelector(".topo .btn.redondo")?.textContent).toBe("?");
    ecra.destruir();
  });
});
