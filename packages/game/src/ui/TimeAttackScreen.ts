/**
 * O modo tempo.
 *
 * **Um relógio só, sempre à vista e dominante** (desenho §5.3). Não há countdown
 * por tabuleiro: cada tabuleiro limpo *acrescenta* tempo ao mesmo relógio, e a
 * corrida acaba quando o jogador deixa de acompanhar a exigência.
 *
 * **Cada ganho é anunciado onde aconteceu** — o `+3s` sobe da peça que o
 * produziu. O loop de reforço do plano §6.3 só funciona se o jogador ligar a
 * jogada ao prémio, e um número que aparece no cabeçalho não se liga a nada.
 *
 * **Sem undo, e não é restrição escondida.** Os níveis desta banda são
 * greedy-safe: não há como bloquear, portanto não há nada que desfazer.
 *
 * O relógio do sistema entra aqui e só aqui. A `TimeAttackSession` recebe `now`
 * por parâmetro — é o que a torna testável — e é este ecrã que lho dá.
 */

import type { Group, Level, Packed } from "@septet/engine";
import { colOf, mulberry32, rowOf, shuffled } from "@septet/engine";

import { selectionTotal } from "../session/GameSession";
import type {
  TimeAttackConfig,
  TimeAttackState,
} from "../session/TimeAttackSession";
import {
  DEFAULT_TIME_ATTACK,
  isOver,
  nextBoard,
  remainingMs,
  startTimeAttack,
  tapTimeAttack,
} from "../session/TimeAttackSession";
import { BoardView } from "./BoardView";
import { botao, elemento, texto } from "./dom";

/** De quanto em quanto o relógio se repinta. Décimos chegam, e custam pouco. */
const PASSO_RELOGIO = 100;

export interface OpcoesTimeAttack {
  readonly niveis: readonly Level[];
  readonly aoTerminar: (info: {
    readonly pontos: number;
    readonly tabuleiros: number;
  }) => void;
  readonly aoSair: () => void;
  readonly melhorPontuacao: number;
  /**
   * Segundos de arranque. O plano §6.3 pede um começo generoso, mas quanto é
   * generoso é número de playtest — daí ser uma definição e não uma constante.
   */
  readonly tempoInicial: number;
}

export class TimeAttackScreen {
  private readonly raiz: HTMLElement;
  private readonly view: BoardView;
  private readonly palco: HTMLElement;
  private readonly opcoes: OpcoesTimeAttack;

  private readonly elRelogio: HTMLElement;
  private readonly elMeta: HTMLElement;
  private readonly elSoma: HTMLElement;
  private readonly elFim: HTMLElement;

  private estado: TimeAttackState;
  private readonly config: TimeAttackConfig;
  private ordem: readonly Level[];
  private indice = 0;
  private cronometro: ReturnType<typeof setInterval> | undefined;
  private readonly aoVoltarAoEcra: () => void;
  private terminado = false;

  constructor(host: HTMLElement, opcoes: OpcoesTimeAttack) {
    this.opcoes = opcoes;

    /*
     * A ordem muda a cada corrida — jogar duas vezes seguidas os mesmos
     * tabuleiros pela mesma ordem transformava o modo num exercício de memória.
     * A seed vem do relógio: aqui não há nada a reproduzir.
     */
    this.ordem = shuffled(mulberry32(Date.now() >>> 0), opcoes.niveis);

    const primeiro = this.ordem[0];
    if (primeiro === undefined) throw new Error("não há níveis para o modo tempo");

    this.config = {
      ...DEFAULT_TIME_ATTACK,
      initialMs: opcoes.tempoInicial * 1000,
    };

    this.estado = startTimeAttack(primeiro, Date.now(), this.config);

    this.raiz = elemento("div", "ecra tempo");

    /* ── topo: o relógio manda ── */
    const topo = elemento("header", "topo tempo-topo");

    const sair = botao("‹", "redondo", () => {
      this.terminar();
      opcoes.aoSair();
    });
    sair.setAttribute("aria-label", "sair da corrida");

    this.elRelogio = elemento("div", "relogio");
    this.elRelogio.setAttribute("role", "timer");
    this.elMeta = elemento("div", "meta");

    topo.append(sair, this.elRelogio, this.elMeta);

    /* ── palco ── */
    this.palco = elemento("div", "palco");

    /* ── rodapé ── */
    const rodape = elemento("footer", "rodape");
    this.elSoma = elemento("div", "soma");
    this.elFim = elemento("div", "fim");
    this.elFim.hidden = true;
    rodape.append(this.elSoma, this.elFim);

    this.raiz.append(topo, this.palco, rodape);
    host.replaceChildren(this.raiz);

    this.view = new BoardView(this.palco, {
      aoTocar: (p) => void this.tocar(p),
    });
    this.view.dimensionarPara(primeiro.board);
    this.view.montar(primeiro.board);

    this.cronometro = setInterval(() => {
      this.tique();
    }, PASSO_RELOGIO);

    /*
     * O `setInterval` não é fonte de verdade — é só quem manda repintar. O tempo
     * vive no `deadlineAt` e lê-se sempre de `Date.now()`.
     *
     * A distinção passa a importar quando o separador vai para segundo plano: o
     * browser estrangula os temporizadores, e num telemóvel com o ecrã desligado
     * pára-os de vez. Sem isto, quem volta encontra o relógio congelado no
     * instante em que saiu e uma corrida que já devia ter acabado. Verificar ao
     * regressar resolve-o na hora.
     */
    this.aoVoltarAoEcra = () => {
      this.tique();
    };
    document.addEventListener("visibilitychange", this.aoVoltarAoEcra);

    this.pintar();
  }

