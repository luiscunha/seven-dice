/**
 * O ecrã do tutorial do joker.
 *
 * **É um tabuleiro a sério, não uma explicação com um desenho ao lado.** A regra
 * do joker não se descobre a jogar — isso foi medido na fase 6 — mas também não
 * se aprende a ler: o que ela tem de estranho é que escolher mal *é permitido* e
 * *não avisa*, e isso só se percebe quando acontece à frente do jogador.
 *
 * Por isso o tabuleiro é de quatro peças e duas jogadas (`session/tutorial.ts`):
 * o caminho fatal mata numa jogada e deixa duas peças à vista a somar 8. Num
 * nível a sério a mesma lição chegava dez jogadas depois e ninguém a ligava à
 * causa.
 *
 * A conta aparece aqui **com números** e nunca mais em lado nenhum — salvo o
 * andaime dos três primeiros níveis com joker (desenho §5.4).
 *
 * Não há botão de saltar. «Obrigatório» e «saltável» são a mesma coisa, e quem
 * já percebeu sai daqui em quatro toques.
 */

import type { Group, Packed } from "@septet/engine";
import { JOKER, cellAt, hasAnyGroup, totalSum } from "@septet/engine";

import type { GameState, JokerValue } from "../session/GameSession";
import { isFinished, restart, startGame, tap } from "../session/GameSession";
import { NIVEL_TUTORIAL_JOKER, contaDoJoker } from "../session/tutorial";
import { BoardView } from "./BoardView";
import { JokerPicker } from "./JokerPicker";
import type { ModoFace } from "./dice";

export interface OpcoesJokerTutorial {
  /** Corre quando o jogador sai. Só acontece depois de ele limpar o tabuleiro. */
  readonly aoFechar: () => void;
  /**
   * Modo de revisão: aberto pelo `?`, com saída sempre disponível. Da primeira
   * vez é `false` e a única saída é limpar o tabuleiro.
   */
  readonly revisao?: boolean;
  readonly modoFace?: ModoFace;
}

type Fase = "a-jogar" | "morto" | "limpo";

const CONTA = contaDoJoker(NIVEL_TUTORIAL_JOKER.board);

export class JokerTutorial {
  private readonly raiz: HTMLElement;
  private readonly view: BoardView;
  private readonly picker: JokerPicker;
  private readonly opcoes: OpcoesJokerTutorial;

  private readonly elEstado: HTMLElement;
  private readonly elAcoes: HTMLElement;

  private jogo: GameState;
  private jokerPendente: Packed | undefined;

  constructor(host: HTMLElement, opcoes: OpcoesJokerTutorial) {
    this.opcoes = opcoes;
    this.jogo = startGame(NIVEL_TUTORIAL_JOKER);

    this.raiz = document.createElement("div");
    this.raiz.className = "tutorial";
    this.raiz.setAttribute("role", "dialog");
    this.raiz.setAttribute("aria-modal", "true");
    this.raiz.setAttribute("aria-label", "como funciona o joker");

    const caixa = document.createElement("div");
    caixa.className = "tutorial-caixa";

    caixa.append(this.cabecalho(), this.conta());

    const palco = document.createElement("div");
    palco.className = "tutorial-palco";
    caixa.appendChild(palco);

    this.elEstado = document.createElement("p");
    this.elEstado.className = "tutorial-estado";
    this.elEstado.setAttribute("role", "status");

    this.elAcoes = document.createElement("div");
    this.elAcoes.className = "acoes";

    caixa.append(this.elEstado, this.elAcoes);
    this.raiz.appendChild(caixa);
    host.appendChild(this.raiz);

    this.view = new BoardView(palco, {
      aoTocar: (p) => void this.tocar(p),
      ...(opcoes.modoFace === undefined ? {} : { modoFace: opcoes.modoFace }),
    });
    this.picker = new JokerPicker(palco, {
      aoEscolher: (valor) => void this.escolher(valor),
      ...(opcoes.modoFace === undefined ? {} : { modoFace: opcoes.modoFace }),
    });

    this.view.dimensionarPara(NIVEL_TUTORIAL_JOKER.board);
    this.view.montar(NIVEL_TUTORIAL_JOKER.board);

    this.pintar();
  }

  destruir(): void {
    this.picker.destruir();
    this.view.destruir();
    this.raiz.remove();
  }

  /* ─── as três peças de texto ────────────────────────────────────────────── */

  /**
   * A regra em duas frases, e sem uma palavra de jargão.
   *
   * «Módulo 7» diz a mesma coisa e não se lê aos dez anos — o público vai de
   * miúdos a graúdos, e a regra tem de passar nos dois extremos.
   */
  private cabecalho(): HTMLElement {
    const el = document.createElement("div");
    el.className = "tutorial-cabecalho";

    const h = document.createElement("h2");
    h.textContent = "O joker";

    const p = document.createElement("p");
    p.textContent =
      "A soma de qualquer tabuleiro é sempre múltipla de 7. " +
      "O joker vale exatamente o que falta — e só esse valor esvazia o tabuleiro.";

    el.append(h, p);
    return el;
  }

