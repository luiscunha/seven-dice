/**
 * O modo Survival.
 *
 * Três coisas dominam o ecrã, e todas as três são informação que muda a jogada
 * seguinte:
 *
 * **A fila.** As próximas linhas, na ordem e na coluna em que vão entrar. É a
 * razão de ser do modo — sem ela isto era sorte cega, e com ela é planeamento.
 * Mostra-se com as peças a sério, não com números: a peça na fila tem de ser
 * reconhecível como a mesma coisa que vai aterrar no tabuleiro.
 *
 * **A folga.** Quantas linhas ainda cabem antes do teto. É o relógio deste modo
 * — o que aqui se gasta é espaço, não tempo.
 *
 * **O resto para limpar.** Cada jogada tira exatamente 7, portanto o tabuleiro
 * só pode esvaziar se a soma for múltipla de 7. As linhas fazem a soma derivar,
 * portanto isto anda: `0` quer dizer «dá para limpar agora», e qualquer outro
 * valor quer dizer «hoje não, de certeza». É condição necessária e não
 * suficiente, e o texto diz isso sem mentir.
 *
 * Sem undo e sem dicas, como no Contra-Relógio. Mas ao contrário dele, **ficar
 * sem jogadas não é morrer**: é o momento de puxar uma linha. A mesma deteção
 * do beco sem saída da campanha, com o sentido ao contrário.
 */

import type { Cell, Group, Packed } from "@dicetoseven/engine";
import { findAllGroups, hasAnyGroup, isEmpty } from "@dicetoseven/engine";

import { selectionTotal } from "../session/GameSession";
import type {
  SurvivalConfig,
  SurvivalState,
} from "../session/SurvivalSession";
import {
  DEFAULT_SURVIVAL,
  cadencia,
  filaVisivel,
  folga,
  multiplicadorAoPuxar,
  puxarLinha,
  restoParaLimpar,
  startSurvival,
  survivalTap,
} from "../session/SurvivalSession";
import { BoardView } from "./BoardView";
import { botao, elemento, texto } from "./dom";

export interface OpcoesSurvival {
  readonly seed: number;
  readonly melhorPontuacao: number;
  readonly aoTerminar: (info: {
    readonly pontos: number;
    readonly linhas: number;
  }) => void;
  readonly aoSair: () => void;
  /** Recomeçar com outra seed. Sem isto, morrer é um beco. */
  readonly aoRecomecar: (seed: number) => void;
}

export class SurvivalScreen {
  private readonly raiz: HTMLElement;
  private readonly view: BoardView;
  private readonly opcoes: OpcoesSurvival;
  private readonly config: SurvivalConfig = DEFAULT_SURVIVAL;

  private readonly elFolga: HTMLElement;
  private readonly elMeta: HTMLElement;
  private readonly elFila: HTMLElement;
  private readonly elSoma: HTMLElement;
  private readonly elResto: HTMLElement;
  private readonly btPuxar: HTMLButtonElement;
  private readonly elFim: HTMLDialogElement;

  private estado: SurvivalState;
  private terminado = false;
  private ocupado = false;

