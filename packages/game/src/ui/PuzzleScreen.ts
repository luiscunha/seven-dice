/**
 * O ecrã de jogo da campanha.
 *
 * Liga a `PuzzleSession` — que não sabe o que é um pixel — ao `BoardView`. Toda
 * a regra vive na sessão; aqui só se traduz estado em DOM e toques em transições.
 *
 * Duas coisas que vêm do playtest da Fase 6 e não da especificação:
 *
 * - **Com joker, a jogada fica pendente** e confirma-se num botão. Repetir aqui
 *   a eliminação automática reintroduzia o defeito que a consola expôs: o joker
 *   gasto ao valor errado, e o tabuleiro insolúvel em silêncio.
 * - **O valor obrigatório do joker está sempre à vista.** Não se descobre a
 *   jogar — foi medido.
 */

import type { Group, Level, Packed } from "@septet/engine";
import { JOKER, cellAt, colOf, rowOf } from "@septet/engine";

import type { PuzzleState } from "../session/PuzzleSession";
import {
  restartPuzzle,
  seal,
  startPuzzle,
  undoPuzzle,
  usePuzzleHint,
} from "../session/PuzzleSession";
import {
  commit,
  isFinished,
  isPending,
  jokerInSelection,
  jokerRequiredValue,
  selectionSum,
  tap,
} from "../session/GameSession";
import { moveScore } from "../session/scoring";
import { BoardView } from "./BoardView";

const SELO_TEXTO: Readonly<Record<string, string>> = {
  perfect: "Perfeito",
  clean: "Limpo",
  completed: "Concluído",
};

export interface OpcoesPuzzleScreen {
  readonly aoTerminar?: (info: {
    readonly level: Level;
    readonly selo: string;
    readonly pontos: number;
  }) => void;
  readonly aoPedirSeguinte?: () => void;
}

export class PuzzleScreen {
  private readonly raiz: HTMLElement;
  private readonly view: BoardView;
  private readonly opcoes: OpcoesPuzzleScreen;

  private estado: PuzzleState;
  private pontos = 0;

  private readonly elTitulo: HTMLElement;
  private readonly elMeta: HTMLElement;
  private readonly elJoker: HTMLElement;
  private readonly elSoma: HTMLElement;
  private readonly elAviso: HTMLElement;
  private readonly elFim: HTMLElement;

  private readonly btEliminar: HTMLButtonElement;
  private readonly btDesfazer: HTMLButtonElement;
  private readonly btReiniciar: HTMLButtonElement;
  private readonly btDica: HTMLButtonElement;

  constructor(host: HTMLElement, level: Level, opcoes: OpcoesPuzzleScreen = {}) {
    this.opcoes = opcoes;
    this.estado = startPuzzle(level);

    this.raiz = document.createElement("div");
    this.raiz.className = "ecra";
    host.replaceChildren(this.raiz);

    /* ── topo ── */
    const topo = document.createElement("header");
    topo.className = "topo";

    this.elTitulo = document.createElement("h1");
    this.elMeta = document.createElement("div");
    this.elMeta.className = "meta";
    this.elJoker = document.createElement("div");

    const espaco = document.createElement("div");
    espaco.className = "espaco";

    topo.append(this.elTitulo, espaco, this.elJoker, this.elMeta);

    /* ── palco ── */
    const palco = document.createElement("div");
    palco.className = "palco";

    /* ── rodapé ── */
    const rodape = document.createElement("footer");
    rodape.className = "rodape";

    const linha = document.createElement("div");
    linha.className = "linha-selecao";

    this.elSoma = document.createElement("div");
    this.elSoma.className = "soma";
    this.elAviso = document.createElement("div");
    this.elAviso.className = "aviso";
    this.elAviso.setAttribute("role", "status");

    linha.append(this.elSoma, this.elAviso);

    const acoes = document.createElement("div");
    acoes.className = "acoes";

    this.btEliminar = botao("Eliminar", "primario");
    this.btDesfazer = botao("Desfazer");
    this.btReiniciar = botao("Reiniciar");
    this.btDica = botao("Dica");

    acoes.append(this.btEliminar, this.btDesfazer, this.btReiniciar, this.btDica);

    this.elFim = document.createElement("div");
    this.elFim.className = "fim";
    this.elFim.hidden = true;

    rodape.append(linha, acoes, this.elFim);
    this.raiz.append(topo, palco, rodape);

    this.view = new BoardView(palco, { aoTocar: (p) => void this.tocar(p) });
    this.view.dimensionarPara(level.board);
    this.view.montar(level.board);

    this.btEliminar.addEventListener("click", () => void this.confirmar());
    this.btDesfazer.addEventListener("click", () => {
      this.desfazer();
    });
    this.btReiniciar.addEventListener("click", () => {
      this.reiniciar();
    });
    this.btDica.addEventListener("click", () => {
      this.pedirDica();
    });

    this.pintar();
  }

