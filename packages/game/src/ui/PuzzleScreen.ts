/**
 * O ecrã de jogo da campanha.
 *
 * Liga a `PuzzleSession` — que não sabe o que é um pixel — ao `BoardView`. Toda
 * a regra vive na sessão; aqui só se traduz estado em DOM e toques em transições.
 *
 * Duas coisas que vêm do playtest da Fase 6 e não da especificação:
 *
 * - **Tocar no joker abre a escolha do valor**, e é a escolha que faz a jogada.
 *   A eliminação automática ao primeiro grupo válido — o modelo de `[M 3.1]` —
 *   gastava o joker com a primeira peça encostada, ao valor que ela deixasse, e
 *   o tabuleiro ficava insolúvel em silêncio.
 * - **O valor obrigatório do joker nunca é mostrado.** Descobri-lo é a decisão
 *   que o joker oferece. O que se mostra, e só nos três primeiros níveis com
 *   joker, é a soma das faces — o andaime de `session/tutorial.ts`, que poupa a
 *   aritmética e não dá a resposta.
 */

import type { Group, Level, Packed } from "@dicetoseven/engine";
import { JOKER, cellAt, colOf, jokerAt, rowOf, totalSum } from "@dicetoseven/engine";

import type { PuzzleState } from "../session/PuzzleSession";
import {
  restartPuzzle,
  seal,
  startPuzzle,
  undoPuzzle,
  usePuzzleHint,
} from "../session/PuzzleSession";
import type { JokerValue } from "../session/GameSession";
import {
  isFinished,
  remainingToTarget,
  selectionTotal,
  tap,
} from "../session/GameSession";
import { moveScore } from "../session/scoring";
import { BoardView } from "./BoardView";
import { JokerPicker } from "./JokerPicker";

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

  /** Abre o tutorial do joker em revisão. Sem isto o `?` não aparece. */
  readonly aoPedirAjuda?: () => void;

  /**
   * Sobe para a grelha da banda. Sem isto a seta não aparece.
   *
   * Sobe **na hierarquia**, não no histórico: quem chega a um nível por link
   * direto não tem para onde recuar, mas tem sempre a lista acima de si.
   */
  readonly aoVoltar?: () => void;

  /**
   * O andaime dos três primeiros níveis com joker (`session/tutorial.ts`): a
   * soma das faces no cabeçalho, enquanto o joker ainda estiver no tabuleiro.
   */
  readonly mostrarSomaDasFaces?: boolean;
}

export class PuzzleScreen {
  private readonly raiz: HTMLElement;
  private readonly view: BoardView;
  private readonly picker: JokerPicker;
  private readonly opcoes: OpcoesPuzzleScreen;

  private estado: PuzzleState;
  private pontos = 0;
  private jokerPendente: Packed | undefined;

  private readonly elTitulo: HTMLElement;
  private readonly elMeta: HTMLElement;
  private readonly elSoma: HTMLElement;
  private readonly elAviso: HTMLElement;
  private readonly elFim: HTMLElement;

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

    const espaco = document.createElement("div");
    espaco.className = "espaco";

    if (opcoes.aoVoltar !== undefined) {
      const voltar = botao("‹", "redondo");
      voltar.setAttribute("aria-label", "voltar à lista");
      voltar.addEventListener("click", () => {
        opcoes.aoVoltar?.();
      });
      topo.appendChild(voltar);
    }

    topo.append(this.elTitulo, espaco, this.elMeta);

    if (opcoes.aoPedirAjuda !== undefined) {
      const ajuda = botao("?", "redondo");
      ajuda.setAttribute("aria-label", "como funciona o joker");
      ajuda.addEventListener("click", () => {
        opcoes.aoPedirAjuda?.();
      });
      topo.appendChild(ajuda);
    }

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

    this.btDesfazer = botao("Desfazer");
    this.btReiniciar = botao("Reiniciar");
    this.btDica = botao("Dica");

    acoes.append(this.btDesfazer, this.btReiniciar, this.btDica);

    this.elFim = document.createElement("div");
    this.elFim.className = "fim";
    this.elFim.hidden = true;

    rodape.append(linha, acoes, this.elFim);
    this.raiz.append(topo, palco, rodape);