  /** A conta, uma vez na vida do jogador, com os números deste tabuleiro. */
  private conta(): HTMLElement {
    const el = document.createElement("div");
    el.className = "tutorial-conta";

    const passos: readonly (readonly [string, string])[] = [
      ["as faces somam", String(CONTA.faces)],
      [`faltam ${String(CONTA.joker)} para`, String(CONTA.total)],
      [`que é 7 × ${String(CONTA.jogadas)}`, `✳ = ${String(CONTA.joker)}`],
    ];

    for (const [rotulo, valor] of passos) {
      const passo = document.createElement("div");
      passo.className = "tutorial-passo";

      const r = document.createElement("span");
      r.className = "rotulo";
      r.textContent = rotulo;

      const v = document.createElement("span");
      v.className = "valor";
      v.textContent = valor;

      passo.append(r, v);
      el.appendChild(passo);
    }

    return el;
  }

  /* ─── jogar ─────────────────────────────────────────────────────────────── */

  private async tocar(p: Packed, jokerAs?: JokerValue): Promise<void> {
    const antes = this.jogo;
    if (isFinished(antes)) return;

    if (cellAt(antes.board, p) === JOKER && jokerAs === undefined) {
      const caixa = this.view.caixaDe(p);
      if (caixa !== undefined) {
        this.jokerPendente = p;
        this.picker.abrir(caixa, antes.jokerAs);
      }
      return;
    }

    const candidato = antes.selection.includes(p)
      ? [...antes.selection]
      : [...antes.selection, p];

    this.jogo = tap(antes, p, jokerAs);

    if (this.jogo.history.length > antes.history.length) {
      await this.view.aplicarJogada(
        [...candidato].sort((a, b) => a - b) as Group,
      );
    }

    this.pintar();
  }

  private async escolher(valor: JokerValue): Promise<void> {
    const p = this.jokerPendente;
    this.jokerPendente = undefined;
    if (p === undefined) return;

    await this.tocar(p, valor);
  }

  private recomecar(): void {
    this.jogo = restart(this.jogo);
    this.view.montar(this.jogo.board);
    this.pintar();
  }

  /* ─── desenho ───────────────────────────────────────────────────────────── */

  private get fase(): Fase {
    if (isFinished(this.jogo)) return "limpo";
    return hasAnyGroup(this.jogo.board) ? "a-jogar" : "morto";
  }

  private pintar(): void {
    const jogo = this.jogo;

    this.view.marcarSelecao(new Set(jogo.selection));
    const joker = jogo.selection.find((p) => cellAt(jogo.board, p) === JOKER);
    this.view.marcarJoker(joker, jogo.jokerAs);

    const fase = this.fase;
    this.raiz.dataset["fase"] = fase;

    this.elEstado.textContent = this.mensagem(fase);
    this.elAcoes.replaceChildren(...this.botoes(fase));
  }

  /**
   * O que o jogo diz em cada um dos três desfechos.
   *
   * No caminho fatal a frase é a lição inteira, e é dita sem repreensão: o
   * jogador fez o que o jogo permite, e o que ele tem de levar daqui é que o
   * jogo **permite** e **não avisa**.
   */
  private mensagem(fase: Fase): string {
    const restante = totalSum(this.jogo.board);

    if (fase === "morto") {
      return (
        `Sobram ${String(restante)}. Não é múltiplo de 7, e já não há joker ` +
        "para corrigir. O jogo deixou-te gastá-lo no valor errado e não te avisou " +
        "— nos níveis a sério faz exatamente o mesmo."
      );
    }

    if (fase === "limpo") {
      return (
        "Limpo. Repara no que o jogo te deixava fazer: gastar o joker noutro " +
        "valor era permitido, e o tabuleiro morria em silêncio. A conta acima " +
        "acompanha-te nos três primeiros níveis com joker; a partir daí fá-la tu."
      );
    }

    return "Toca no joker para lhe dares um valor. Depois soma 7, como em qualquer jogada.";
  }

  private botoes(fase: Fase): readonly HTMLElement[] {
    const fora: HTMLElement[] = [];

    if (fase === "morto") {
      fora.push(this.botao("Tentar outra vez", () => {
        this.recomecar();
      }));
    }

    if (fase === "limpo") {
      fora.push(
        this.botao("E se eu escolher outro valor?", () => {
          this.recomecar();
        }),
      );
    }

    // A saída só existe depois de o tabuleiro estar limpo — salvo em revisão,
    // onde o jogador já passou por aqui e está a reler por vontade própria.
    if (fase === "limpo" || this.opcoes.revisao === true) {
      const sair = this.botao(
        fase === "limpo" ? "Já percebi" : "Fechar",
        () => {
          this.opcoes.aoFechar();
        },
        fase === "limpo" ? "primario" : undefined,
      );
      fora.push(sair);
    }

    return fora;
  }

  private botao(
    rotulo: string,
    aoClicar: () => void,
    extra?: string,
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = extra === undefined ? "btn" : `btn ${extra}`;
    b.textContent = rotulo;
    b.addEventListener("click", aoClicar);
    return b;
  }
}
