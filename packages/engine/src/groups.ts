/**
 * Validade de um grupo (spec §3.1).
 *
 * A *enumeração* de grupos (spec §3.2) é da fase 2 e vive noutro sítio — aqui só
 * se responde a "este conjunto de células é uma jogada legal?". `applyMove`
 * depende desta resposta, e o gerador depende de `isConnected` para validar a
 * inversão (spec §6.3).
 */

import type { Board, Group, Packed } from "./types";
import { JOKER, TARGET } from "./types";
import { cellAt, neighbours } from "./board";

/** Soma das faces **fixas** do grupo. O joker conta 0 (spec §3.2). */
export function groupSum(b: Board, g: Group): number {
  let s = 0;
  for (const p of g) s += cellAt(b, p) ?? 0;
  return s;
}

export function groupHasJoker(b: Board, g: Group): boolean {
  for (const p of g) if (cellAt(b, p) === JOKER) return true;
  return false;
}

/**
 * Valor que o joker toma dentro deste grupo, ou `undefined` se o grupo não tem
 * joker. Dentro de um grupo válido só existe um valor possível, portanto
 * resolve-se sozinho — o jogador nunca o escolhe (spec §2.6).
 */
export function groupJokerValue(b: Board, g: Group): number | undefined {
  if (!groupHasJoker(b, g)) return undefined;
  return TARGET - groupSum(b, g);
}

/**
 * Conexo pela adjacência de §2.4.
 *
 * Exportado porque o gerador precisa dele para validar a inversão (spec §6.3),
 * onde o grupo inserido tem de ser confirmado como conexo no tabuleiro
 * candidato.
 */
export function isConnected(b: Board, cells: Group): boolean {
  const inicio = cells[0];
  if (inicio === undefined) return false;

  const alvo = new Set<Packed>(cells);
  const visto = new Set<Packed>([inicio]);
  const pilha: Packed[] = [inicio];

  while (pilha.length > 0) {
    const p = pilha.pop() as Packed;
    for (const q of neighbours(b, p)) {
      if (alvo.has(q) && !visto.has(q)) {
        visto.add(q);
        pilha.push(q);
      }
    }
  }

  return visto.size === alvo.size;
}

/**
 * Um grupo é válido se (spec §3.1):
 *
 * 1. É canónico — estritamente crescente, e todas as células existem.
 * 2. É conexo pela adjacência de §2.4.
 * 3. Sem joker: soma das faces `=== 7`.
 * 4. Com joker: `1 <= soma das faces fixas <= 6`, e o joker toma o que falta.
 *    A fronteira inferior é o que impede o joker de formar grupo sozinho — o
 *    valor máximo de uma face é 6, portanto precisa sempre de companhia.
 */
export function isValidGroup(b: Board, g: Group): boolean {
  if (g.length === 0) return false;

  let anterior = -1;
  let jokers = 0;
  let fixas = 0;

  for (const p of g) {
    if (p <= anterior) return false; // fora de ordem ou repetida
    anterior = p;

    const cell = cellAt(b, p);
    if (cell === undefined) return false; // fora da silhueta

    if (cell === JOKER) jokers++;
    else fixas += cell;
  }

  // Um tabuleiro canónico nunca tem dois jokers, mas se tivesse o valor deixaria
  // de estar determinado — e a ambiguidade não pode entrar por aqui.
  if (jokers > 1) return false;

  if (!isConnected(b, g)) return false;

  return jokers === 0 ? fixas === TARGET : fixas >= 1 && fixas <= TARGET - 1;
}