    this.view = new BoardView(palco, { aoTocar: (p) => void this.tocar(p) });
    this.picker = new JokerPicker(palco, {
      aoEscolher: (valor) => void this.escolherJoker(valor),
    });
    this.view.dimensionarPara(level.board);
    this.view.montar(level.board);

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
    this.picker.destruir();
    this.view.destruir();
    this.raiz.remove();
  }

  /* ─── ações ─────────────────────────────────────────────────────────────── */

  private async tocar(p: Packed, jokerAs?: JokerValue): Promise<void> {
    const antes = this.estado.game;
    if (isFinished(antes)) return;

    /*
     * O joker não entra na seleção sem valor: o toque abre a escolha, e é a
     * escolha que faz a jogada. É o que dispensa um botão de confirmação.
     */
    if (cellAt(antes.board, p) === JOKER && jokerAs === undefined) {
      const caixa = this.view.caixaDe(p);
      if (caixa !== undefined) {
        this.jokerPendente = p;
        this.picker.abrir(caixa, antes.jokerAs);
      }
      return;
    }

    // O grupo é a seleção mais a peça tocada — capturado antes, porque a sessão
    // limpa a seleção assim que a jogada acontece.
    const candidato = antes.selection.includes(p)
      ? [...antes.selection]
      : [...antes.selection, p];
    const jogo = tap(antes, p, jokerAs);

    this.estado = { ...this.estado, game: jogo };
    this.view.marcarSugestao(undefined);

    if (jogo.history.length > antes.history.length) {
      await this.animarJogada(candidato);
    }

    this.pintar();
  }

  private async escolherJoker(valor: JokerValue): Promise<void> {
    const p = this.jokerPendente;
    this.jokerPendente = undefined;
    if (p === undefined) return;

    await this.tocar(p, valor);
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
      ...this.andaime(),
      texto(`${String(jogo.moves)} jogadas`),
      texto(`${String(this.pontos)} pontos`),
    );

    this.pintarSelecao();
    this.view.marcarSelecao(new Set(jogo.selection));

    const joker = jogo.selection.find((p) => cellAt(jogo.board, p) === JOKER);
    this.view.marcarJoker(joker, jogo.jokerAs);

    this.btDesfazer.disabled =
      jogo.selection.length === 0 && jogo.history.length === 0;
    this.btDica.disabled = this.estado.hintsLeft <= 0 || isFinished(jogo);

    this.btDica.replaceChildren(
      texto("Dica"),
      spanContador(` ${String(this.estado.hintsLeft)}`),
    );

    this.pintarFim();
  }

  /**
   * A soma das faces, enquanto o andaime durar e o joker ainda lá estiver.
   *
   * Lê-se do tabuleiro **atual** e não do inicial: cada jogada tira exatamente
   * 7, portanto o valor do joker não muda, mas o número que o jogador tem à
   * frente sim — e um número desatualizado é pior do que nenhum.
   *
   * Desaparece assim que o joker é gasto, porque a partir daí a soma é múltipla
   * de 7 e não informa nada.
   */
  private andaime(): readonly Node[] {
    if (this.opcoes.mostrarSomaDasFaces !== true) return [];

    const { board } = this.estado.game;
    if (jokerAt(board) === undefined) return [];

    return [texto(`faces somam ${String(totalSum(board))}`)];
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
        // O joker mostra-se pelo valor que o jogador lhe deu: é isso que conta
        // para a soma, e é isso que ele precisa de reler.
        if (v === JOKER) return jogo.jokerAs === undefined ? "✳" : `✳${String(jogo.jokerAs)}`;
        return String(v ?? "?");
      })
      .join(" + ");

    const soma = selectionTotal(jogo);

    /*
     * Com uma peça só, "3 = 3" não informa ninguém — e com o joker sozinho dava
     * "✳ = 0", que é pior do que inútil. A soma corrente que o plano §3.1 exige
     * aparece a partir da segunda peça, que é quando passa a haver conta.
     */
    if (jogo.selection.length === 1) {
      this.elSoma.replaceChildren(spanParcelas(parcelas));
    } else {
      this.elSoma.replaceChildren(
        spanParcelas(`${parcelas} = `),
        texto(String(soma)),
      );
    }

    this.pintarAviso();
  }

  /**
   * O aviso diz o que falta, e **nunca a resposta**.
   *
   * O valor que o joker *tem* de tomar para o tabuleiro fechar fica de fora de
   * propósito: descobri-lo é o desafio, e revelá-lo anulava a única decisão que
   * o joker oferece (`[M 2.6]`).
   */
  private pintarAviso(): void {
    const jogo = this.estado.game;

    if (jogo.rejection === "over-target") {
      this.elAviso.dataset["tipo"] = "erro";
      this.elAviso.replaceChildren(marca("⚠"), texto("essa peça passava de 7"));
      return;
    }

    const falta = remainingToTarget(jogo);

    if (falta > 0) {
      this.elAviso.dataset["tipo"] = "convite";
      this.elAviso.replaceChildren(texto(`faltam ${String(falta)}`));
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
