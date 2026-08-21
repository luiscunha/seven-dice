// @vitest-environment jsdom

/**
 * Navegação, preferências e modo tempo.
 *
 * As rotas e as preferências são funções puras e testam-se como tal. O modo
 * tempo não: depende do relógio, e é precisamente aí que está o que vale a pena
 * proteger — **a corrida tem de acabar mesmo quando o temporizador não dispara**.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Level } from "@septet/engine";

import {
  SETTINGS_KEY,
  aplicarTema,
  defaultSettings,
  loadSettings,
  saveSettings,
} from "../src/session/settings";
import { deHash, paraHash, rotaLegada } from "../src/ui/rotas";
import type { Rota } from "../src/ui/rotas";
import { TimeAttackScreen } from "../src/ui/TimeAttackScreen";

/* ─── Rotas ─────────────────────────────────────────────────────────────────
 *
 * Vivem no fragmento para o jogo publicado correr em alojamento estático sem
 * reescritas, e para cada ecrã ter endereço — no playtest externo, um link leva
 * a pessoa exatamente ao nível de que se está a falar.
 */

describe("rotas", () => {
  const TODAS: readonly Rota[] = [
    { ecra: "home" },
    { ecra: "bandas" },
    { ecra: "niveis", banda: "perito" },
    { ecra: "jogo", banda: "meio-joker", nivel: 12 },
    { ecra: "tempo" },
    { ecra: "definicoes" },
  ];

  it("ida e volta, para todas", () => {
    for (const r of TODAS) {
      expect(deHash(paraHash(r))).toEqual(r);
    }
  });

  it("uma rota que não se reconheça é a Home — um URL partido não trava o jogo", () => {
    for (const h of ["", "#", "#/", "#/inventado", "#/jogo", "#///"]) {
      expect(deHash(h)).toEqual({ ecra: "home" });
    }
  });

  it("um índice de nível absurdo cai no primeiro, em vez de rebentar", () => {
    expect(deHash("#/jogo/perito/abc")).toEqual({
      ecra: "jogo",
      banda: "perito",
      nivel: 0,
    });
    expect(deHash("#/jogo/perito/-3")).toEqual({
      ecra: "jogo",
      banda: "perito",
      nivel: 0,
    });
  });

  it("nomes de banda com caracteres especiais sobrevivem", () => {
    const r: Rota = { ecra: "niveis", banda: "meio-joker" };
    expect(paraHash(r)).toBe("#/niveis/meio-joker");
    expect(deHash(paraHash(r))).toEqual(r);
  });

  /* Há links `?banda=…` espalhados por notas e conversas; traduzi-los é uma linha. */
  it("a forma antiga continua a levar ao sítio certo", () => {
    expect(rotaLegada("?banda=perito&nivel=27")).toEqual({
      ecra: "jogo",
      banda: "perito",
      nivel: 27,
    });

    expect(rotaLegada("?banda=denso")).toEqual({
      ecra: "jogo",
      banda: "denso",
      nivel: 0,
    });

    expect(rotaLegada("")).toBeUndefined();
    expect(rotaLegada("?outra=coisa")).toBeUndefined();
  });
});

/* ─── Preferências ──────────────────────────────────────────────────────── */

describe("preferências", () => {
  const memoria = new Map<string, string>();
  const armazem = {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoria.set(k, v);
    },
  };

  beforeEach(() => {
    memoria.clear();
  });

  it("nascem a seguir o sistema", () => {
    expect(defaultSettings().tema).toBe("sistema");
    expect(loadSettings(armazem).tema).toBe("sistema");
  });

  it("sobrevivem a gravar e reler", () => {
    saveSettings(armazem, { ...defaultSettings(), tema: "escuro" });
    expect(loadSettings(armazem).tema).toBe("escuro");
  });

  /* Um ficheiro corrompido dá preferências por omissão, nunca um jogo que não abre. */
  it("nunca falham a ler", () => {
    for (const lixo of ["", "{", "null", "42", '{"version":99,"tema":"escuro"}']) {
      memoria.set(SETTINGS_KEY, lixo);
      expect(loadSettings(armazem)).toEqual(defaultSettings());
    }
  });

  it("um tema desconhecido volta ao sistema", () => {
    memoria.set(SETTINGS_KEY, JSON.stringify({ version: 1, tema: "néon" }));
    expect(loadSettings(armazem).tema).toBe("sistema");
  });

  /**
   * É a **ausência** do atributo que devolve o comando ao `prefers-color-scheme`.
   * Escrever `data-tema="sistema"` dava uma variante que nenhuma regra do CSS
   * conhece, e o jogo ficava no tema claro para toda a gente.
   */
  it("«sistema» retira o atributo, não lhe põe um valor", () => {
    const raiz = document.createElement("div");

    aplicarTema(raiz, "escuro");
    expect(raiz.dataset["tema"]).toBe("escuro");

    aplicarTema(raiz, "claro");
    expect(raiz.dataset["tema"]).toBe("claro");

    aplicarTema(raiz, "sistema");
    expect(raiz.dataset["tema"]).toBeUndefined();
    expect(raiz.hasAttribute("data-tema")).toBe(false);
  });
});

