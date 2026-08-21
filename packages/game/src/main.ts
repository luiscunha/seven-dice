/**
 * Arranque do jogo.
 *
 * Ainda sem ecrã de níveis nem modo tempo — carrega a primeira banda e joga-a
 * em sequência. É o suficiente para o tabuleiro, a seleção e a animação estarem
 * a ser exercidos a sério, que é o que a ordem de construção do desenho §8 pede
 * antes de haver meta-jogo.
 */

import type { Level } from "@septet/engine";

import { carregarBanda, carregarIndice } from "./levels";
import {
  countCompleted,
  emptyProfile,
  load,
  markJokerTutorialSeen,
  recordLevel,
  save,
} from "./session/progress";
import type { Profile } from "./session/progress";
import type { Seal } from "./session/PuzzleSession";
import { mostraSomaDasFaces } from "./session/tutorial";
import { JokerTutorial } from "./ui/JokerTutorial";
import { PuzzleScreen } from "./ui/PuzzleScreen";

const app = document.querySelector<HTMLElement>("#app");

if (app === null) {
  throw new Error("não encontrei #app");
}

const armazenamento =
  typeof localStorage === "undefined" ? undefined : localStorage;

let perfil: Profile = armazenamento === undefined
  ? emptyProfile()
  : load(armazenamento);

let ecra: PuzzleScreen | undefined;
let tutorial: JokerTutorial | undefined;
let niveis: readonly Level[] = [];
let indice = 0;

/** Todos os níveis com joker do pack, na ordem da campanha. Vem do índice. */
let idsComJoker: readonly string[] = [];

const guardar = (): void => {
  if (armazenamento !== undefined) save(armazenamento, perfil);
};

function jogar(i: number): void {
  const nivel = niveis[i];
  if (nivel === undefined) {
    mostrarMensagem("Acabaste a banda. Por agora, é tudo.");
    return;
  }

  indice = i;
  ecra?.destruir();

  const temJoker = nivel.joker !== undefined;
  const feitos = countCompleted(perfil, idsComJoker);

  ecra = new PuzzleScreen(app as HTMLElement, nivel, {
    aoTerminar: ({ level, selo, pontos }) => {
      perfil = recordLevel(perfil, level.id, selo as Seal, pontos);
      guardar();
    },
    aoPedirSeguinte: () => {
      jogar(indice + 1);
    },
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

function abrirTutorial(revisao: boolean): void {
  tutorial?.destruir();

  tutorial = new JokerTutorial(app as HTMLElement, {
    revisao,
    aoFechar: () => {
      tutorial?.destruir();
      tutorial = undefined;

      perfil = markJokerTutorialSeen(perfil);
      guardar();
    },
  });
}

function mostrarMensagem(texto: string): void {
  const el = document.createElement("div");
  el.className = "ecra";
  el.style.placeContent = "center";
  el.textContent = texto;
  (app as HTMLElement).replaceChildren(el);
}

/**
 * Escolha por query string, enquanto não há lista de níveis.
 *
 *   ?banda=meio-joker&nivel=3
 *
 * Não é a interface final — é o que permite chegar a qualquer nível para
 * testar, incluindo os que têm joker, sem esperar pelo ecrã de campanha.
 */
function pedido(): { readonly banda: string | null; readonly nivel: number } {
  const q = new URLSearchParams(location.search);
  const n = Number.parseInt(q.get("nivel") ?? "0", 10);
  return {
    banda: q.get("banda"),
    nivel: Number.isFinite(n) && n >= 0 ? n : 0,
  };
}

async function arrancar(): Promise<void> {
  try {
    const bandas = await carregarIndice();
    const escolha = pedido();

    idsComJoker = bandas.flatMap((b) =>
      b.niveis.filter((n) => n.joker === true).map((n) => n.id),
    );

    const banda =
      bandas.find((b) => b.id === escolha.banda) ?? bandas[0];

    if (banda === undefined) {
      mostrarMensagem("Não há níveis. Corre `pnpm septet export`.");
      return;
    }

    niveis = await carregarBanda(banda.id);
    jogar(escolha.nivel);
  } catch (erro) {
    mostrarMensagem(
      erro instanceof Error ? erro.message : "não consegui carregar os níveis",
    );
  }
}

void arrancar();
