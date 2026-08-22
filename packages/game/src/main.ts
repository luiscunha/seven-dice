/**
 * Arranque e navegação.
 *
 * O jogo é uma função da rota para um ecrã, e mais nada. Não há framework nem
 * router de biblioteca: são seis ecrãs e uma máquina de estados que cabe num
 * `switch` — e um router traria consigo a reconciliação por posição, que é
 * exatamente o que o `BoardView` precisa que não aconteça.
 *
 * O perfil e as preferências carregam-se uma vez e vivem aqui. Os ecrãs recebem
 * o que precisam e devolvem intenções; nenhum deles sabe gravar nada.
 */

import type { Level } from "@dicetoseven/engine";

import type { Capitulo, NivelDoCapitulo } from "./capitulos";
import { CAPITULOS, capituloDaBanda, capituloPorId, montarCapitulo } from "./capitulos";
import type { BandaNoIndice } from "./levels";
import { cabeNoEcra, carregarBanda, carregarIndice } from "./levels";
import {
  countCompleted,
  emptyProfile,
  load,
  markJokerTutorialSeen,
  recordLevel,
  recordSurvival,
  recordTimeAttack,
  save,
} from "./session/progress";
import type { Profile } from "./session/progress";
import type { Seal } from "./session/PuzzleSession";
import type { Settings, Tema, TempoInicial } from "./session/settings";
import {
  aplicarTema,
  defaultSettings,
  loadSettings,
  saveSettings,
} from "./session/settings";
import { mostraSomaDasFaces } from "./session/tutorial";
import type { CapituloNaLista } from "./ui/CapitulosScreen";
import { CapitulosScreen } from "./ui/CapitulosScreen";
import { DefinicoesScreen } from "./ui/DefinicoesScreen";
import { elemento } from "./ui/dom";
import { HomeScreen } from "./ui/HomeScreen";
import { JokerTutorial } from "./ui/JokerTutorial";
import { NiveisScreen } from "./ui/NiveisScreen";
import { PuzzleScreen } from "./ui/PuzzleScreen";
import type { Rota } from "./ui/rotas";
import { deHash, paraHash, rotaLegada } from "./ui/rotas";
import { SurvivalScreen, novaSeed } from "./ui/SurvivalScreen";
import { TimeAttackScreen } from "./ui/TimeAttackScreen";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) throw new Error("não encontrei #app");

const armazenamento =
  typeof localStorage === "undefined" ? undefined : localStorage;

let perfil: Profile =
  armazenamento === undefined ? emptyProfile() : load(armazenamento);

let preferencias: Settings =
  armazenamento === undefined ? defaultSettings() : loadSettings(armazenamento);

aplicarTema(document.documentElement, preferencias.tema);

/** Todas as bandas do índice, incluindo a do modo tempo. */
let bandas: readonly BandaNoIndice[] = [];

/**
 * A campanha, já em capítulos.
 *
 * Cinco entradas e não oito bandas: uma banda é uma receita de geração, e o
 * jogador não tem que saber que existem duas maneiras de fazer um nível médio
 * (ver `capitulos.ts`). A banda do modo tempo não entra em nenhum capítulo —
 * o corpus dos dois modos é oposto por desenho (plano §6.1).
 */
let campanha: readonly CapituloNaLista[] = [];

let idsComJoker: readonly string[] = [];

const niveisDoCapitulo = (id: string): readonly NivelDoCapitulo[] =>
  campanha.find((c) => c.capitulo.id === id)?.niveis ?? [];

/** O ecrã montado. Só um de cada vez, e é sempre este que se destrói. */
let atual: { destruir: () => void } | undefined;
let tutorial: JokerTutorial | undefined;

const guardarPerfil = (): void => {
  if (armazenamento !== undefined) save(armazenamento, perfil);
};

const guardarPreferencias = (): void => {
  if (armazenamento !== undefined) saveSettings(armazenamento, preferencias);
};

/* ─── navegação ─────────────────────────────────────────────────────────────
 *
 * `ir` escreve no histórico; a rota real vem sempre do `hashchange` que se
 * segue. Um só caminho de entrada — sem isto, navegar por código e navegar pelo
 * botão de retroceder seriam dois fluxos a manter em sincronia.
 */

const ir = (r: Rota): void => {
  location.hash = paraHash(r);
};

const voltarA = (r: Rota): (() => void) => () => {
  ir(r);
};

