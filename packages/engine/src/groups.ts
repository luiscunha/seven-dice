/**
 * Grupos: validade (spec §3.1) e enumeração (spec §3.2).
 *
 * Duas perguntas distintas. "Este conjunto de células é uma jogada legal?" é
 * `isValidGroup`, de que `applyMove` depende. "Quais são todas as jogadas?" é
 * `findAllGroups`, de que dependem o solver, o gerador e os playouts.
 */

import type { Board, Cell, Group, Packed } from "./types";
import { JOKER, TARGET, packed } from "./types";
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

/* ─── Enumeração (spec §3.2) ─────────────────────────────────────────────────
 *
 * O problema é enumerar **subgrafos conexos** com soma ≤ 7, cada um exatamente
 * uma vez. A abordagem ingénua — DFS a partir de cada célula — gera o mesmo
 * grupo várias vezes, uma por ordem de visita. Duplicados não são só desperdício:
 * corrompem o branching factor (plano §5.2) e inflacionam a contagem de estados
 * (plano §5.3), que são as métricas de que a classificação de dificuldade depende.
 *
 * A solução é a **enumeração por célula mínima**: para cada célula `raiz`,
 * enumeram-se apenas os grupos em que ela é a de menor índice.
 *
 * Duas estruturas fazem o trabalho:
 *
 * - `ext` — as células por onde o grupo ainda pode crescer. A cada passo
 *   escolhe-se uma e passa-se adiante **só o que vem depois dela**. É isto que
 *   garante que cada conjunto é construído por uma única ordem.
 * - `proibidas` — `grupo ∪ vizinhança(grupo)`. Um vizinho de `w` que já era
 *   vizinho do grupo não volta a entrar: o ramo que o inclui é gerado no passo
 *   em que ele próprio foi escolhido. Sem isto, um triângulo produz `{a,b,c}`
 *   duas vezes.
 */

/**
 * Um grupo em construção é válido pelas mesmas regras de §3.1, mas a conexão e a
 * forma canónica são garantidas por construção — só falta verificar a soma.
 */
const somaValida = (fixas: number, temJoker: boolean): boolean =>
  temJoker ? fixas >= 1 && fixas <= TARGET - 1 : fixas === TARGET;

/**
 * Poda. A soma das fixas só cresce, portanto um ramo que já a tenha em 7 não
 * pode dar mais nenhum grupo válido — nem sem joker (passaria de 7) nem com
 * joker (que exige fixas ≤ 6).
 *
 * É daqui que vem o limite de 7 células: o mínimo de uma face é 1.
 */
const podar = (fixas: number): boolean => fixas >= TARGET;

function* expandir(
  b: Board,
  grupo: readonly Packed[],
  fixas: number,
  temJoker: boolean,
  ext: readonly Packed[],
  raiz: Packed,
  proibidas: ReadonlySet<Packed>,
): Generator<Group> {
  if (somaValida(fixas, temJoker)) {
    // `grupo` está por ordem de expansão; o `Group` canónico é ordenado (§3.3).
    yield [...grupo].sort((x, y) => x - y);
  }

  if (podar(fixas)) return;

  for (let i = 0; i < ext.length; i++) {
    const w = ext[i] as Packed;
    const cell = cellAt(b, w) as Cell;

    const novas: Packed[] = [];
    for (const u of neighbours(b, w)) {
      if (u > raiz && !proibidas.has(u)) novas.push(u);
    }

    yield* expandir(
      b,
      [...grupo, w],
      cell === JOKER ? fixas : fixas + cell,
      temJoker || cell === JOKER,
      [...ext.slice(i + 1), ...novas],
      raiz,
      novas.length === 0 ? proibidas : new Set([...proibidas, ...novas]),
    );
  }
}

/**
 * Todos os grupos válidos do tabuleiro, cada um **exatamente uma vez**, em forma
 * canónica.
 *
 * É um **generator** de propósito: quase todos os consumidores param cedo —
 * escolher uma jogada ao acaso num playout, procurar a primeira solução — e
 * materializar o array completo seria desperdício. Quem precisa de todos faz
 * `[...findAllGroups(b)]`.
 */
export function* findAllGroups(b: Board): Generator<Group> {
  for (let c = 0; c < b.length; c++) {
    const col = b[c];
    if (col === undefined) continue;

    for (let r = 0; r < col.length; r++) {
      const raiz = packed(c, r);
      const cell = col[r] as Cell;

      const ext: Packed[] = [];
      const proibidas = new Set<Packed>([raiz]);
      for (const u of neighbours(b, raiz)) {
        proibidas.add(u);
        if (u > raiz) ext.push(u);
      }

      yield* expandir(
        b,
        [raiz],
        cell === JOKER ? 0 : cell,
        cell === JOKER,
        ext,
        raiz,
        proibidas,
      );
    }
  }
}

/**
 * Existe pelo menos uma jogada?
 *
 * Implementação própria, e não `findAllGroups(b).next()`, porque este é o
 * caminho mais quente de todo o pipeline: é chamado a cada passo de cada playout
 * (spec §3.3). Percorre a mesma árvore, mas não constrói nem ordena grupo
 * nenhum — só precisa de saber que existe — e evita a delegação `yield*`, que é
 * proporcional à profundidade a cada emissão.
 *
 * A duplicação de estrutura em relação a `expandir` é deliberada e está guardada
 * por um teste de equivalência.
 */
function procurar(
  b: Board,
  fixas: number,
  temJoker: boolean,
  ext: readonly Packed[],
  raiz: Packed,
  proibidas: ReadonlySet<Packed>,
): boolean {
  if (somaValida(fixas, temJoker)) return true;
  if (podar(fixas)) return false;

  for (let i = 0; i < ext.length; i++) {
    const w = ext[i] as Packed;
    const cell = cellAt(b, w) as Cell;

    const novas: Packed[] = [];
    for (const u of neighbours(b, w)) {
      if (u > raiz && !proibidas.has(u)) novas.push(u);
    }

    const achou = procurar(
      b,
      cell === JOKER ? fixas : fixas + cell,
      temJoker || cell === JOKER,
      [...ext.slice(i + 1), ...novas],
      raiz,
      novas.length === 0 ? proibidas : new Set([...proibidas, ...novas]),
    );

    if (achou) return true;
  }

  return false;
}

export function hasAnyGroup(b: Board): boolean {
  for (let c = 0; c < b.length; c++) {
    const col = b[c];
    if (col === undefined) continue;

    for (let r = 0; r < col.length; r++) {
      const raiz = packed(c, r);
      const cell = col[r] as Cell;

      const ext: Packed[] = [];
      const proibidas = new Set<Packed>([raiz]);
      for (const u of neighbours(b, raiz)) {
        proibidas.add(u);
        if (u > raiz) ext.push(u);
      }

      if (
        procurar(b, cell === JOKER ? 0 : cell, cell === JOKER, ext, raiz, proibidas)
      ) {
        return true;
      }
    }
  }

  return false;
}
