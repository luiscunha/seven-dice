/**
 * O tabuleiro em DOM.
 *
 * Cada peça é **um elemento com identidade estável**: o mesmo nó antes e depois
 * da jogada. É isso que permite animá-la de uma posição para a outra, e é a
 * razão de não haver framework aqui — um virtual DOM que reconcilia por posição
 * trabalharia contra exatamente esta propriedade.
 *
 * As peças são posicionadas por `transform` sobre posição absoluta, não por
 * layout de fluxo: cada movimento é a transição de uma só propriedade, que o
 * browser anima sem reflow.
 *
 * **O estado lógico avança de imediato; a animação é decoração por cima.** Uma
 * jogada nova tem de encontrar o tabuleiro certo mesmo que a anterior ainda
 * esteja a correr — senão calcularia a transição contra um tabuleiro que já não
 * existe.
 *
 * As durações vêm do CSS, não daqui. É o que faz `prefers-reduced-motion`
 * funcionar de graça: o media query põe-nas a zero e este código não precisa de
 * saber que isso aconteceu.
 */

import type { Board, Cell, Group, Packed } from "@septet/engine";
import { applyMove, colOf, packed, rowOf, width } from "@septet/engine";

import type { PieceMove } from "../session/transition";
import { midpointOf, transition } from "../session/transition";
import type { ModoFace } from "./dice";
import { criarPeca, desenharFace } from "./dice";

/** Lado máximo de uma peça. Acima disto o tabuleiro fica esparso e estranho. */
const LADO_MAX = 72;

/** Piso de toque da acessibilidade. Abaixo disto marca-se, não se impede. */
export const LADO_MIN_TOQUE = 44;

export interface OpcoesBoardView {
  readonly aoTocar: (p: Packed) => void;
  readonly modoFace?: ModoFace;
}

interface Movimento {
  readonly m: PieceMove;
  readonly el: HTMLElement;
}

export class BoardView {
  private readonly host: HTMLElement;
  private readonly grelha: HTMLElement;
  private readonly aoTocar: (p: Packed) => void;

  private pecas = new Map<Packed, HTMLElement>();
  private board: Board = [];
  private modo: ModoFace;

  /** Dimensões fixadas na montagem: o tabuleiro não encolhe a meio do nível. */
  private colunas = 0;
  private linhas = 0;

  /**
   * Fecha a animação em curso, saltando para o estado final.
   *
   * Corre **sincronamente** no início da jogada seguinte. Fazê-lo por
   * temporizador deixava as duas animações a disputar as posições dos mesmos
   * elementos, e quem chegasse ao fim por último ganhava.
   */
  private fecharAnimacao: (() => void) | undefined;

  private geracao = 0;
  private readonly observador: ResizeObserver | undefined;

