/**
 * Definições.
 *
 * Duas por agora — tema e apagar o progresso. O desenho §5.8 prevê mais, e o som
 * há de entrar quando existir som; a estrutura é uma lista de secções, para que
 * acrescentar uma entrada não obrigue a mexer nas outras.
 *
 * **Apagar o progresso pede confirmação no próprio botão**, e não numa caixa de
 * diálogo. Um `confirm()` do browser é feio, bloqueia, e em telemóvel aparece
 * com o nome do domínio — que é o oposto de uma aplicação. Carregar duas vezes
 * resolve o mesmo problema sem sair do ecrã, e o segundo carregar diz claramente
 * o que vai acontecer.
 */

import type { Tema, TempoInicial } from "../session/settings";
import { botao, cabecalho, elemento } from "./dom";

const TEMAS: readonly { readonly valor: Tema; readonly rotulo: string }[] = [
  { valor: "sistema", rotulo: "Sistema" },
  { valor: "claro", rotulo: "Claro" },
  { valor: "escuro", rotulo: "Escuro" },
];

const TEMPOS: readonly TempoInicial[] = [30, 60, 90];

export interface OpcoesDefinicoes {
  readonly tema: Tema;
  readonly aoMudarTema: (tema: Tema) => void;
  readonly tempoInicial: TempoInicial;
  readonly aoMudarTempoInicial: (segundos: TempoInicial) => void;
  readonly aoApagarProgresso: () => void;
  readonly aoVoltar: () => void;
}

export class DefinicoesScreen {
  private readonly raiz: HTMLElement;
  private readonly opcoes: OpcoesDefinicoes;
  private armado = false;

  constructor(host: HTMLElement, opcoes: OpcoesDefinicoes) {
    this.opcoes = opcoes;
    this.raiz = elemento("div", "ecra");

    const { el: topo } = cabecalho("Definições", opcoes.aoVoltar);

    const rolo = elemento("div", "rolo");
    rolo.append(
      this.seccaoTema(),
      this.seccaoContraRelogio(),
      this.seccaoProgresso(),
    );

    this.raiz.append(topo, rolo);
    host.replaceChildren(this.raiz);
  }

  destruir(): void {
    this.raiz.remove();
  }

  private seccao(titulo: string, nota?: string): HTMLElement {
    const el = elemento("section", "definicao");
    el.appendChild(elemento("h2", undefined, titulo));
    if (nota !== undefined) el.appendChild(elemento("p", "nota", nota));
    return el;
  }

  private seccaoTema(): HTMLElement {
    const el = this.seccao(
      "Tema",
      "As faces não mudam de tema — uma peça é a mesma peça nos dois fundos.",
    );

    const grupo = elemento("div", "segmentado");
    grupo.setAttribute("role", "radiogroup");
    grupo.setAttribute("aria-label", "tema");

    for (const { valor, rotulo } of TEMAS) {
      const b = botao(rotulo, "segmento", () => {
        this.opcoes.aoMudarTema(valor);
        for (const outro of grupo.querySelectorAll("[role=radio]")) {
          outro.setAttribute(
            "aria-checked",
            String(outro === b),
          );
        }
      });

      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(valor === this.opcoes.tema));
      grupo.appendChild(b);
    }

    el.appendChild(grupo);
    return el;
  }

  /**
   * Quanto tempo o contra-relógio dá à partida.
   *
   * Só afeta a corrida seguinte — mexer no relógio de uma corrida a decorrer
   * seria mudar as regras a meio, e as definições nem sequer são alcançáveis
   * sem sair dela.
   */
  private seccaoContraRelogio(): HTMLElement {
    const el = this.seccao(
      "Contra-Relógio",
      "Tempo de arranque. Cada tabuleiro limpo acrescenta ao mesmo relógio.",
    );

    const grupo = elemento("div", "segmentado");
    grupo.setAttribute("role", "radiogroup");
    grupo.setAttribute("aria-label", "tempo de arranque");

    for (const segundos of TEMPOS) {
      const b = botao(`${String(segundos)}s`, "segmento", () => {
        this.opcoes.aoMudarTempoInicial(segundos);
        for (const outro of grupo.querySelectorAll("[role=radio]")) {
          outro.setAttribute("aria-checked", String(outro === b));
        }
      });

      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(segundos === this.opcoes.tempoInicial));
      grupo.appendChild(b);
    }

    el.appendChild(grupo);
    return el;
  }

  private seccaoProgresso(): HTMLElement {
    const el = this.seccao(
      "Progresso",
      "Apaga os selos, os melhores resultados e os recordes do Contra-Relógio. Não tem volta.",
    );

    const b = botao("Apagar o progresso", "perigo");

    b.addEventListener("click", () => {
      if (!this.armado) {
        this.armado = true;
        b.textContent = "Carrega outra vez para apagar tudo";
        return;
      }

      this.opcoes.aoApagarProgresso();
      this.armado = false;
      b.textContent = "Progresso apagado";
      b.disabled = true;
    });

    el.appendChild(b);
    return el;
  }
}
