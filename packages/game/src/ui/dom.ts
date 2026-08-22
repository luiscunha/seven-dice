/**
 * As peças de DOM que todos os ecrãs repetem.
 *
 * Existe porque a partir de seis ecrãs a mesma fábrica de botão estava escrita
 * seis vezes, e seis cópias divergem — foi o que já aconteceu com o `jokerValue`
 * na Fase 7.
 */

export const texto = (s: string): Text => document.createTextNode(s);

export function botao(
  rotulo: string,
  extra?: string,
  aoClicar?: () => void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = extra === undefined ? "btn" : `btn ${extra}`;
  b.textContent = rotulo;
  if (aoClicar !== undefined) b.addEventListener("click", aoClicar);
  return b;
}

export function elemento(
  tag: string,
  classe?: string,
  conteudo?: string,
): HTMLElement {
  const el = document.createElement(tag);
  if (classe !== undefined) el.className = classe;
  if (conteudo !== undefined) el.textContent = conteudo;
  return el;
}

/**
 * O cabeçalho de um ecrã que não é a Home: seta para trás e título.
 *
 * A seta chama `aoVoltar` em vez de `history.back()`. Voltar **na hierarquia** e
 * voltar **no histórico** não são a mesma coisa: quem chega a um nível por link
 * direto não tem para onde recuar no histórico, mas tem sempre a lista da banda
 * acima de si.
 */
export function cabecalho(
  titulo: string,
  aoVoltar: () => void,
): { readonly el: HTMLElement; readonly elTitulo: HTMLElement } {
  const el = elemento("header", "topo");

  const voltar = botao("‹", "redondo", aoVoltar);
  voltar.setAttribute("aria-label", "voltar");

  const elTitulo = elemento("h1", undefined, titulo);

  el.append(voltar, elTitulo);
  return { el, elTitulo };
}

/**
 * Uma confirmação, em pop-up ao meio do ecrã.
 *
 * Existe por causa do telemóvel. Um dedo acerta ao lado do que queria com muito
 * mais frequência do que um rato, e as ações que aqui pede confirmação — sair,
 * reiniciar, recomeçar — deitam fora uma partida inteira. Perguntar custa um
 * toque; não perguntar custa o jogo todo.
 *
 * **Só se pergunta quando há o que perder.** Uma confirmação sobre uma corrida
 * já terminada não protege nada e é ruído — e uma caixa que aparece sempre é
 * uma caixa que se aprende a despachar sem ler, o que a torna pior do que não
 * existir.
 *
 * O botão que confirma **não** é o primário: o realce fica em cancelar, porque
 * quem chegou aqui por engano é quem precisa da saída fácil.
 */
export interface OpcoesConfirmar {
  readonly titulo: string;
  readonly texto?: string;
  /** O rótulo da ação a sério. «Sim» não diz o que vai acontecer. */
  readonly confirmar: string;
  readonly aoConfirmar: () => void;
}

export function confirmar(
  host: HTMLElement,
  opcoes: OpcoesConfirmar,
): HTMLDialogElement {
  const d = document.createElement("dialog");
  // Classe própria: os ecrãs já têm um `.popup` seu, e os dois não se confundem.
  d.className = "popup confirmacao";

  const corpo = elemento("div", "popup-corpo");
  corpo.appendChild(elemento("h2", "popup-titulo", opcoes.titulo));
  if (opcoes.texto !== undefined) {
    corpo.appendChild(elemento("p", "popup-texto", opcoes.texto));
  }

  const fechar = (): void => {
    if (typeof d.close === "function") d.close();
    else d.open = false;
    d.remove();
  };

  const acoes = elemento("div", "acoes");
  acoes.append(
    botao("Cancelar", "primario", fechar),
    botao(opcoes.confirmar, undefined, () => {
      fechar();
      opcoes.aoConfirmar();
    }),
  );
  corpo.appendChild(acoes);

  // Tocar fora cancela: é o gesto de quem percebeu que se enganou.
  d.addEventListener("click", (e) => {
    if (e.target === d) fechar();
  });

  d.appendChild(corpo);
  host.appendChild(d);

  if (typeof d.showModal === "function") d.showModal();
  else d.open = true;

  return d;
}