  destruir(): void {
    this.pararRelogio();
    document.removeEventListener("visibilitychange", this.aoVoltarAoEcra);
    this.view.destruir();
    this.raiz.remove();
  }

  /* ─── jogar ─────────────────────────────────────────────────────────────── */

  private async tocar(p: Packed): Promise<void> {
    if (this.terminado) return;

    const antes = this.estado;
    const selecao = [...antes.game.selection, p];

    const r = tapTimeAttack(antes, p, Date.now(), { time: this.config });
    this.estado = r.state;

    if (r.moved) {
      // A âncora do anúncio calcula-se **antes** de as peças saírem: depois já
      // não há de onde o `+3s` subir.
      if (r.gainedMs > 0) this.anunciar(r.gainedMs, selecao);

      const grupo = [...selecao].sort((a, b) => a - b) as Group;
      await this.view.aplicarJogada(grupo);

      if (r.cleared) this.avancarTabuleiro();
    }

    this.pintar();
  }

  private avancarTabuleiro(): void {
    this.indice = (this.indice + 1) % this.ordem.length;

    const seguinte = this.ordem[this.indice];
    if (seguinte === undefined) return;

    this.estado = nextBoard(this.estado, seguinte);
    this.view.dimensionarPara(seguinte.board);
    this.view.montar(seguinte.board);
  }

  /* ─── relógio ───────────────────────────────────────────────────────────── */

  private tique(): void {
    if (this.terminado) return;

    this.pintarRelogio();
    if (isOver(this.estado, Date.now())) this.terminar();
  }

  private pararRelogio(): void {
    if (this.cronometro !== undefined) clearInterval(this.cronometro);
    this.cronometro = undefined;
  }

  private terminar(): void {
    if (this.terminado) return;

    this.terminado = true;
    this.pararRelogio();
    this.pintarRelogio();

    this.opcoes.aoTerminar({
      pontos: this.estado.score,
      tabuleiros: this.estado.boardsCleared,
    });

    this.pintarFim();
  }

  /* ─── desenho ───────────────────────────────────────────────────────────── */

  private pintar(): void {
    this.pintarRelogio();

    this.elMeta.replaceChildren(
      texto(`${String(this.estado.score)} pontos`),
      texto(`${String(this.estado.boardsCleared)} tabuleiros`),
    );

    const jogo = this.estado.game;
    this.view.marcarSelecao(new Set(jogo.selection));

    this.elSoma.textContent =
      jogo.selection.length === 0
        ? "Toca nas peças para somar 7"
        : `${String(selectionTotal(jogo))} — faltam ${String(7 - selectionTotal(jogo))}`;
  }

  /**
   * O relógio, em segundos.
   *
   * Abaixo de dez segundos passa a mostrar décimos e ganha a classe `a-acabar`.
   * Não é enfeite: é o único aviso que o modo dá, e sem ele o fim chega sem que
   * o jogador tenha tido hipótese de acelerar.
   */
  private pintarRelogio(): void {
    const ms = remainingMs(this.estado, Date.now());
    const s = ms / 1000;

    this.elRelogio.textContent = s < 10 ? s.toFixed(1) : String(Math.ceil(s));
    this.elRelogio.classList.toggle("a-acabar", s < 10);
  }

  /** O `+3s` a subir do sítio onde foi ganho. */
  private anunciar(ms: number, selecao: readonly Packed[]): void {
    const caixas = selecao
      .map((p) => this.view.caixaDe(p))
      .filter((r): r is DOMRect => r !== undefined);

    if (caixas.length === 0) return;

    const palco = this.palco.getBoundingClientRect();
    const x =
      caixas.reduce((n, r) => n + r.left + r.width / 2, 0) / caixas.length -
      palco.left;
    const y =
      caixas.reduce((n, r) => n + r.top, 0) / caixas.length - palco.top;

    const el = elemento("div", "ganho", `+${(ms / 1000).toFixed(1)}s`);
    el.style.left = `${String(Math.round(x))}px`;
    el.style.top = `${String(Math.round(y))}px`;

    this.palco.appendChild(el);
    el.addEventListener("animationend", () => {
      el.remove();
    });
  }

  private pintarFim(): void {
    this.elFim.hidden = false;

    const recorde = this.estado.score > this.opcoes.melhorPontuacao;

    this.elFim.replaceChildren(
      elemento("div", "selo", recorde ? "Novo recorde" : "Acabou o tempo"),
      elemento(
        "div",
        "detalhe",
        `${String(this.estado.score)} pontos · ` +
          `${String(this.estado.boardsCleared)} tabuleiros limpos`,
      ),
      botao("Sair", "primario", () => {
        this.opcoes.aoSair();
      }),
    );
  }

  /** Reexportado para os testes não terem de importar da engine. */
  static posicao(p: Packed): readonly [number, number] {
    return [colOf(p), rowOf(p)];
  }
}
