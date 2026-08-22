/**
 * Injeção de linhas (modo Survival).
 *
 * A operação inversa da jogada: em vez de tirar células e deixar cair o que
 * está por cima, acrescenta uma linha **no topo**.
 *
 * Sai quase de graça da representação. As colunas guardam-se de baixo para
 * cima, portanto o topo de uma coluna é o **fim** do array, e acrescentar uma
 * linha é um `concat` por coluna. As duas invariantes automáticas mantêm-se
 * sozinhas: nenhuma coluna fica vazia (só ganham células) e nenhuma ganha
 * buracos (acrescenta-se no fim, nunca no meio).
 *
 * **Pelo topo e nunca pelo lado.** Injetar colunas à esquerda seria igualmente
 * barato de escrever e uma fonte permanente de confusão a jogar: o colapso já
 * empurra colunas para a esquerda quando esvaziam, e teríamos dois movimentos
 * laterais a competir, com o jogador a ter de distinguir qual deles mexeu o
 * tabuleiro debaixo do dedo.
 *
 * Continua a não haver aleatoriedade nenhuma aqui. Que células entram é decisão
 * de quem chama — a fila com seed vive na camada de sessão, como manda a regra
 * 5: a engine não sabe em que modo está.
 */

import type { Board, Cell, Column } from "./types";
import { JOKER, MAX_ROWS } from "./types";

export class InvalidInjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInjectionError";
  }
}

/**
 * Devolve um tabuleiro **novo** com `row` acrescentada por cima.
 *
 * `row[c]` é a célula que entra na coluna `c`; `null` deixa essa coluna como
 * está, que é o que permite linhas recortadas. Uma linha mais larga do que o
 * tabuleiro **alarga-o**, criando colunas novas à direita — é isso que impede a
 * espiral de morte descrita abaixo.
 *
 * As colunas que a linha não toca são partilhadas por referência, como em
 * `applyMove`.
 *
 * ### Porque é que a linha entra à largura cheia
 *
 * O colapso de colunas estreita o tabuleiro sempre que uma coluna esvazia. Se a
 * linha injetada seguisse a largura atual, limpar uma coluna encolhia a área de
 * jogo **para sempre**, e o jogador era punido por jogar bem. Entrando à largura
 * cheia, o colapso passa a ser alívio: as células que caem sobre o vazio descem
 * até à base pela gravidade normal, e a largura volta ao que era.
 *
 * @throws {InvalidInjectionError} se alguma coluna passasse de `MAX_ROWS`, se a
 * linha deixasse buracos na base, ou se o tabuleiro ficasse com mais de um
 * joker (invariante 3).
 */
export function pushRow(b: Board, row: readonly (Cell | null)[]): Board {
  const largura = Math.max(b.length, row.length);
  const saida: Column[] = [];

  for (let c = 0; c < largura; c++) {
    const col = b[c];
    const cell = row[c] ?? null;

    if (cell === null) {
      /*
       * Uma coluna que não existe e não recebe célula deixaria um buraco na
       * base — a invariante 1 diz que nenhuma coluna é vazia, e não há forma de
       * representar "coluna ausente" no meio do tabuleiro.
       */
      if (col === undefined) {
        throw new InvalidInjectionError(
          `a linha não preenche a coluna ${String(c)}, que ainda não existe`,
        );
      }
      saida.push(col);
      continue;
    }

    const altura = (col?.length ?? 0) + 1;
    if (altura > MAX_ROWS) {
      throw new InvalidInjectionError(
        `a coluna ${String(c)} chegaria a ${String(altura)} células e o limite das coordenadas empacotadas é ${String(MAX_ROWS)}`,
      );
    }

    saida.push(col === undefined ? [cell] : [...col, cell]);
  }

  const jokers = saida.reduce(
    (n, col) => n + col.filter((v) => v === JOKER).length,
    0,
  );
  if (jokers > 1) {
    throw new InvalidInjectionError(
      `invariante 3: o tabuleiro ficaria com ${String(jokers)} jokers`,
    );
  }

  return saida;
}

/**
 * A coluna mais alta. É por ela que se mede a proximidade da derrota.
 *
 * Num tabuleiro vazio é 0, e não `-Infinity` — quem lê isto está a comparar com
 * um limite, e um vazio está o mais longe possível de o atingir.
 */
export const tallestColumn = (b: Board): number =>
  b.reduce((max, col) => Math.max(max, col.length), 0);
