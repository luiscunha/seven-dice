/**
 * O modo Survival.
 *
 * **O objetivo é limpar o tabuleiro, e o cronómetro é a marca.** Corre para
 * cima desde o primeiro toque e pára quando a última peça sai — ou quando o
 * tabuleiro transborda, que é a outra maneira de a corrida acabar.
 *
 * Três coisas no ecrã, e as três mudam a jogada seguinte:
 *
 * **O cronómetro**, em grande no topo, onde o Contra-Relógio tem o relógio dele.
 *
 * **A próxima linha**, entre o topo e o tabuleiro — é de lá que as peças vêm, e
 * cai de lá quando entra. Uma linha só, com as peças a sério: as mesmas pintas,
 * as mesmas cores, o mesmo tamanho da peça no tabuleiro. Uma peça na fila tem de
 * ser reconhecível como a peça que vai aterrar, e um número não é.
 *
 * **O resto para limpar.** Cada jogada tira exatamente 7, portanto o tabuleiro
 * só pode esvaziar se a soma for múltipla de 7. As linhas fazem a soma derivar:
 * `0` quer dizer «dá para limpar agora», qualquer outro valor quer dizer «hoje
 * não, de certeza». É condição necessária e não suficiente, e o texto não mente
 * sobre isso.
 *
 * Sem undo e sem dicas, como no Contra-Relógio. Mas ao contrário dele, **ficar
 * sem jogadas não é morrer**: é o momento de puxar uma linha. A mesma deteção do
 * beco sem saída da campanha, com o sentido ao contrário.
 *
 * O relógio do sistema entra aqui e só aqui. A `SurvivalSession` não o conhece.
 */

import type { Cell, Group, Packed } from "@dicetoseven/engine";
import { JOKER, cellAt, hasAnyGroup, isEmpty } from "@dicetoseven/engine";

import type { JokerValue } from "../session/GameSession";
import { selectionTotal } from "../session/GameSession";
import type {
  SurvivalConfig,
  SurvivalState,
} from "../session/SurvivalSession";
import {
  DEFAULT_SURVIVAL,
  folga,
  proximaLinha,
  puxarLinha,
  restoParaLimpar,
  startSurvival,
  survivalTap,
} from "../session/SurvivalSession";
import { BoardView } from "./BoardView";
import { criarPeca } from "./dice";
import { botao, confirmar, elemento, texto } from "./dom";
import { JokerPicker } from "./JokerPicker";

/** De quanto em quanto o cronómetro se repinta. Décimos chegam. */
const PASSO_RELOGIO = 100;

/** Uma corrida a meio, para o ecrã a retomar onde ficou. */
export interface CorridaGuardada {
  readonly estado: SurvivalState;
  readonly decorridoMs: number;
}

export interface OpcoesSurvival {
  readonly seed: number;
  /**
   * A corrida que ficou a meio, se houver.
   *
   * Sair do modo não é desistir dele. O tabuleiro, o cronómetro e a linha que
   * vinha a seguir ficam onde estavam até alguém carregar em recomeçar — e esse
   * botão pergunta antes.
   */
  readonly retomar?: CorridaGuardada;
  /** Chamado ao sair, para que a corrida sobreviva à navegação. */
  readonly aoGuardar: (corrida: CorridaGuardada) => void;
  /** Melhor tempo em milissegundos, ou 0 se ainda não há. */
  readonly melhorTempo: number;
  readonly aoTerminar: (info: {
    readonly limpou: boolean;
    readonly tempoMs: number;
    readonly linhas: number;
  }) => void;
  readonly aoSair: () => void;
  /** Recomeçar com outra seed. Sem isto, acabar é um beco. */
  readonly aoRecomecar: (seed: number) => void;
}

export class SurvivalScreen {
  private readonly raiz: HTMLElement;
  private readonly view: BoardView;
  private readonly opcoes: OpcoesSurvival;
  private readonly config: SurvivalConfig = DEFAULT_SURVIVAL;

  private readonly elRelogio: HTMLElement;
  private readonly elMeta: HTMLElement;
  private readonly elFila: HTMLElement;
  private readonly elSoma: HTMLElement;
  private readonly elResto: HTMLElement;
  private readonly btPuxar: HTMLButtonElement;
  private readonly btRecomecar: HTMLButtonElement;
  private readonly elFim: HTMLDialogElement;
  private readonly picker: JokerPicker;