  constructor(host: HTMLElement, opcoes: OpcoesSurvival) {
    this.opcoes = opcoes;
    this.estado = startSurvival(opcoes.seed, this.config);

    this.raiz = elemento("div", "ecra survival");

    /* ── topo: a folga manda, como o relógio manda no Contra-Relógio ── */
    const topo = elemento("header", "topo survival-topo");

    const sair = botao("‹", "redondo", () => {
      this.terminar();
      opcoes.aoSair();
    });
    sair.setAttribute("aria-label", "sair da corrida");

    this.elFolga = elemento("div", "folga");
    this.elFolga.setAttribute("role", "status");
    this.elMeta = elemento("div", "meta");

    topo.append(sair, this.elFolga, this.elMeta);

    /* ── a fila, entre o topo e o tabuleiro: é de lá que as peças vêm ── */
    this.elFila = elemento("div", "fila");
    this.elFila.setAttribute("aria-label", "próximas linhas");

    /* ── palco ── */
    const palco = elemento("div", "palco");

    /* ── rodapé ── */
    const rodape = elemento("footer", "rodape");

    const linha = elemento("div", "linha-selecao");
    this.elSoma = elemento("div", "soma");
    this.elResto = elemento("div", "resto");
    linha.append(this.elSoma, this.elResto);

    const acoes = elemento("div", "acoes");
    this.btPuxar = botao("Puxar linha", "primario", () => {
      this.puxar();
    });
    acoes.appendChild(this.btPuxar);

    rodape.append(linha, acoes);

    this.elFim = document.createElement("dialog");
    this.elFim.className = "popup";

    this.raiz.append(topo, this.elFila, palco, rodape, this.elFim);
    host.replaceChildren(this.raiz);

    this.view = new BoardView(palco, { aoTocar: (p) => void this.tocar(p) });

    /*
     * **Pintar antes de dimensionar.** A fila só ganha altura quando tem
     * conteúdo, e o palco é o que sobra depois dela. Dimensionar primeiro media
     * um palco 62px mais alto do que o real, e o tabuleiro acabava por cima do
     * rodapé — medido a 320px, transbordava 41px.
     */
    this.pintar();

    /*
     * Dimensiona para o tabuleiro **no seu tamanho máximo**, não no atual. O
     * tabuleiro cresce durante a corrida, e redimensionar a peça a cada linha
     * fazia o jogo inteiro saltar debaixo do dedo.
     */
    this.view.dimensionarPara(
      Array.from({ length: this.config.largura }, () =>
        Array.from({ length: this.config.alturaMaxima }, () => 1 as Cell),
      ),
    );
    this.view.montar(this.estado.game.board);
  }

  destruir(): void {
    if (this.elFim.open && typeof this.elFim.close === "function") {
      this.elFim.close();
    }
    this.view.destruir();
    this.raiz.remove();
  }

  /* ─── jogar ─────────────────────────────────────────────────────────────── */

  private async tocar(p: Packed): Promise<void> {
    if (this.terminado || this.ocupado) return;

    const antes = this.estado;
    const selecao = [...antes.game.selection, p];

    const r = survivalTap(antes, p, this.config);
    this.estado = r.state;

    if (r.moved) {
      this.ocupado = true;

      /*
       * `finally`, e não uma atribuição no fim.
       *
       * O `ocupado` trava o ecrã inteiro enquanto a jogada anima, e se alguma
       * coisa correr mal aqui dentro o jogo fica **permanentemente** morto: nem
       * toques, nem botão de puxar, sem nada no ecrã a dizer porquê. Um travão
       * que só se solta pelo caminho feliz não é um travão, é uma armadilha.
       */
      try {
        const grupo = [...selecao].sort((a, b) => a - b) as Group;
        /*
         * A animação corre sobre o tabuleiro **anterior** à injeção. A linha
         * nova monta-se depois, e não se anima junto — peças a sair e peças a
         * entrar ao mesmo tempo não se distinguiam umas das outras.
         */
        await this.view.aplicarJogada(grupo);
      } finally {
        // Resincroniza sempre. A sessão é a fonte de verdade, e a vista pode ter
        // ficado a meio de uma animação interrompida.
        this.view.montar(this.estado.game.board);
        this.ocupado = false;
      }
    }

    this.pintar();
    if (this.estado.morto) this.terminar();
  }

  private puxar(): void {
    if (this.terminado || this.ocupado) return;

    this.estado = puxarLinha(this.estado, this.config);
    this.view.montar(this.estado.game.board);
    this.pintar();

    if (this.estado.morto) this.terminar();
  }

  /* ─── fim ───────────────────────────────────────────────────────────────── */

  private terminar(): void {
    if (this.terminado) return;
    this.terminado = true;

    this.opcoes.aoTerminar({
      pontos: this.estado.score,
      linhas: this.estado.linhasInjetadas,
    });

    if (!this.estado.morto) return;
    this.pintarFim();
  }

