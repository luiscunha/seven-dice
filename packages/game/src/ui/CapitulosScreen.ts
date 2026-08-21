/**
 * A lista de capítulos.
 *
 * Cinco, e não as oito bandas do pipeline. Uma banda é uma receita de geração; o
 * jogador não tem que saber que existem duas maneiras de fazer um nível médio
 * (ver `capitulos.ts`).
 *
 * **Nenhum está fechado.** A ordem é a progressão desenhada e lê-se como
 * sugestão, não como porta — quem já sabe jogar não deve ter de reconquistar o
 * caminho, e no playtest é preciso poder mandar alguém direto a um 7×7.
 *
 * Cada linha diz quantos níveis estão feitos e quantos estão perfeitos. É a
 * única informação que dá razão para voltar a um capítulo já terminado.
 */

import type { Capitulo, NivelDoCapitulo } from "../capitulos";
import type { Profile } from "../session/progress";
import { cabecalho, elemento } from "./dom";

export interface CapituloNaLista {
  readonly capitulo: Capitulo;
  readonly niveis: readonly NivelDoCapitulo[];
}

export interface OpcoesCapitulos {
  readonly capitulos: readonly CapituloNaLista[];
  readonly perfil: Profile;
  readonly aoEscolher: (capitulo: string) => void;
  readonly aoVoltar: () => void;
}

export class CapitulosScreen {
  private readonly raiz: HTMLElement;

  constructor(host: HTMLElement, opcoes: OpcoesCapitulos) {
    this.raiz = elemento("div", "ecra");

    const { el: topo } = cabecalho("Níveis", opcoes.aoVoltar);

    const lista = elemento("div", "bandas");
    for (const entrada of opcoes.capitulos) {
      lista.appendChild(this.linha(entrada, opcoes));
    }

    const rolo = elemento("div", "rolo");
    rolo.appendChild(lista);

    this.raiz.append(topo, rolo);
    host.replaceChildren(this.raiz);
  }

  destruir(): void {
    this.raiz.remove();
  }

  private linha(
    entrada: CapituloNaLista,
    opcoes: OpcoesCapitulos,
  ): HTMLElement {
    const feitos = entrada.niveis.filter(
      (n) => opcoes.perfil.levels[n.id] !== undefined,
    ).length;

    const perfeitos = entrada.niveis.filter(
      (n) => opcoes.perfil.levels[n.id]?.seal === "perfect",
    ).length;

    const b = document.createElement("button");
    b.type = "button";
    b.className = "banda";

    const texto = elemento("span", "banda-texto");
    texto.append(
      elemento("span", "banda-nome", entrada.capitulo.nome),
      elemento("span", "banda-descricao", entrada.capitulo.descricao),
    );

    const conta = elemento(
      "span",
      "banda-conta",
      `${String(feitos)}/${String(entrada.niveis.length)}`,
    );

    if (perfeitos > 0) {
      conta.appendChild(
        elemento("span", "banda-perfeitos", `★ ${String(perfeitos)}`),
      );
    }

    b.append(texto, conta);
    b.addEventListener("click", () => {
      opcoes.aoEscolher(entrada.capitulo.id);
    });

    return b;
  }
}
