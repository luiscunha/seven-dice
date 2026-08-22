// @vitest-environment jsdom

/**
 * Navegação, preferências e modo tempo.
 *
 * As rotas e as preferências são funções puras e testam-se como tal. O modo
 * tempo não: depende do relógio, e é precisamente aí que está o que vale a pena
 * proteger — **a corrida tem de acabar mesmo quando o temporizador não dispara**.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Level } from "@dicetoseven/engine";

import type { NivelDoCapitulo } from "../src/capitulos";
import {
  CADENCIA_JOKER,
  CAPITULOS,
  capituloDaBanda,
  capituloPorId,
  montarCapitulo,
} from "../src/capitulos";
import type { BandaNoIndice } from "../src/levels";
import { LARGURA_MAXIMA, cabeNoEcra } from "../src/levels";

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
    { ecra: "niveis", capitulo: "perito" },
    { ecra: "jogo", banda: "meio-joker", nivel: 12 },
    { ecra: "tempo" },
    { ecra: "survival", seed: 20260822 },
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

  it("nomes com hífen sobrevivem à codificação", () => {
    const r: Rota = { ecra: "niveis", capitulo: "avancado" };
    expect(paraHash(r)).toBe("#/puzzles/avancado");
    expect(deHash(paraHash(r))).toEqual(r);
  });

  /* O nome antigo da rota continua a ser aceite à entrada, e sai já com o novo. */
  it("«niveis» ainda entra, e «tempo» também", () => {
    expect(deHash("#/niveis/perito")).toEqual({ ecra: "niveis", capitulo: "perito" });
    expect(deHash("#/tempo")).toEqual({ ecra: "tempo" });
    expect(paraHash({ ecra: "tempo" })).toBe("#/contrarrelogio");
  });

  /* Há links `?banda=…` espalhados por notas e conversas; traduzi-los é uma linha. */
  it("a seed do Survival sobrevive ao endereço — é o que torna a corrida partilhável", () => {
    expect(deHash("#/survival/20260822")).toEqual({ ecra: "survival", seed: 20260822 });

    // Sem seed, o modo sorteia uma: a rota não a inventa aqui.
    expect(deHash("#/survival")).toEqual({ ecra: "survival" });

    // Uma seed absurda não trava nada — sorteia-se outra.
    expect(deHash("#/survival/abc")).toEqual({ ecra: "survival" });
    expect(deHash("#/survival/-3")).toEqual({ ecra: "survival" });
  });

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

  const abrir = (segundos: 30 | 60 | 90 = 60): TimeAttackScreen =>
    new TimeAttackScreen(host, {
      niveis: [nivel("tempo-1"), nivel("tempo-2")],
      melhorPontuacao: 0,
      tempoInicial: segundos,
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

  it("o tempo de arranque vem das definições", () => {
    for (const segundos of [30, 60, 90] as const) {
      ecra?.destruir();
      ecra = abrir(segundos);
      expect(host.querySelector(".relogio")?.textContent).toBe(String(segundos));
    }
  });

  it("o relógio mostra décimos nos últimos dez segundos", () => {
    ecra = abrir();

    const relogio = host.querySelector(".relogio");
    expect(relogio?.textContent).toBe("60");
    expect(relogio?.classList.contains("a-acabar")).toBe(false);

    vi.advanceTimersByTime(55_000);

    expect(relogio?.textContent).toBe("5.0");
    expect(relogio?.classList.contains("a-acabar")).toBe(true);
  });

  it("a corrida acaba quando o tempo passa, e o resultado é registado", () => {
    ecra = abrir();

    vi.advanceTimersByTime(61_000);

    expect(terminou).toBeDefined();
    expect(terminou?.tabuleiros).toBe(0);

    const fim = host.querySelector<HTMLElement>(".fim");
    expect(fim?.hidden).toBe(false);
    expect(fim?.querySelector(".selo")?.textContent).toBe("Acabou o tempo");
  });

  it("acaba uma vez só, por muito que o relógio continue", () => {
    ecra = abrir();

    vi.advanceTimersByTime(61_000);
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

  it("sair a meio pergunta antes, e só depois termina a corrida", () => {
    ecra = abrir();

    const sair = host.querySelector<HTMLElement>(".topo .btn.redondo");
    sair?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    /*
     * O primeiro toque **não** sai. Num telemóvel a seta fica onde o polegar já
     * está, e um toque por engano custava a corrida inteira.
     */
    expect(terminou).toBeUndefined();
    expect(saiu).toBe(0);

    const caixa = host.querySelector("dialog.confirmacao");
    expect(caixa).not.toBeNull();

    const confirmar = [...(caixa?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Sair",
    );
    confirmar?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(terminou).toBeDefined();
    expect(saiu).toBe(1);
  });

  it("cancelar a saída deixa a corrida onde estava", () => {
    ecra = abrir();

    host
      .querySelector<HTMLElement>(".topo .btn.redondo")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const caixa = host.querySelector("dialog.confirmacao");
    [...(caixa?.querySelectorAll("button") ?? [])]
      .find((b) => b.textContent === "Cancelar")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(terminou).toBeUndefined();
    expect(saiu).toBe(0);
    expect(host.querySelector("dialog.confirmacao")).toBeNull();
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

/* ─── Capítulos ─────────────────────────────────────────────────────────────
 *
 * A campanha mostra cinco capítulos, e não as oito bandas do pipeline. As bandas
 * não se fundem porque não podem — a `meio` aceita sobrevivência de 30–55% e a
 * `meio-joker` de 2–15%, e nenhum tabuleiro cumpre as duas. É uma restrição de
 * geração, e a apresentação não a tem.
 *
 * O que aqui se protege é a intercalação: **um em cada três**, determinística, e
 * a consumir a banda base toda.
 */

describe("capítulos", () => {
  const banda = (id: string, n: number): BandaNoIndice => ({
    id,
    label: id,
    niveis: Array.from({ length: n }, (_, i) => ({
      id: `${id}-${String(i)}`,
      pieces: 12,
    })),
  });

  const BANDAS: readonly BandaNoIndice[] = [
    banda("meio", 30),
    banda("meio-joker", 30),
    banda("avancado", 30),
    banda("denso", 30),
    banda("perito", 30),
    banda("tutorial", 30),
    banda("inicio", 30),
  ];

  const montar = (id: string): readonly NivelDoCapitulo[] => {
    const c = capituloPorId(id);
    if (c === undefined) throw new Error(`sem capítulo ${id}`);
    return montarCapitulo(c, BANDAS);
  };

  it("são cinco, e nenhum se chama como uma banda de joker", () => {
    expect(CAPITULOS).toHaveLength(5);
    expect(CAPITULOS.map((c) => c.nome)).toEqual([
      "Tutorial",
      "Iniciado",
      "Médio",
      "Avançado",
      "Perito",
    ]);
  });

  it("um capítulo sem joker é a banda tal e qual", () => {
    const perito = montar("perito");

    expect(perito).toHaveLength(30);
    expect(perito.every((n) => n.banda === "perito")).toBe(true);
    expect(perito.map((n) => n.indice)).toEqual(
      Array.from({ length: 30 }, (_, i) => i),
    );
  });

  it("um capítulo com joker intercala um em cada três", () => {
    const medio = montar("medio");

    expect(medio).toHaveLength(45);

    medio.forEach((n, i) => {
      const esperada = (i + 1) % CADENCIA_JOKER === 0 ? "meio-joker" : "meio";
      expect(n.banda).toBe(esperada);
    });
  });

  /* A base é quem define o comprimento: não pode ficar um nível por jogar. */
  it("consome a banda base toda, e sem repetir", () => {
    for (const id of ["medio", "avancado"]) {
      const niveis = montar(id);
      const capitulo = capituloPorId(id);

      const daBase = niveis.filter((n) => n.banda === capitulo?.base);
      expect(daBase).toHaveLength(30);
      expect(daBase.map((n) => n.indice)).toEqual(
        Array.from({ length: 30 }, (_, i) => i),
      );

      expect(new Set(niveis.map((n) => n.id)).size).toBe(niveis.length);
    }
  });

  /*
   * Sobram 15 de cada banda com joker. Está assumido — são o corpo natural do
   * puzzle diário — mas se um dia deixar de ser verdade, é aqui que se vê.
   */
  it("deixa metade dos níveis com joker por usar, e é assumido", () => {
    const comJoker = montar("medio").filter((n) => n.banda === "meio-joker");
    expect(comJoker).toHaveLength(15);
  });

  it("é determinística — «o nível 12 do Médio» quer dizer sempre o mesmo", () => {
    expect(montar("medio")).toEqual(montar("medio"));
  });

  it("cada banda da campanha sabe a que capítulo pertence", () => {
    expect(capituloDaBanda("meio")?.id).toBe("medio");
    expect(capituloDaBanda("meio-joker")?.id).toBe("medio");
    expect(capituloDaBanda("denso")?.id).toBe("avancado");
    expect(capituloDaBanda("perito")?.id).toBe("perito");

    // A do modo tempo não pertence a nenhum: o corpus dos dois modos é oposto.
    expect(capituloDaBanda("tempo")).toBeUndefined();
  });

  it("uma banda que falte no índice não rebenta o capítulo", () => {
    const capitulo = capituloPorId("medio");
    if (capitulo === undefined) throw new Error("sem capítulo");

    const soBase = montarCapitulo(capitulo, [banda("meio", 30)]);
    expect(soBase).toHaveLength(30);
    expect(soBase.every((n) => n.banda === "meio")).toBe(true);
  });
});

/* ─── Largura e telemóvel ───────────────────────────────────────────────────
 *
 * Mais de 80% de quem vai testar usa telemóvel. Até sete colunas as peças ficam
 * nos 44px de piso de toque num ecrã de 360; oito dão 38 e onze dão 26. É
 * largura, e largura não se recupera com enchimento — a única saída é os
 * tabuleiros largos não entrarem na campanha.
 *
 * Continuam no pack e continuam válidos. O que se protege aqui é que ficam de
 * fora, e que **o índice na banda não é renumerado** por causa disso: é ele que
 * vai na rota.
 */

describe("largura e telemóvel", () => {
  const comLargura = (
    id: string,
    larguras: readonly number[],
  ): BandaNoIndice => ({
    id,
    label: id,
    niveis: larguras.map((colunas, i) => ({
      id: `${id}-${String(i)}`,
      pieces: 20,
      colunas,
    })),
  });

  it("o teto são sete colunas", () => {
    expect(LARGURA_MAXIMA).toBe(7);
    expect(cabeNoEcra(7)).toBe(true);
    expect(cabeNoEcra(8)).toBe(false);
    expect(cabeNoEcra(11)).toBe(false);
  });

  /* Um índice gerado antes desta regra não traz a largura: deixa-se jogar. */
  it("sem largura conhecida, o nível entra", () => {
    expect(cabeNoEcra(undefined)).toBe(true);
  });

  it("os tabuleiros largos não entram no capítulo", () => {
    const capitulo = capituloPorId("perito");
    if (capitulo === undefined) throw new Error("sem capítulo");

    const niveis = montarCapitulo(capitulo, [
      comLargura("perito", [5, 9, 6, 11, 7, 8]),
    ]);

    expect(niveis.map((n) => n.id)).toEqual([
      "perito-0",
      "perito-2",
      "perito-4",
    ]);
  });

  /**
   * O ponto mais fácil de partir num refactor: se o índice fosse recalculado
   * depois de filtrar, `#/jogo/perito/2` passava a abrir outro nível.
   */
  it("o índice na banda não é renumerado pela filtragem", () => {
    const capitulo = capituloPorId("perito");
    if (capitulo === undefined) throw new Error("sem capítulo");

    const niveis = montarCapitulo(capitulo, [
      comLargura("perito", [9, 5, 6]),
    ]);

    // O primeiro nível jogável é o segundo do ficheiro, e tem de o dizer.
    expect(niveis[0]).toEqual({ id: "perito-1", banda: "perito", indice: 1 });
    expect(niveis[1]).toEqual({ id: "perito-2", banda: "perito", indice: 2 });
  });

  it("a filtragem também vale para a banda intercalada", () => {
    const capitulo = capituloPorId("medio");
    if (capitulo === undefined) throw new Error("sem capítulo");

    const niveis = montarCapitulo(capitulo, [
      comLargura("meio", [5, 5, 5, 5]),
      comLargura("meio-joker", [9, 9, 6]),
    ]);

    const jokers = niveis.filter((n) => n.banda === "meio-joker");
    expect(jokers).toHaveLength(1);
    expect(jokers[0]?.indice).toBe(2);
  });
});