  private pintarFim(): void {
    const corpo = elemento("div", "popup-corpo");

    const recorde = this.estado.score > this.opcoes.melhorPontuacao;

    corpo.append(
      elemento(
        "h2",
        "popup-titulo",
        recorde ? "Recorde! O tabuleiro transbordou." : "O tabuleiro transbordou",
      ),
      elemento(
        "p",
        "popup-texto",
        `${String(this.estado.score)} pontos · ${String(this.estado.linhasInjetadas)} linhas aguentadas`,
      ),
      // A seed é a corrida. Quem a passa a alguém passa exatamente esta partida.
      elemento("p", "popup-texto", `Seed ${String(this.estado.seed)}`),
    );

    const acoes = elemento("div", "acoes");
    acoes.append(
      botao("Outra corrida", "primario", () => {
        this.opcoes.aoRecomecar(novaSeed());
      }),
      botao("Repetir esta", undefined, () => {
        this.opcoes.aoRecomecar(this.estado.seed);
      }),
      botao("Sair", undefined, () => {
        this.opcoes.aoSair();
      }),
    );
    corpo.appendChild(acoes);

    this.elFim.replaceChildren(corpo);
    if (typeof this.elFim.showModal === "function") this.elFim.showModal();
    else this.elFim.open = true;
  }

  /* ─── desenho ───────────────────────────────────────────────────────────── */

  private pintar(): void {
    const s = this.estado;
    const jogo = s.game;
    const espaco = folga(s, this.config);

    this.elFolga.replaceChildren(
      elemento("span", "folga-numero", String(espaco)),
      elemento("span", "folga-etiqueta", espaco === 1 ? "linha" : "linhas"),
    );
    this.elFolga.dataset["aperto"] =
      espaco <= 1 ? "critico" : espaco <= 3 ? "aviso" : "folgado";

    const jogadasAte = Math.max(0, cadencia(s, this.config) - s.jogadasDesdeLinha);

    this.elMeta.replaceChildren(
      texto(`${String(s.score)} pontos`),
      texto(`linha em ${String(jogadasAte)}`),
    );
    if (s.jogadasComBonus > 0) {
      this.elMeta.appendChild(
        elemento(
          "span",
          "multiplicador",
          `×${s.multiplicador.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} · ${String(s.jogadasComBonus)}`,
        ),
      );
    }

    this.pintarFila();
    this.pintarRodape();

    this.view.marcarSelecao(new Set(jogo.selection));
  }

  /** As próximas linhas, na coluna em que vão entrar. */
  private pintarFila(): void {
    const linhas = filaVisivel(this.estado, this.config);

    this.elFila.replaceChildren(
      ...linhas.map((linha, i) => {
        const el = elemento("div", "fila-linha");
        // A primeira é a que vem já, e é a única que se lê com atenção.
        el.dataset["ordem"] = i === 0 ? "proxima" : "depois";
        el.append(
          ...linha.map((v) => {
            const peca = elemento("span", "fila-peca", String(v));
            peca.dataset["face"] = String(v);
            return peca;
          }),
        );
        return el;
      }),
    );
  }

  private pintarRodape(): void {
    const s = this.estado;
    const jogo = s.game;

    const total = selectionTotal(jogo);
    this.elSoma.textContent =
      jogo.selection.length === 0
        ? "Toca nas peças para somar 7"
        : `${String(total)} / 7`;

    /*
     * O resto. `0` é a única leitura acionável, e por isso é a única que ganha
     * cor — o resto do tempo é um número discreto que se aprende a espreitar.
     */
    const resto = restoParaLimpar(s);
    this.elResto.textContent =
      resto === 0 ? "dá para limpar" : `limpar: faltam ${String(7 - resto)}`;
    this.elResto.dataset["pronto"] = resto === 0 ? "sim" : "nao";

    const preso = !isEmpty(jogo.board) && !hasAnyGroup(jogo.board);
    const mult = multiplicadorAoPuxar(s, this.config);

    /*
     * Sem jogadas, puxar deixa de ser opção e passa a ser a única saída. O
     * botão diz isso — e continua a pagar o multiplicador, porque a alternativa
     * era castigar o jogador por um tabuleiro que ele não escolheu.
     */
    this.btPuxar.replaceChildren(
      texto(preso ? "Sem jogadas — puxa uma linha" : "Puxar linha"),
      elemento("span", "contador", `×${mult.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`),
    );
    this.btPuxar.dataset["urgente"] = preso ? "sim" : "nao";
    this.btPuxar.disabled = this.terminado;
  }
}

/** Uma seed nova. Aqui não há nada a reproduzir — a partilha é do que já correu. */
export const novaSeed = (): number => Date.now() >>> 0;

/** Quantos grupos existem agora. Só para a barra de estado; não é dica. */
export const gruposDisponiveis = (s: SurvivalState): number =>
  [...findAllGroups(s.game.board)].length;