  /** A peça de joker tocada, à espera de valor. */
  private jokerPendente: Packed | undefined;

  private estado: SurvivalState;
  private terminado = false;
  private ocupado = false;

  /**
   * O cronómetro arranca no **primeiro toque**, não ao abrir o ecrã.
   *
   * Quem chega ao modo tem primeiro de olhar para o tabuleiro, e cronometrar
   * esse olhar seria cronometrar a coisa errada.
   */
  private inicioMs: number | undefined;
  private fimMs: number | undefined;
  private cronometro: ReturnType<typeof setInterval> | undefined;

  constructor(host: HTMLElement, opcoes: OpcoesSurvival) {
    this.opcoes = opcoes;
    this.estado = opcoes.retomar?.estado ?? startSurvival(opcoes.seed, this.config);

    /*
     * Retomar repõe o cronómetro a andar de onde ficou: o início desloca-se
     * para trás pelo tempo já gasto. Guardar o instante de início em vez do
     * decorrido faria a corrida contar o tempo em que o jogador esteve noutro
     * ecrã.
     */
    if (opcoes.retomar !== undefined && opcoes.retomar.decorridoMs > 0) {
      this.inicioMs = Date.now() - opcoes.retomar.decorridoMs;
      this.cronometro = setInterval(() => {
        this.pintarRelogio();
      }, PASSO_RELOGIO);
    }

    this.raiz = elemento("div", "ecra survival");

    /* ── topo: o cronómetro manda ── */
    const topo = elemento("header", "topo survival-topo");

    /*
     * Sair **não** pede confirmação, porque não perde nada: a corrida fica
     * guardada e retoma-se onde ficou. Confirmar aqui era pedir uma decisão
     * sobre uma consequência que não existe.
     */
    const sair = botao("‹", "redondo", () => {
      this.guardar();
      opcoes.aoSair();
    });
    sair.setAttribute("aria-label", "sair da corrida");

    this.elRelogio = elemento("div", "relogio");
    this.elRelogio.setAttribute("role", "timer");
    this.elMeta = elemento("div", "meta");

    topo.append(sair, this.elRelogio, this.elMeta);

    /* ── a próxima linha, entre o topo e o tabuleiro: é de lá que ela cai ── */
    this.elFila = elemento("div", "fila");
    this.elFila.setAttribute("aria-label", "próxima linha");

    const palco = elemento("div", "palco");

    /* ── rodapé ── */
    const rodape = elemento("footer", "rodape");

    const linha = elemento("div", "linha-selecao");
    this.elSoma = elemento("div", "soma");
    this.elResto = elemento("div", "resto");
    linha.append(this.elSoma, this.elResto);

    const acoes = elemento("div", "acoes");
    this.btPuxar = botao("Puxar linha", "primario", () => {
      void this.puxar();
    });
    this.btRecomecar = botao("Recomeçar", undefined, () => {
      this.pedirParaRecomecar();
    });

    acoes.append(this.btPuxar, this.btRecomecar);

    rodape.append(linha, acoes);

    this.elFim = document.createElement("dialog");
    this.elFim.className = "popup";

    this.raiz.append(topo, this.elFila, palco, rodape, this.elFim);
    host.replaceChildren(this.raiz);

    this.view = new BoardView(palco, { aoTocar: (p) => void this.tocar(p) });
    this.picker = new JokerPicker(palco, {
      aoEscolher: (valor) => void this.escolherJoker(valor),
    });

    /*
     * **Pintar antes de dimensionar.** A fila só ganha altura quando tem
     * conteúdo, e o palco é o que sobra depois dela. Dimensionar primeiro media
     * um palco mais alto do que o real, e o tabuleiro acabava por cima do rodapé.
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
    this.guardar();
    this.parar();
    this.picker.destruir();
    if (this.elFim.open && typeof this.elFim.close === "function") {
      this.elFim.close();
    }
    this.view.destruir();
    this.raiz.remove();
  }

  /* ─── cronómetro ────────────────────────────────────────────────────────── */

  private arrancar(): void {
    if (this.inicioMs !== undefined) return;

    this.inicioMs = Date.now();
    this.cronometro = setInterval(() => {
      this.pintarRelogio();
    }, PASSO_RELOGIO);
  }

  private parar(): void {
    if (this.cronometro !== undefined) clearInterval(this.cronometro);
    this.cronometro = undefined;
  }

  private decorridoMs(): number {
    if (this.inicioMs === undefined) return 0;
    return (this.fimMs ?? Date.now()) - this.inicioMs;
  }

  /* ─── jogar ─────────────────────────────────────────────────────────────── */

  private async tocar(p: Packed, jokerAs?: JokerValue): Promise<void> {
    if (this.terminado || this.ocupado) return;

    this.arrancar();

    const antes = this.estado;

    /*
     * **O joker não entra na seleção sem valor.** O toque abre a escolha, e é a
     * escolha que faz a jogada — o mesmo desenho da campanha. Sem isto, tocar no
     * joker não fazia rigorosamente nada: a sessão rejeitava o toque com
     * `joker-needs-value` e o ecrã não tinha como perguntar.
     */
    if (cellAt(antes.game.board, p) === JOKER && jokerAs === undefined) {
      const caixa = this.view.caixaDe(p);
      if (caixa !== undefined) {
        this.jokerPendente = p;
        this.picker.abrir(caixa, antes.game.jokerAs);
      }
      return;
    }

    const selecao = antes.game.selection.includes(p)
      ? [...antes.game.selection]
      : [...antes.game.selection, p];

    const r = survivalTap(antes, p, this.config, undefined, jokerAs);
    this.estado = r.state;

    if (r.moved) {
      this.ocupado = true;

      /*
       * `finally`, e não uma atribuição no fim. O `ocupado` trava o ecrã
       * inteiro, e um travão que só se solta pelo caminho feliz deixa o jogo
       * morto sem nada a dizer porquê.
       */
      try {
        const grupo = [...selecao].sort((a, b) => a - b) as Group;
        await this.view.aplicarJogada(grupo);

        // A linha automática cai **depois** da jogada, e cai a sério: peças a
        // sair e peças a entrar ao mesmo tempo não se distinguiam.
        if (r.injected) await this.view.injetarLinha(this.estado.game.board);
      } finally {
        this.view.montar(this.estado.game.board);
        this.ocupado = false;
      }
    }

    this.pintar();
    this.verificarFim();
  }

  private async escolherJoker(valor: JokerValue): Promise<void> {
    const p = this.jokerPendente;
    this.jokerPendente = undefined;
    if (p === undefined) return;

    await this.tocar(p, valor);
  }

  /** Guarda a corrida para quem sair poder voltar ao mesmo sítio. */
  private guardar(): void {
    if (this.terminado) return;
    this.opcoes.aoGuardar({
      estado: this.estado,
      decorridoMs: this.decorridoMs(),
    });
  }

  /**
   * Recomeçar pergunta, e o pedido é o único sítio onde perguntar.
   *
   * Num telemóvel um dedo acerta ao lado com facilidade, e este botão deita
   * fora a corrida inteira. Sair não pergunta porque sair não perde nada.
   */
  private pedirParaRecomecar(): void {
    if (this.terminado) {
      this.opcoes.aoRecomecar(novaSeed());
      return;
    }

    confirmar(this.raiz, {
      titulo: "Recomeçar?",
      texto: "Esta corrida e o tempo perdem-se. O tabuleiro volta ao início.",
      confirmar: "Recomeçar",
      aoConfirmar: () => {
        this.terminado = true;
        this.parar();
        this.opcoes.aoRecomecar(novaSeed());
      },
    });
  }

  private async puxar(): Promise<void> {
    if (this.terminado || this.ocupado) return;

    this.arrancar();
    this.ocupado = true;

    try {
      this.estado = puxarLinha(this.estado, this.config);
      await this.view.injetarLinha(this.estado.game.board);
    } finally {
      this.view.montar(this.estado.game.board);
      this.ocupado = false;
    }

    this.pintar();
    this.verificarFim();
  }

  /* ─── fim ───────────────────────────────────────────────────────────────── */

  private verificarFim(): void {
    if (this.terminado) return;
    if (!this.estado.limpo && !this.estado.morto) return;

    this.terminado = true;
    this.fimMs = Date.now();
    this.parar();
    this.pintarRelogio();

    this.opcoes.aoTerminar({
      limpou: this.estado.limpo,
      tempoMs: this.decorridoMs(),
      linhas: this.estado.linhasInjetadas,
    });

    this.pintarFim();
  }

  private pintarFim(): void {
    const limpou = this.estado.limpo;
    const tempo = this.decorridoMs();
    const recorde =
      limpou && (this.opcoes.melhorTempo === 0 || tempo < this.opcoes.melhorTempo);

    const corpo = elemento("div", "popup-corpo");
    corpo.append(
      elemento(
        "h2",
        "popup-titulo",
        limpou
          ? recorde
            ? "Recorde! Tabuleiro limpo."
            : "Tabuleiro limpo!"
          : "O tabuleiro transbordou",
      ),
      elemento(
        "p",
        "popup-texto",
        limpou
          ? `${relogio(tempo)} · ${String(this.estado.linhasInjetadas)} linhas aguentadas`
          : `${relogio(tempo)} até transbordar`,
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
    this.pintarRelogio();
    this.pintarFila();
    this.pintarRodape();
    const jogo = this.estado.game;
    this.view.marcarSelecao(new Set(jogo.selection));

    // Mostra na peça o valor que o jogador deu ao joker nesta seleção.
    const joker = jogo.selection.find((p) => cellAt(jogo.board, p) === JOKER);
    this.view.marcarJoker(joker, jogo.jokerAs);
  }

  private pintarRelogio(): void {
    this.elRelogio.textContent = relogio(this.decorridoMs());

    const espaco = folga(this.estado, this.config);
    this.elMeta.replaceChildren(
      texto(espaco === 1 ? "1 linha de folga" : `${String(espaco)} linhas de folga`),
    );
    this.elMeta.dataset["aperto"] =
      espaco <= 1 ? "critico" : espaco <= 2 ? "aviso" : "folgado";
  }

  /**
   * A próxima linha, com as peças a sério.
   *
   * `criarPeca` é a mesma fábrica do tabuleiro, portanto as pintas, as cores e o
   * joker são exatamente os mesmos. Uma peça na fila que se parecesse com outra
   * coisa obrigava a traduzir mentalmente entre dois alfabetos.
   */
  private pintarFila(): void {
    const linha = proximaLinha(this.estado, this.config);

    this.elFila.replaceChildren(
      ...linha.map((v) => {
        const el = criarPeca(v, "pintas");
        el.classList.add("na-fila");
        el.removeAttribute("role");
        return el;
      }),
    );
  }

  private pintarRodape(): void {
    const jogo = this.estado.game;

    this.elSoma.textContent =
      jogo.selection.length === 0
        ? "Toca nas peças para somar 7"
        : `${String(selectionTotal(jogo))} / 7`;

    /*
     * O resto. `0` é a única leitura acionável, e por isso é a única com cor —
     * o resto do tempo é um número discreto que se aprende a espreitar.
     */
    const resto = restoParaLimpar(this.estado);
    this.elResto.textContent =
      resto === 0 ? "dá para limpar" : `limpar: faltam ${String(7 - resto)}`;
    this.elResto.dataset["pronto"] = resto === 0 ? "sim" : "nao";

    const preso = !isEmpty(jogo.board) && !hasAnyGroup(jogo.board);
    this.btPuxar.textContent = preso
      ? "Sem jogadas — puxa uma linha"
      : "Puxar linha";
    this.btPuxar.dataset["urgente"] = preso ? "sim" : "nao";
    this.btPuxar.disabled = this.terminado;
  }
}

/** `m:ss.d`. Décimos porque a marca é um tempo, e um tempo compara-se ao décimo. */
export function relogio(ms: number): string {
  const total = Math.max(0, ms);
  const minutos = Math.floor(total / 60_000);
  const segundos = Math.floor((total % 60_000) / 1000);
  const decimos = Math.floor((total % 1000) / 100);
  return `${String(minutos)}:${String(segundos).padStart(2, "0")}.${String(decimos)}`;
}

/** Uma seed nova. Aqui não há nada a reproduzir — a partilha é do que já correu. */
export const novaSeed = (): number => Date.now() >>> 0;