/* ─── Modo tempo ────────────────────────────────────────────────────────── */

const nivel = (id: string): Level => ({
  id,
  seed: 0,
  board: [
    [3, 4],
    [4, 3],
  ],
  solution: [],
});

describe("modo tempo", () => {
  let host: HTMLElement;
  let ecra: TimeAttackScreen | undefined;
  let terminou: { pontos: number; tabuleiros: number } | undefined;
  let saiu = 0;

  const abrir = (): TimeAttackScreen =>
    new TimeAttackScreen(host, {
      niveis: [nivel("tempo-1"), nivel("tempo-2")],
      melhorPontuacao: 0,
      aoTerminar: (info) => {
        terminou = { ...info };
      },
      aoSair: () => {
        saiu++;
      },
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    document.body.replaceChildren();
    host = document.createElement("div");
    document.body.appendChild(host);

    terminou = undefined;
    saiu = 0;
  });

  afterEach(() => {
    ecra?.destruir();
    ecra = undefined;
    vi.useRealTimers();
  });

  it("não tem Desfazer, e é por desenho", () => {
    ecra = abrir();

    // Os níveis deste modo são greedy-safe: não há como bloquear, portanto não
    // há nada que desfazer (desenho §5.3).
    expect(host.textContent).not.toContain("Desfazer");
  });

  it("o relógio mostra décimos no último minuto de tensão", () => {
    ecra = abrir();

    const relogio = host.querySelector(".relogio");
    expect(relogio?.textContent).toBe("90");
    expect(relogio?.classList.contains("a-acabar")).toBe(false);

    vi.advanceTimersByTime(85_000);

    expect(relogio?.textContent).toBe("5.0");
    expect(relogio?.classList.contains("a-acabar")).toBe(true);
  });

  it("a corrida acaba quando o tempo passa, e o resultado é registado", () => {
    ecra = abrir();

    vi.advanceTimersByTime(91_000);

    expect(terminou).toBeDefined();
    expect(terminou?.tabuleiros).toBe(0);

    const fim = host.querySelector<HTMLElement>(".fim");
    expect(fim?.hidden).toBe(false);
    expect(fim?.querySelector(".selo")?.textContent).toBe("Acabou o tempo");
  });

  it("acaba uma vez só, por muito que o relógio continue", () => {
    ecra = abrir();

    vi.advanceTimersByTime(91_000);
    const primeiro = terminou;
    terminou = undefined;

    vi.advanceTimersByTime(30_000);
    expect(terminou).toBeUndefined();
    expect(primeiro).toBeDefined();
  });

  /**
   * O defeito que isto guarda: o `setInterval` não é fonte de verdade, é só quem
   * manda repintar. Com o separador em segundo plano — ou o telemóvel com o ecrã
   * desligado — o browser estrangula os temporizadores, e sem esta verificação
   * quem volta encontra o relógio congelado no instante em que saiu e uma
   * corrida que já devia ter acabado.
   */
  it("voltar ao ecrã acerta o relógio, mesmo sem o temporizador ter disparado", () => {
    ecra = abrir();

    // O tempo real passa, os temporizadores não correm: é o que o estrangulamento faz.
    vi.setSystemTime(200_000);

    expect(terminou).toBeUndefined();
    document.dispatchEvent(new Event("visibilitychange"));

    expect(terminou).toBeDefined();
    expect(host.querySelector<HTMLElement>(".fim")?.hidden).toBe(false);
  });

  it("sair a meio termina a corrida e regista o que se fez", () => {
    ecra = abrir();

    const sair = host.querySelector<HTMLElement>(".topo .btn.redondo");
    sair?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(terminou).toBeDefined();
    expect(saiu).toBe(1);
  });

  it("largar o ecrã não deixa o relógio a correr", () => {
    ecra = abrir();
    ecra.destruir();
    ecra = undefined;

    vi.advanceTimersByTime(200_000);

    // Sem `destruir` a limpar o intervalo e o ouvinte, isto terminava uma
    // corrida de um ecrã que já não existe.
    expect(terminou).toBeUndefined();
  });
});
