/**
 * Desenho do tabuleiro em texto.
 *
 * Funções puras, sem I/O — o ciclo de jogo chama-as e escreve o resultado.
 *
 * Duas decisões de apresentação que não são estéticas:
 *
 * - **As coordenadas são as do motor.** Coluna por letra, linha por número **a
 *   partir da base**, como em `[E 2.2]`. Uma numeração "amiga" que começasse em 1
 *   ou contasse de cima para baixo contaminaria justamente o que esta fase
 *   existe para medir: se o jogador consegue prever a reorganização.
 * - **As colunas curtas ficam em branco, sem caixa.** A silhueta é o recorte no
 *   topo (plano §3.2), e desenhar celas vazias por cima escondê-la-ia.
 */

import type { Board, Group, Packed } from "@sete/engine";
import { JOKER, cellAt, colOf, height, packed, rowOf, width } from "@sete/engine";

const LETRAS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const letraDaColuna = (c: number): string => LETRAS[c] ?? "?";

/** `"b3"` → coordenada empacotada. `undefined` se não for uma coordenada. */
export function lerCoordenada(texto: string): Packed | undefined {
  const m = /^([a-zA-Z])(\d{1,2})$/.exec(texto.trim());
  if (m === null) return undefined;

  const c = LETRAS.indexOf(m[1] as string);
  const r = Number(m[2]);

  return c < 0 || r > 63 ? undefined : packed(c, r);
}

export const escreverCoordenada = (p: Packed): string =>
  `${letraDaColuna(colOf(p))}${rowOf(p)}`;

export const escreverGrupo = (g: Group): string =>
  g.map(escreverCoordenada).join(" ");

const alturaMaxima = (b: Board): number =>
  b.reduce((max, col) => Math.max(max, col.length), 0);

export interface OpcoesDesenho {
  /** Realçadas com parênteses retos — a seleção corrente. */
  readonly selecao?: ReadonlySet<Packed>;
  /** Realçadas com chavetas — usado pelas dicas. */
  readonly marcadas?: ReadonlySet<Packed>;

  /**
   * Desenhadas como buraco. É o **estado intermédio** da jogada: o grupo já
   * saiu, a gravidade ainda não caiu.
   *
   * Existe só aqui, no desenho, porque esse estado **não é representável** como
   * `Board` — teria buracos a meio de uma coluna, e as invariantes de `[E 2.2]`
   * tornam isso impossível por construção. É a mesma escolha de representação
   * que faz a gravidade sair de graça a mostrar a sua outra face: o que não se
   * consegue exprimir também não se consegue estragar.
   */
  readonly removidas?: ReadonlySet<Packed>;
}

/**
 * Uma célula ocupa sempre quatro caracteres, para as colunas alinharem quando
 * há realces.
 */
function celula(
  b: Board,
  p: Packed,
  opcoes: OpcoesDesenho,
): string {
  const valor = cellAt(b, p);
  if (valor === undefined) return "    ";

  if (opcoes.removidas?.has(p) === true) return " ·  ";

  const simbolo = valor === JOKER ? "*" : String(valor);

  if (opcoes.selecao?.has(p) === true) return `[${simbolo}] `;
  if (opcoes.marcadas?.has(p) === true) return `{${simbolo}} `;
  return ` ${simbolo}  `;
}

export function desenharTabuleiro(
  b: Board,
  opcoes: OpcoesDesenho = {},
): string {
  const largura = width(b);
  if (largura === 0) return "    (tabuleiro vazio)";

  const alto = alturaMaxima(b);
  const linhas: string[] = [];

  for (let r = alto - 1; r >= 0; r--) {
    const celulas = Array.from({ length: largura }, (_, c) =>
      r < height(b, c) ? celula(b, packed(c, r), opcoes) : "    ",
    );
    linhas.push(`  ${String(r).padStart(2)} │ ${celulas.join("")}`);
  }

  linhas.push(`     └${"────".repeat(largura)}`);
  linhas.push(
    `       ${Array.from({ length: largura }, (_, c) => ` ${letraDaColuna(c)}  `).join("")}`,
  );

  return linhas.join("\n");
}

/**
 * Estado da seleção corrente. O joker conta 0, como em toda a engine — a soma
 * mostrada é a das faces fixas, e é isso que o jogador tem de somar de cabeça.
 */
export function descreverSelecao(
  b: Board,
  selecao: readonly Packed[],
): string {
  if (selecao.length === 0) return "seleção: (vazia)";

  const partes = selecao.map((p) => {
    const v = cellAt(b, p);
    return `${escreverCoordenada(p)}=${v === JOKER ? "*" : String(v ?? "?")}`;
  });

  const soma = selecao.reduce((s, p) => {
    const v = cellAt(b, p);
    return s + (v === undefined || v === JOKER ? 0 : v);
  }, 0);

  const temJoker = selecao.some((p) => cellAt(b, p) === JOKER);

  return `seleção: ${partes.join(" + ")}  =  ${soma}${temJoker ? " (+ joker)" : ""}`;
}
