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
