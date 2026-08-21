/**
 * A escolha do valor do joker, no sítio onde o jogador está a olhar.
 *
 * O joker é a única peça cujo valor o jogador decide (`[M 2.6]`), e essa decisão
 * é a mais consequente do jogo: só um valor esvazia o tabuleiro, e escolher mal
 * não bloqueia na hora — o tabuleiro fica insolúvel em silêncio.
 *
 * Por isso a escolha acontece **ao tocar no joker**, e não num botão de
 * confirmação noutro sítio do ecrã. Duas razões:
 *
 * - **Resolve a ambiguidade na origem.** Com o valor fixado no momento do toque,
 *   a seleção volta a ter um alvo exato e elimina sozinha, como qualquer outra.
 *   A alternativa — perguntar no fim — obrigava a um botão, porque `✳ + 2` e
 *   `✳ + 2 + 2` seriam ambas legítimas.
 * - **Ensina a mecânica sem tutorial.** Ver as seis faces e escolher uma explica
 *   o que o joker é numa interação, sem uma linha de texto.
 *
 * As opções são **as seis**, sempre. Esconder as que não dão em nada seria dar a
 * resposta, e a resposta é o puzzle.
 */

import type { JokerValue } from "../session/GameSession";
import { JOKER_VALUES } from "../session/GameSession";
import { criarPeca } from "./dice";
import type { ModoFace } from "./dice";

export interface OpcoesJokerPicker {
  readonly aoEscolher: (valor: JokerValue) => void;
  readonly modoFace?: ModoFace;
}

export class JokerPicker {
  private readonly el: HTMLElement;
  private readonly opcoes: OpcoesJokerPicker;
  private readonly aoTeclar: (ev: KeyboardEvent) => void;
  private readonly aoClicarFora: (ev: MouseEvent) => void;
  private aberto = false;

  constructor(host: HTMLElement, opcoes: OpcoesJokerPicker) {
    this.opcoes = opcoes;

    this.el = document.createElement("div");
    this.el.className = "joker-picker";
    this.el.setAttribute("role", "menu");
    this.el.setAttribute("aria-label", "quanto vale o joker nesta jogada");
    this.el.hidden = true;
    host.appendChild(this.el);

    this.aoTeclar = (ev) => {
      if (!this.aberto) return;

      if (ev.key === "Escape") {
        this.fechar();
        return;
      }

      const n = Number.parseInt(ev.key, 10);
      if (JOKER_VALUES.includes(n as JokerValue)) {
        ev.preventDefault();
        this.escolher(n as JokerValue);
      }
    };

    this.aoClicarFora = (ev) => {
      if (!this.aberto) return;
      if (ev.target instanceof Node && this.el.contains(ev.target)) return;
      this.fechar();
    };

    document.addEventListener("keydown", this.aoTeclar);
    // Em captura: senão o clique que abriu o menu fecha-o logo a seguir.
    document.addEventListener("click", this.aoClicarFora, true);
  }

  get estaAberto(): boolean {
    return this.aberto;
  }

  /** Abre junto da peça, sem sair do tabuleiro. */
  abrir(ancora: DOMRect, atual?: JokerValue): void {
    this.desenhar(atual);

    this.el.hidden = false;
    this.aberto = true;

    const caixa = (this.el.offsetParent ?? document.body).getBoundingClientRect();
    const largura = this.el.offsetWidth;
    const altura = this.el.offsetHeight;

    const x = ancora.left - caixa.left + ancora.width / 2 - largura / 2;
    const acimaCabe = ancora.top - caixa.top - altura - 10 >= 0;
    const y = acimaCabe
      ? ancora.top - caixa.top - altura - 10
      : ancora.bottom - caixa.top + 10;

    this.el.style.left = `${String(
      Math.max(6, Math.min(x, caixa.width - largura - 6)),
    )}px`;
    this.el.style.top = `${String(y)}px`;

    this.el.querySelector<HTMLElement>("button")?.focus();
  }

  fechar(): void {
    this.aberto = false;
    this.el.hidden = true;
  }

  destruir(): void {
    document.removeEventListener("keydown", this.aoTeclar);
    document.removeEventListener("click", this.aoClicarFora, true);
    this.el.remove();
  }

  private escolher(valor: JokerValue): void {
    this.fechar();
    this.opcoes.aoEscolher(valor);
  }

  private desenhar(atual?: JokerValue): void {
    const titulo = document.createElement("p");
    titulo.className = "joker-picker-titulo";
    titulo.textContent = "o joker vale";

    const grelha = document.createElement("div");
    grelha.className = "joker-picker-grelha";

    for (const v of JOKER_VALUES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "joker-opcao";
      b.setAttribute("role", "menuitem");
      b.setAttribute("aria-label", String(v));
      if (v === atual) b.setAttribute("aria-current", "true");

      const face = criarPeca(v, this.opcoes.modoFace ?? "pintas");
      face.style.setProperty("--lado", "38px");
      face.removeAttribute("role");
      face.setAttribute("aria-hidden", "true");
      b.appendChild(face);

      b.addEventListener("click", () => {
        this.escolher(v);
      });

      grelha.appendChild(b);
    }

    this.el.replaceChildren(titulo, grelha);
  }
}
