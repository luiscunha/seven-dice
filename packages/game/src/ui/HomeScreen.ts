/**
 * A Home: os dois modos e as definições.
 *
 * É o único ecrã sem seta de voltar, e o único que mostra o nome do jogo. Tudo o
 * resto é uma escolha entre três coisas — e três coisas não precisam de mapa,
 * de metáfora, nem de arte que envelhece (desenho §5.6).
 *
 * O progresso aparece aqui em números e não em barras: quantos níveis limpos, e
 * o melhor do modo tempo. Quem não jogou nada não vê zeros a acusá-lo — as
 * linhas só aparecem quando há o que contar.
 */

import type { Profile } from "../session/progress";
import { botao, elemento } from "./dom";

export interface OpcoesHome {
  readonly aoEscolherNiveis: () => void;
  readonly aoEscolherTempo: () => void;
  readonly aoEscolherDefinicoes: () => void;
  readonly perfil: Profile;
  /** Total de níveis do pack, para o «x de y». */
  readonly totalNiveis: number;
}

export class HomeScreen {
  private readonly raiz: HTMLElement;

  constructor(host: HTMLElement, opcoes: OpcoesHome) {
    this.raiz = elemento("div", "ecra home");

    const marca = elemento("div", "home-marca");
    marca.append(
      elemento("h1", "home-titulo", "Septet"),
      elemento(
        "p",
        "home-lema",
        "Elimina grupos ligados que somem exatamente 7.",
      ),
    );

    const modos = elemento("div", "home-modos");
    modos.append(
      this.cartao(
        "Níveis",
        "A campanha, banda a banda",
        opcoes.aoEscolherNiveis,
        "primario",
      ),
      this.cartao(
        "Tempo",
        "Um relógio só, que nunca pára",
        opcoes.aoEscolherTempo,
      ),
    );

    this.raiz.append(marca, modos, this.resumo(opcoes));

    const rodape = elemento("div", "home-rodape");
    rodape.appendChild(botao("Definições", undefined, opcoes.aoEscolherDefinicoes));
    this.raiz.appendChild(rodape);

    host.replaceChildren(this.raiz);
  }

  destruir(): void {
    this.raiz.remove();
  }

  private cartao(
    titulo: string,
    legenda: string,
    aoClicar: () => void,
    extra?: string,
  ): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = extra === undefined ? "home-modo" : `home-modo ${extra}`;
    b.append(
      elemento("span", "home-modo-titulo", titulo),
      elemento("span", "home-modo-legenda", legenda),
    );
    b.addEventListener("click", aoClicar);
    return b;
  }

  /** Só mostra o que já aconteceu. Zeros não são progresso, são acusação. */
  private resumo(opcoes: OpcoesHome): HTMLElement {
    const el = elemento("div", "home-resumo");
    const feitos = Object.keys(opcoes.perfil.levels).length;

    if (feitos > 0) {
      const perfeitos = Object.values(opcoes.perfil.levels).filter(
        (l) => l.seal === "perfect",
      ).length;

      el.appendChild(
        elemento(
          "p",
          undefined,
          `${String(feitos)} de ${String(opcoes.totalNiveis)} níveis · ` +
            plural(perfeitos, "perfeito", "perfeitos"),
        ),
      );
    }

    if (opcoes.perfil.bestTimeAttackScore > 0) {
      el.appendChild(
        elemento(
          "p",
          undefined,
          `Modo tempo: ${String(opcoes.perfil.bestTimeAttackScore)} pontos · ` +
            plural(opcoes.perfil.bestBoardsCleared, "tabuleiro", "tabuleiros"),
        ),
      );
    }

    return el;
  }
}

/** «1 perfeito», não «1 perfeitos». Custa uma linha e nota-se quando falta. */
const plural = (n: number, um: string, muitos: string): string =>
  `${String(n)} ${n === 1 ? um : muitos}`;