function resolver(): void {
  const rota = deHash(location.hash);
  void mostrar(rota);
}

async function mostrar(rota: Rota): Promise<void> {
  tutorial?.destruir();
  tutorial = undefined;
  atual?.destruir();
  atual = undefined;

  switch (rota.ecra) {
    case "home":
      atual = new HomeScreen(app as HTMLElement, {
        perfil,
        totalNiveis: campanha.reduce((n, c) => n + c.niveis.length, 0),
        aoEscolherNiveis: voltarA({ ecra: "bandas" }),
        aoEscolherTempo: voltarA({ ecra: "tempo" }),
        aoEscolherSurvival: voltarA({ ecra: "survival" }),
        aoEscolherDefinicoes: voltarA({ ecra: "definicoes" }),
      });
      return;

    case "bandas":
      atual = new CapitulosScreen(app as HTMLElement, {
        capitulos: campanha,
        perfil,
        aoEscolher: (capitulo) => {
          ir({ ecra: "niveis", capitulo });
        },
        aoVoltar: voltarA({ ecra: "home" }),
      });
      return;

    case "definicoes":
      atual = new DefinicoesScreen(app as HTMLElement, {
        tema: preferencias.tema,
        aoMudarTema: (tema: Tema) => {
          preferencias = { ...preferencias, tema };
          aplicarTema(document.documentElement, tema);
          guardarPreferencias();
        },
        tempoInicial: preferencias.tempoInicial,
        aoMudarTempoInicial: (segundos: TempoInicial) => {
          preferencias = { ...preferencias, tempoInicial: segundos };
          guardarPreferencias();
        },
        aoApagarProgresso: () => {
          perfil = emptyProfile();
          guardarPerfil();
        },
        aoVoltar: voltarA({ ecra: "home" }),
      });
      return;

    case "niveis":
      return mostrarNiveis(rota.capitulo);

    case "jogo":
      return mostrarJogo(rota.banda, rota.nivel);

    case "tempo":
      return mostrarTempo();

    case "survival":
      return mostrarSurvival(rota.seed);
  }
}

function bandaPorId(id: string): BandaNoIndice | undefined {
  return bandas.find((b) => b.id === id);
}

function mostrarNiveis(id: string): void {
  const capitulo = capituloPorId(id);
  if (capitulo === undefined) {
    ir({ ecra: "bandas" });
    return;
  }

  atual = new NiveisScreen(app as HTMLElement, {
    capitulo,
    niveis: niveisDoCapitulo(id),
    perfil,
    aoEscolher: (nivel) => {
      ir({ ecra: "jogo", banda: nivel.banda, nivel: nivel.indice });
    },
    aoVoltar: voltarA({ ecra: "bandas" }),
  });
}

async function mostrarJogo(id: string, indice: number): Promise<void> {
  const banda = bandaPorId(id);
  if (banda === undefined) {
    ir({ ecra: "bandas" });
    return;
  }

  const niveis = await carregarBanda(id);
  const nivel = niveis[indice];

  if (nivel === undefined) {
    const cap = capituloDaBanda(id);
    ir(cap === undefined ? { ecra: "bandas" } : { ecra: "niveis", capitulo: cap.id });
    return;
  }

  const temJoker = nivel.joker !== undefined;
  const feitos = countCompleted(perfil, idsComJoker);

  /*
   * O capítulo é quem manda no «seguinte» e no «voltar». Uma banda com joker
   * está intercalada noutra, portanto seguir a ordem da banda saltaria por cima
   * de metade do capítulo — e a seta de voltar levaria a uma lista onde este
   * nível nem aparece.
   */
  const capitulo: Capitulo | undefined = capituloDaBanda(id);
  const sequencia = capitulo === undefined ? [] : niveisDoCapitulo(capitulo.id);
  const posicao = sequencia.findIndex(
    (n) => n.banda === id && n.indice === indice,
  );

  const paraALista: Rota =
    capitulo === undefined
      ? { ecra: "bandas" }
      : { ecra: "niveis", capitulo: capitulo.id };

  atual = new PuzzleScreen(app as HTMLElement, nivel, {
    aoTerminar: ({ level, selo, pontos }) => {
      perfil = recordLevel(perfil, level.id, selo as Seal, pontos);
      guardarPerfil();
    },
    aoPedirSeguinte: () => {
      const seguinte = posicao < 0 ? undefined : sequencia[posicao + 1];

      // No último nível do capítulo, o seguinte é a própria lista.
      if (seguinte === undefined) ir(paraALista);
      else ir({ ecra: "jogo", banda: seguinte.banda, nivel: seguinte.indice });
    },
    aoVoltar: voltarA(paraALista),
    aoPedirAjuda: () => {
      abrirTutorial(true);
    },
    mostrarSomaDasFaces: temJoker && mostraSomaDasFaces(feitos),
  });

  /*
   * O tutorial é obrigatório à primeira, e abre **por cima** do nível em vez de
   * o preceder: o jogador vê o tabuleiro que vai jogar por trás, e o tutorial
   * deixa de parecer um ecrã que se atravessa para chegar ao jogo.
   */
  if (temJoker && !perfil.sawJokerTutorial) abrirTutorial(false);
}