  destruir(): void {
    this.view.destruir();
    this.raiz.remove();
  }

  /* ─── ações ─────────────────────────────────────────────────────────────── */

  private async tocar(p: Packed): Promise<void> {
    const antes = this.estado.game;
    if (isFinished(antes)) return;

    // O grupo é a seleção mais a peça tocada — capturado antes, porque a sessão
    // limpa a seleção assim que a jogada acontece.
    const candidato = [...antes.selection, p];
    const jogo = tap(antes, p);

    this.estado = { ...this.estado, game: jogo };
    this.view.marcarSugestao(undefined);

    if (jogo.history.length > antes.history.length) {
      await this.animarJogada(candidato);
    }

    this.pintar();
  }

  private async confirmar(): Promise<void> {
    const antes = this.estado.game;
    if (!isPending(antes)) return;

    const candidato = [...antes.selection];
    this.estado = { ...this.estado, game: commit(antes) };

    await this.animarJogada(candidato);
    this.pintar();
  }

  private async animarJogada(candidato: readonly Packed[]): Promise<void> {
    const grupo = [...candidato].sort((a, b) => a - b) as Group;
    this.pontos += moveScore(grupo.length, 1);
    await this.view.aplicarJogada(grupo);
  }

  private desfazer(): void {
    this.estado = undoPuzzle(this.estado);
    this.view.montar(this.estado.game.board);
    this.view.marcarSugestao(undefined);
    this.pintar();
  }

  private reiniciar(): void {
    this.estado = restartPuzzle(this.estado);
    this.pontos = 0;
    this.view.montar(this.estado.game.board);
    this.view.marcarSugestao(undefined);
    this.pintar();
  }

  private pedirDica(): void {
    const { state, result } = usePuzzleHint(this.estado);
    this.estado = state;

    if (result?.group !== undefined) {
      this.view.marcarSugestao(result.group);
    }

    this.pintar();
  }

  /* ─── desenho ───────────────────────────────────────────────────────────── */

  private pintar(): void {
    const jogo = this.estado.game;
    const nivel = jogo.level;

    this.elTitulo.textContent = nivel.id;

    const restantes = jogo.board.reduce((n, col) => n + col.length, 0);
    const total = nivel.metrics?.pieces ?? restantes;

    this.elMeta.replaceChildren(
      texto(`${String(restantes)}/${String(total)} peças`),
      texto(`${String(jogo.moves)} jogadas`),
      texto(`${String(this.pontos)} pontos`),
    );

    this.pintarJoker();
    this.pintarSelecao();
    this.view.marcarSelecao(new Set(jogo.selection));

    this.btEliminar.hidden = !isPending(jogo);
    this.btDesfazer.disabled =
      jogo.selection.length === 0 && jogo.history.length === 0;
    this.btDica.disabled = this.estado.hintsLeft <= 0 || isFinished(jogo);

    this.btDica.replaceChildren(
      texto("Dica"),
      spanContador(` ${String(this.estado.hintsLeft)}`),
    );

    this.pintarFim();
  }

  private pintarJoker(): void {
    const valor = jokerRequiredValue(this.estado.game.board);

    if (valor === undefined) {
      this.elJoker.replaceChildren();
      this.elJoker.className = "";
      return;
    }

    this.elJoker.className = "joker-valor";
    this.elJoker.replaceChildren(texto("o joker vale"), forte(String(valor)));
  }

