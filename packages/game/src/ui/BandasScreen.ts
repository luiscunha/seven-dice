/**
 * A lista de bandas.
 *
 * **Nenhuma está fechada.** A ordem é a progressão desenhada e lê-se como
 * sugestão, não como porta — quem já sabe jogar não deve ter de reconquistar o
 * caminho, e no playtest externo é preciso poder mandar alguém direto a um 7×7
 * do `perito`.
 *
 * Cada linha mostra quantos níveis estão feitos e quantos estão perfeitos. É a
 * única informação que dá razão para voltar a uma banda já terminada.
 */

import type { BandaNoIndice } from "../levels";
import type { Profile } from "../session/progress";
import { cabecalho, elemento } from "./dom";

export interface OpcoesBandas {
  readonly bandas: readonly BandaNoIndice[];
  readonly perfil: Profile;
  readonly aoEscolher: (banda: string) => void;
  readonly aoVoltar: () => void;
}

export class BandasScreen {
  private readonly raiz: HTMLElement;

  constructor(host: HTMLElement, opcoes: OpcoesBandas) {
    this.raiz = elemento("div", "ecra");

    const { el: topo } = cabecalho("Níveis", opcoes.aoVoltar);

    const lista = elemento("div", "bandas");
    for (const banda of opcoes.bandas) {
      lista.appendChild(this.linha(banda, opcoes));
    }

    const rolo = elemento("div", "rolo");
    rolo.appendChild(lista);

    this.raiz.append(topo, rolo);
    host.replaceChildren(this.raiz);
  }

  destruir(): void {
    this.raiz.remove();
  }

  private linha(banda: BandaNoIndice, opcoes: OpcoesBandas): HTMLElement {
    const feitos = banda.niveis.filter(
      (n) => opcoes.perfil.levels[n.id] !== undefined,
    ).length;

    const perfeitos = banda.niveis.filter(
      (n) => opcoes.perfil.levels[n.id]?.seal === "perfect",
    ).length;

    const b = document.createElement("button");
    b.type = "button";
    b.className = "banda";

    /*
     * O rótulo da banda traz a descrição a seguir a um travessão — "Perito —
     * faces altas, silhuetas". Na lista, o nome é o que se procura e a descrição
     * é o que explica; separá-los deixa a coluna alinhada.
     */
    const [nome, ...resto] = banda.label.split("—");

    const texto = elemento("span", "banda-texto");
    texto.append(
      elemento("span", "banda-nome", (nome ?? banda.id).trim()),
      elemento("span", "banda-descricao", resto.join("—").trim()),
    );

    const conta = elemento(
      "span",
      "banda-conta",
      `${String(feitos)}/${String(banda.niveis.length)}`,
    );
    if (perfeitos > 0) {
      conta.appendChild(elemento("span", "banda-perfeitos", `★ ${String(perfeitos)}`));
    }

    b.append(texto, conta);
    b.addEventListener("click", () => {
      opcoes.aoEscolher(banda.id);
    });

    return b;
  }
}
