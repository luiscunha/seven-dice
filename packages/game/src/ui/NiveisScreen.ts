/**
 * A grelha de níveis de uma banda.
 *
 * Número e selo, e mais nada (desenho §5.6). Trinta células com o tamanho e a
 * forma de cada tabuleiro seriam um mosaico, e o que se procura aqui é uma coisa
 * só: **onde é que eu ia, e o que é que ainda não está perfeito**.
 *
 * O selo nunca regride — está garantido em `progress.ts` — portanto a grelha é
 * um registo do melhor que se fez, não do último que se fez. É isso que dá razão
 * para voltar a um nível já limpo.
 */

import type { BandaNoIndice } from "../levels";
import type { Profile } from "../session/progress";
import type { Seal } from "../session/PuzzleSession";
import { cabecalho, elemento } from "./dom";

/** O selo em glifo. O texto completo fica na etiqueta de acessibilidade. */
const SELO: Readonly<Record<Seal, { readonly glifo: string; readonly nome: string }>> = {
  perfect: { glifo: "★", nome: "perfeito" },
  clean: { glifo: "◆", nome: "limpo" },
  completed: { glifo: "●", nome: "concluído" },
};

export interface OpcoesNiveis {
  readonly banda: BandaNoIndice;
  readonly perfil: Profile;
  readonly aoEscolher: (indice: number) => void;
  readonly aoVoltar: () => void;
}

export class NiveisScreen {
  private readonly raiz: HTMLElement;

  constructor(host: HTMLElement, opcoes: OpcoesNiveis) {
    this.raiz = elemento("div", "ecra");

    const nome = (opcoes.banda.label.split("—")[0] ?? opcoes.banda.id).trim();
    const { el: topo } = cabecalho(nome, opcoes.aoVoltar);

    const grelha = elemento("div", "grelha-niveis");
    opcoes.banda.niveis.forEach((nivel, i) => {
      grelha.appendChild(this.celula(i, opcoes.perfil.levels[nivel.id]?.seal, opcoes));
    });

    const rolo = elemento("div", "rolo");
    rolo.appendChild(grelha);

    this.raiz.append(topo, rolo);
    host.replaceChildren(this.raiz);
  }

  destruir(): void {
    this.raiz.remove();
  }

  private celula(
    indice: number,
    selo: Seal | undefined,
    opcoes: OpcoesNiveis,
  ): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nivel";
    if (selo !== undefined) b.dataset["selo"] = selo;

    const numero = String(indice + 1);
    b.appendChild(elemento("span", "nivel-numero", numero));

    if (selo !== undefined) {
      b.appendChild(elemento("span", "nivel-selo", SELO[selo].glifo));
    }

    b.setAttribute(
      "aria-label",
      selo === undefined
        ? `nível ${numero}, por jogar`
        : `nível ${numero}, ${SELO[selo].nome}`,
    );

    b.addEventListener("click", () => {
      opcoes.aoEscolher(indice);
    });

    return b;
  }
}
