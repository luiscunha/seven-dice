/**
 * A grelha de níveis de um capítulo.
 *
 * Número e selo, e mais nada (desenho §5.6). Quarenta e cinco células com o
 * tamanho e a forma de cada tabuleiro seriam um mosaico, e o que se procura aqui
 * é uma coisa só: **onde é que eu ia, e o que é que ainda não está perfeito**.
 *
 * O número é a **posição no capítulo**, não o índice na banda — o jogador não
 * sabe que existem bandas, e é ele que conta de 1 a 45.
 *
 * Os níveis com joker não estão assinalados, de propósito. Saber de antemão que
 * o próximo tem joker retirava-lhe metade do que ele é: um encontro.
 *
 * O selo nunca regride — está garantido em `progress.ts` — portanto a grelha é
 * um registo do melhor que se fez, não do último.
 */

import type { Capitulo, NivelDoCapitulo } from "../capitulos";
import type { Profile } from "../session/progress";
import type { Seal } from "../session/PuzzleSession";
import { cabecalho, elemento } from "./dom";

/** O selo em glifo. O texto completo fica na etiqueta de acessibilidade. */
const SELO: Readonly<
  Record<Seal, { readonly glifo: string; readonly nome: string }>
> = {
  perfect: { glifo: "★", nome: "perfeito" },
  clean: { glifo: "◆", nome: "limpo" },
  completed: { glifo: "●", nome: "concluído" },
};

export interface OpcoesNiveis {
  readonly capitulo: Capitulo;
  readonly niveis: readonly NivelDoCapitulo[];
  readonly perfil: Profile;
  readonly aoEscolher: (nivel: NivelDoCapitulo) => void;
  readonly aoVoltar: () => void;
}

export class NiveisScreen {
  private readonly raiz: HTMLElement;

  constructor(host: HTMLElement, opcoes: OpcoesNiveis) {
    this.raiz = elemento("div", "ecra");

    const { el: topo } = cabecalho(opcoes.capitulo.nome, opcoes.aoVoltar);

    const grelha = elemento("div", "grelha-niveis");
    opcoes.niveis.forEach((nivel, i) => {
      grelha.appendChild(
        this.celula(i, nivel, opcoes.perfil.levels[nivel.id]?.seal, opcoes),
      );
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
    posicao: number,
    nivel: NivelDoCapitulo,
    selo: Seal | undefined,
    opcoes: OpcoesNiveis,
  ): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nivel";
    if (selo !== undefined) b.dataset["selo"] = selo;

    const numero = String(posicao + 1);
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
      opcoes.aoEscolher(nivel);
    });

    return b;
  }
}