async function mostrarTempo(): Promise<void> {
  const banda = bandaPorId("tempo");
  if (banda === undefined) {
    ir({ ecra: "home" });
    return;
  }

  /*
   * A mesma regra de largura da campanha. Hoje a banda do Contra-Relógio não tem
   * um único tabuleiro largo, mas confiar nisso era confiar numa coincidência do
   * pack atual.
   */
  const niveis: readonly Level[] = (await carregarBanda("tempo")).filter((n) =>
    cabeNoEcra(n.board.length),
  );

  atual = new TimeAttackScreen(app as HTMLElement, {
    niveis,
    melhorPontuacao: perfil.bestTimeAttackScore,
    tempoInicial: preferencias.tempoInicial,
    aoTerminar: ({ pontos, tabuleiros }) => {
      perfil = recordTimeAttack(perfil, pontos, tabuleiros);
      guardarPerfil();
    },
    aoSair: voltarA({ ecra: "home" }),
  });
}

/**
 * O Survival.
 *
 * Não carrega pack nenhum — o tabuleiro nasce da seed. É o único modo assim, e
 * é o que o torna partilhável: a seed vai no endereço, portanto passar o link é
 * passar a corrida exata.
 *
 * Sem seed no URL sorteia-se uma e **reescreve-se o endereço**, para que a
 * corrida que está a acontecer tenha sempre nome. Sem isso, acabar uma corrida
 * boa e não a poder mostrar a ninguém era o desperdício óbvio.
 */
function mostrarSurvival(seed: number | undefined): void {
  if (seed === undefined) {
    ir({ ecra: "survival", seed: novaSeed() });
    return;
  }

  atual = new SurvivalScreen(app as HTMLElement, {
    seed,
    melhorPontuacao: perfil.bestSurvivalScore,
    aoTerminar: ({ pontos, linhas }) => {
      perfil = recordSurvival(perfil, pontos, linhas);
      guardarPerfil();
    },
    aoRecomecar: (nova) => {
      ir({ ecra: "survival", seed: nova });
    },
    aoSair: voltarA({ ecra: "home" }),
  });
}

function abrirTutorial(revisao: boolean): void {
  tutorial?.destruir();

  tutorial = new JokerTutorial(app as HTMLElement, {
    revisao,
    aoFechar: () => {
      tutorial?.destruir();
      tutorial = undefined;

      perfil = markJokerTutorialSeen(perfil);
      guardarPerfil();
    },
  });
}

function mostrarMensagem(texto: string): void {
  const el = elemento("div", "ecra", texto);
  el.style.placeContent = "center";
  (app as HTMLElement).replaceChildren(el);
}

async function arrancar(): Promise<void> {
  try {
    bandas = await carregarIndice();

    campanha = CAPITULOS.map((capitulo) => ({
      capitulo,
      niveis: montarCapitulo(capitulo, bandas),
    })).filter((c) => c.niveis.length > 0);

    idsComJoker = bandas.flatMap((b) =>
      b.niveis.filter((n) => n.joker === true).map((n) => n.id),
    );

    // Os links antigos, `?banda=perito&nivel=27`, continuam a levar ao sítio.
    const legada = rotaLegada(location.search);
    if (legada !== undefined) {
      history.replaceState(null, "", paraHash(legada));
    }

    window.addEventListener("hashchange", resolver);
    resolver();
  } catch (erro) {
    mostrarMensagem(
      erro instanceof Error ? erro.message : "não consegui carregar os níveis",
    );
  }
}

void arrancar();