  constructor(host: HTMLElement, opcoes: OpcoesBoardView) {
    this.host = host;
    this.aoTocar = opcoes.aoTocar;
    this.modo = opcoes.modoFace ?? "pintas";

    this.grelha = document.createElement("div");
    this.grelha.className = "tabuleiro";
    this.grelha.setAttribute("role", "grid");
    this.grelha.setAttribute("aria-label", "tabuleiro");
    this.host.appendChild(this.grelha);

    this.grelha.addEventListener("click", (ev) => {
      const alvo = (ev.target as HTMLElement | null)?.closest(".peca");
      if (!(alvo instanceof HTMLElement)) return;

      const chave = alvo.dataset["pos"];
      if (chave === undefined) return;

      this.aoTocar(Number(chave) as Packed);
    });

    this.observador =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            this.redimensionar();
          });
    this.observador?.observe(this.host);
  }

  /** Monta um tabuleiro de raiz. Usa-se por nível, no reinício e no undo. */
  montar(board: Board): void {
    this.fecharAnimacao?.();
    this.geracao++;

    this.board = board;
    this.pecas = new Map();
    this.grelha.replaceChildren();

    this.colunas = Math.max(this.colunas, width(board));
    this.linhas = Math.max(
      this.linhas,
      board.reduce((m, col) => Math.max(m, col.length), 0),
    );

    for (let c = 0; c < board.length; c++) {
      const coluna = board[c];
      if (coluna === undefined) continue;

      for (let r = 0; r < coluna.length; r++) {
        const valor = coluna[r];
        if (valor === undefined) continue;

        const p = packed(c, r);
        const el = criarPeca(valor, this.modo);
        el.dataset["pos"] = String(p);
        this.posicionar(el, p);

        this.pecas.set(p, el);
        this.grelha.appendChild(el);
      }
    }

    this.redimensionar();
  }

  /** Fixa as dimensões da caixa a partir do tabuleiro inicial do nível. */
  dimensionarPara(board: Board): void {
    this.colunas = width(board);
    this.linhas = board.reduce((m, col) => Math.max(m, col.length), 0);
  }

  get tabuleiro(): Board {
    return this.board;
  }

  /**
   * A jogada, em três tempos: o grupo sai, a gravidade cai, as colunas deslizam.
   *
   * As três fases existem porque ver as duas transformações ao mesmo tempo era o
   * risco nº 1 do plano. O gate da Fase 6 fechou a Verde sem elas, portanto isto
   * é a mitigação desenhada e não um requisito — mas é barata.
   */
  async aplicarJogada(grupo: Group): Promise<void> {
    this.fecharAnimacao?.();

    const minha = ++this.geracao;
    const t = transition(this.board, grupo);
    const depois = applyMove(this.board, grupo);

    const aSair: HTMLElement[] = [];
    for (const p of t.removed) {
      const el = this.pecas.get(p);
      if (el !== undefined) {
        aSair.push(el);
        this.pecas.delete(p);
      }
    }

    const aMover: Movimento[] = [];
    for (const m of t.moved) {
      const el = this.pecas.get(m.from);
      if (el !== undefined) aMover.push({ m, el });
    }

    // O estado lógico avança já — ver a nota no topo do ficheiro.
    this.reindexar(t.moved);
    this.board = depois;

    this.fecharAnimacao = () => {
      this.fecharAnimacao = undefined;
      for (const el of aSair) el.remove();
      for (const { m, el } of aMover) this.posicionar(el, m.to);
    };

    for (const el of aSair) el.classList.add("a-sair");
    if (!(await this.espera("--t-saida", minha))) return;

    for (const el of aSair) el.remove();
    aSair.length = 0;

    for (const { m, el } of aMover) this.posicionar(el, midpointOf(m));
    if (!(await this.espera("--t-gravidade", minha))) return;

    for (const { m, el } of aMover) this.posicionar(el, m.to);
    if (!(await this.espera("--t-colapso", minha))) return;

    this.fecharAnimacao = undefined;
  }

  /** Retângulo de uma peça no ecrã — o seletor do joker ancora-se nele. */
  caixaDe(p: Packed): DOMRect | undefined {
    return this.pecas.get(p)?.getBoundingClientRect();
  }

  /**
   * Mostra no joker o valor que o jogador lhe deu nesta seleção.
   *
   * Sem isto o jogador escolhe 5, junta peças, e a meio já não se lembra do que
   * escolheu — que é precisamente a decisão que o nível inteiro depende.
   */
  marcarJoker(p: Packed | undefined, valor: number | undefined): void {
    for (const el of this.pecas.values()) {
      el.classList.remove("joker-escolhido");
      delete el.dataset["jokerAs"];
    }

    if (p === undefined || valor === undefined) return;

    const el = this.pecas.get(p);
    if (el === undefined) return;

    el.classList.add("joker-escolhido");
    el.dataset["jokerAs"] = String(valor);
  }

  marcarSelecao(selecao: ReadonlySet<Packed>): void {
    for (const [p, el] of this.pecas) {
      el.classList.toggle("selecionada", selecao.has(p));
    }
  }

  /** Realce temporário — a dica usa-o. */
  marcarSugestao(grupo: readonly Packed[] | undefined): void {
    for (const el of this.pecas.values()) el.classList.remove("sugerida");
    for (const p of grupo ?? []) this.pecas.get(p)?.classList.add("sugerida");
  }

  trocarModoFace(modo: ModoFace): void {
    this.modo = modo;
    for (const [p, el] of this.pecas) {
      const valor = this.valorEm(p);
      if (valor !== undefined) desenharFace(el, valor, modo);
    }
  }

  /**
   * O lado da peça sai do espaço disponível e das dimensões do tabuleiro —
   * **nunca é fixo em pixels**. É a mitigação assumida do "desktop primeiro": no
   * telemóvel fica desconfortável em vez de impossível.
   */
  redimensionar(): void {
    if (this.colunas === 0 || this.linhas === 0) return;

    const gap = this.varNum("--gap-peca");
    const caixa = this.host.getBoundingClientRect();
    if (caixa.width === 0 || caixa.height === 0) return;

    const porLargura = (caixa.width - gap * (this.colunas - 1)) / this.colunas;
    const porAltura = (caixa.height - gap * (this.linhas - 1)) / this.linhas;

    const lado = Math.max(
      12,
      Math.floor(Math.min(porLargura, porAltura, LADO_MAX)),
    );

    this.grelha.style.setProperty("--lado", `${String(lado)}px`);
    this.grelha.style.width = `${String(this.colunas * (lado + gap) - gap)}px`;
    this.grelha.style.height = `${String(this.linhas * (lado + gap) - gap)}px`;
    this.grelha.classList.toggle("apertado", lado < LADO_MIN_TOQUE);
  }

  destruir(): void {
    this.observador?.disconnect();
    this.grelha.remove();
  }

  /* ─── privados ──────────────────────────────────────────────────────────── */

  private valorEm(p: Packed): Cell | undefined {
    return this.board[colOf(p)]?.[rowOf(p)];
  }

  private posicionar(el: HTMLElement, p: Packed): void {
    el.style.setProperty("--c", String(colOf(p)));
    el.style.setProperty("--r", String(rowOf(p)));
  }

  /** `false` significa que outra jogada chegou e esta deve desistir. */
  private espera(token: string, minha: number): Promise<boolean> {
    const ms = this.varNum(token);
    if (ms <= 0) return Promise.resolve(this.geracao === minha);

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.geracao === minha);
      }, ms);
    });
  }

  /**
   * Reindexa em duas passagens: primeiro tira todos os que se movem, só depois
   * os põe nos destinos. Uma passagem só corromperia as cadeias, em que o
   * destino de uma peça é a origem de outra.
   */
  private reindexar(movimentos: readonly PieceMove[]): void {
    const soltos = new Map<Packed, HTMLElement>();

    for (const m of movimentos) {
      const el = this.pecas.get(m.from);
      if (el !== undefined) {
        soltos.set(m.from, el);
        this.pecas.delete(m.from);
      }
    }

    for (const m of movimentos) {
      const el = soltos.get(m.from);
      if (el === undefined) continue;
      el.dataset["pos"] = String(m.to);
      this.pecas.set(m.to, el);
    }
  }

  private varNum(nome: string): number {
    const bruto = getComputedStyle(document.documentElement)
      .getPropertyValue(nome)
      .trim();
    const n = Number.parseFloat(bruto);
    return Number.isFinite(n) ? n : 0;
  }
}