  private pintarSelecao(): void {
    const jogo = this.estado.game;

    if (jogo.selection.length === 0) {
      this.elSoma.replaceChildren(texto("Toca nas peças para somar 7"));
      this.elSoma.classList.add("vazia");
      this.elAviso.replaceChildren();
      return;
    }

    this.elSoma.classList.remove("vazia");

    const parcelas = jogo.selection
      .map((p) => {
        const v = cellAt(jogo.board, p);
        return v === JOKER ? "✳" : String(v ?? "?");
      })
      .join(" + ");

    const soma = selectionSum(jogo.board, jogo.selection);

    this.elSoma.replaceChildren(
      spanParcelas(`${parcelas} = `),
      texto(String(soma)),
    );

    this.pintarAviso();
  }

  /**
   * A mensagem tem de dizer **o que fazer**, não só o que se passa.
   *
   * Dizer "junta mais peças" quando o joker já está no valor obrigatório empurra
   * o jogador para o erro exato que a pendência existe para evitar — foi o que
   * aconteceu no playtest.
   */
  private pintarAviso(): void {
    const jogo = this.estado.game;
    const joker = jokerInSelection(jogo);

    if (joker !== undefined) {
      this.elAviso.dataset["tipo"] = "convite";

      if (joker.required === undefined) {
        this.elAviso.replaceChildren(
          marca("▸"),
          texto(`o joker fica a ${String(joker.taking)}`),
        );
      } else if (joker.taking === joker.required) {
        this.elAviso.replaceChildren(
          marca("▸"),
          texto(
            `o joker fica a ${String(joker.taking)}, que é o valor certo`,
          ),
        );
      } else {
        this.elAviso.replaceChildren(
          marca("▸"),
          texto(
            `ficaria a ${String(joker.taking)}, mas tem de valer ` +
              `${String(joker.required)} — junta ou tira peças`,
          ),
        );
      }
      return;
    }

    if (jogo.rejection === "over-target") {
      this.elAviso.dataset["tipo"] = "erro";
      this.elAviso.replaceChildren(marca("⚠"), texto("essa peça passava de 7"));
      return;
    }

    if (jogo.rejection === "joker-cap") {
      this.elAviso.dataset["tipo"] = "erro";
      this.elAviso.replaceChildren(
        marca("⚠"),
        texto("com joker, as fixas não passam de 6"),
      );
      return;
    }

    this.elAviso.replaceChildren();
  }

  private pintarFim(): void {
    const jogo = this.estado.game;

    if (!isFinished(jogo)) {
      this.elFim.hidden = true;
      return;
    }

    const selo = seal(this.estado) ?? "completed";

    if (this.elFim.hidden) {
      this.opcoes.aoTerminar?.({
        level: jogo.level,
        selo,
        pontos: this.pontos,
      });
    }

    this.elFim.hidden = false;

    const titulo = document.createElement("div");
    titulo.className = "selo";
    titulo.textContent = SELO_TEXTO[selo] ?? selo;

    const detalhe = document.createElement("div");
    detalhe.className = "detalhe";
    detalhe.textContent =
      `${String(jogo.moves)} jogadas · ${String(this.pontos)} pontos · ` +
      `${String(jogo.undos)} undos · ${String(jogo.hints)} dicas`;

    this.elFim.replaceChildren(titulo, detalhe);

    if (this.opcoes.aoPedirSeguinte !== undefined) {
      const seguinte = botao("Nível seguinte", "primario");
      seguinte.addEventListener("click", () => {
        this.opcoes.aoPedirSeguinte?.();
      });
      this.elFim.appendChild(seguinte);
    }
  }
}

/* ─── fábricas ────────────────────────────────────────────────────────────── */

function botao(rotulo: string, extra?: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = extra === undefined ? "btn" : `btn ${extra}`;
  b.textContent = rotulo;
  return b;
}

const texto = (s: string): Text => document.createTextNode(s);

function forte(s: string): HTMLElement {
  const el = document.createElement("b");
  el.textContent = s;
  return el;
}

function marca(s: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "marca";
  el.textContent = s;
  return el;
}

function spanParcelas(s: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "parcelas";
  el.textContent = s;
  return el;
}

function spanContador(s: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "contador";
  el.textContent = s;
  return el;
}

/** Reexportado para os testes não terem de importar da engine. */
export const posicao = (p: Packed): readonly [number, number] => [
  colOf(p),
  rowOf(p),
];
