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

import type { Level } from "@septet/engine";

import type { BandaNoIndice } from "./levels";
import { carregarBanda, carregarIndice } from "./levels";
import {
  countCompleted,
  emptyProfile,
  load,
  markJokerTutorialSeen,
  recordLevel,
  recordTimeAttack,
  save,
} from "./session/progress";
import type { Profile } from "./session/progress";
import type { Seal } from "./session/PuzzleSession";
import type { Settings, Tema } from "./session/settings";
import {
  aplicarTema,
  defaultSettings,
  loadSettings,
  saveSettings,
} from "./session/settings";
import { mostraSomaDasFaces } from "./session/tutorial";
import { BandasScreen } from "./ui/BandasScreen";
import { DefinicoesScreen } from "./ui/DefinicoesScreen";
import { elemento } from "./ui/dom";
import { HomeScreen } from "./ui/HomeScreen";
import { JokerTutorial } from "./ui/JokerTutorial";
import { NiveisScreen } from "./ui/NiveisScreen";
import { PuzzleScreen } from "./ui/PuzzleScreen";
import type { Rota } from "./ui/rotas";
import { deHash, paraHash, rotaLegada } from "./ui/rotas";
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
 * As que a campanha lista.
 *
 * O corpus do modo tempo é o oposto do da campanha (plano §6.1) e não tem nada
 * que fazer na lista de bandas — nem no total de níveis da Home.
 */
let campanha: readonly BandaNoIndice[] = [];

let idsComJoker: readonly string[] = [];

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
        totalNiveis: campanha.reduce((n, b) => n + b.niveis.length, 0),
        aoEscolherNiveis: voltarA({ ecra: "bandas" }),
        aoEscolherTempo: voltarA({ ecra: "tempo" }),
        aoEscolherDefinicoes: voltarA({ ecra: "definicoes" }),
      });
      return;

    case "bandas":
      atual = new BandasScreen(app as HTMLElement, {
        bandas: campanha,
        perfil,
        aoEscolher: (banda) => {
          ir({ ecra: "niveis", banda });
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
        aoApagarProgresso: () => {
          perfil = emptyProfile();
          guardarPerfil();
        },
        aoVoltar: voltarA({ ecra: "home" }),
      });
      return;

    case "niveis":
      return mostrarNiveis(rota.banda);

    case "jogo":
      return mostrarJogo(rota.banda, rota.nivel);

    case "tempo":
      return mostrarTempo();
  }
}

function bandaPorId(id: string): BandaNoIndice | undefined {
  return bandas.find((b) => b.id === id);
}

function mostrarNiveis(id: string): void {
  const banda = bandaPorId(id);
  if (banda === undefined) {
    ir({ ecra: "bandas" });
    return;
  }

  atual = new NiveisScreen(app as HTMLElement, {
    banda,
    perfil,
    aoEscolher: (nivel) => {
      ir({ ecra: "jogo", banda: id, nivel });
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
    ir({ ecra: "niveis", banda: id });
    return;
  }

  const temJoker = nivel.joker !== undefined;
  const feitos = countCompleted(perfil, idsComJoker);

  atual = new PuzzleScreen(app as HTMLElement, nivel, {
    aoTerminar: ({ level, selo, pontos }) => {
      perfil = recordLevel(perfil, level.id, selo as Seal, pontos);
      guardarPerfil();
    },
    aoPedirSeguinte: () => {
      // No último nível da banda, o seguinte é a própria lista.
      if (indice + 1 >= niveis.length) ir({ ecra: "niveis", banda: id });
      else ir({ ecra: "jogo", banda: id, nivel: indice + 1 });
    },
    aoVoltar: voltarA({ ecra: "niveis", banda: id }),
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

  const niveis: readonly Level[] = await carregarBanda("tempo");

  atual = new TimeAttackScreen(app as HTMLElement, {
    niveis,
    melhorPontuacao: perfil.bestTimeAttackScore,
    aoTerminar: ({ pontos, tabuleiros }) => {
      perfil = recordTimeAttack(perfil, pontos, tabuleiros);
      guardarPerfil();
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
    campanha = bandas.filter((b) => b.modo !== "tempo");

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
