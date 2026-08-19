/**
 * Solver (spec §5).
 *
 * Três perguntas, cada uma mais cara do que a anterior:
 *
 * - `isSolvable` — existe *alguma* sequência que esvazia o tabuleiro?
 * - `findSolution` — qual é ela?
 * - `isGreedySafe` — é impossível bloquear, jogue-se como se jogar?
 *
 * As duas primeiras param na primeira solução; a terceira tem de visitar todos
 * os estados alcançáveis, e é por isso que só se aplica a tabuleiros pequenos —
 * que são precisamente os do modo tempo (plano §6.3).
 */

import type { Board, Group } from "./types";
import { boardKey } from "./board";
import { findAllGroups } from "./groups";
import { applyMove } from "./moves";

/**
 * Três valores, não `boolean`.
 *
 * O gerador vai chamar isto milhares de vezes e um caso patológico não pode
 * parar o pipeline: `"inconclusive"` significa que se atingiu um limite, e o
 * candidato descarta-se sem mais perguntas (spec §5.1).
 */
export type Verdict = "yes" | "no" | "inconclusive";

/**
 * Limites da pesquisa. Obrigatórios na prática — sem eles, um tabuleiro
 * patológico pende indefinidamente.
 */
export interface Limits {
  /**
   * Estados expandidos antes de desistir.
   *
   * É o limite **determinístico**: o mesmo tabuleiro dá sempre o mesmo veredicto,
   * em qualquer máquina.
   */
  readonly maxStates: number;

  /**
   * Orçamento de tempo, opcional, e com o relógio **injetado** — a engine não
   * tem nenhum (spec §1.1).
   *
   * Vem em par com o relógio de propósito. Um limite de tempo torna o veredicto
   * dependente da velocidade da máquina: um candidato aceite no portátil rápido
   * seria descartado no lento, e as seeds deixariam de produzir os mesmos níveis
   * (spec §7.1). Quem o usa está a trocar reprodutibilidade por um teto de
   * latência, e essa troca tem de ser explícita.
   *
   * O pipeline offline não o usa. É para consumidores interativos — uma dica
   * pedida no meio de um nível, por exemplo.
   */
  readonly timeBudget?: {
    readonly now: () => number;
    readonly millis: number;
  };
}

export const DEFAULT_LIMITS: Limits = { maxStates: 200_000 };

/** O relógio custa; consultá-lo a cada estado seria pior que o problema. */
const MASCARA_RELOGIO = 1023;

interface Contexto {
  readonly memo: Set<string>;
  readonly limits: Limits;
  readonly inicio: number;
  estados: number;
  esgotado: boolean;
}

function criarContexto(limits: Limits): Contexto {
  return {
    memo: new Set<string>(),
    limits,
    inicio: limits.timeBudget?.now() ?? 0,
    estados: 0,
    esgotado: false,
  };
}

function excedeu(ctx: Contexto): boolean {
  if (ctx.esgotado) return true;

  if (ctx.estados >= ctx.limits.maxStates) {
    ctx.esgotado = true;
    return true;
  }

  const orcamento = ctx.limits.timeBudget;
  if (
    orcamento !== undefined &&
    (ctx.estados & MASCARA_RELOGIO) === 0 &&
    orcamento.now() - ctx.inicio >= orcamento.millis
  ) {
    ctx.esgotado = true;
    return true;
  }

  return false;
}

/**
 * DFS com memoização de **estados falhados**.
 *
 * A memoização não é otimização — é o que torna a pesquisa viável. Jogadas
 * independentes comutam, portanto o mesmo estado é alcançado por muitos caminhos
 * diferentes (plano §5.3), e sem memo o trabalho repete-se factorialmente.
 *
 * `boardKey` serve diretamente de chave: o tabuleiro está sempre em forma
 * canónica (spec §2.6).
 *
 * A profundidade máxima é `peças / 2` — cada jogada retira pelo menos duas —
 * portanto cerca de 25 num tabuleiro grande, muito abaixo do limite de stack do
 * V8. Recursão direta é segura.
 */
function resolver(b: Board, ctx: Contexto): boolean {
  if (b.length === 0) return true;
  if (excedeu(ctx)) return false;

  const chave = boardKey(b);
  if (ctx.memo.has(chave)) return false;

  ctx.estados++;

  for (const g of findAllGroups(b)) {
    if (resolver(applyMove(b, g), ctx)) return true;

    // Desistir por limite não é o mesmo que provar que falha, portanto sai-se
    // daqui **sem** memoizar.
    //
    // Hoje isto é defensivo, não corretivo: o memo vive só durante a chamada, e
    // depois de `esgotado` nenhum veredicto pode ser "no" — só "yes" (se um
    // ramo já tinha esvaziado) ou "inconclusive". Uma entrada a mais no memo não
    // muda resposta nenhuma, e uma mutação que remova esta linha passa nos
    // testes.
    //
    // Vale a pena mesmo assim: partilhar o memo entre chamadas é a otimização
    // óbvia a tentar no pipeline da fase 5, e é nesse dia que uma conclusão que
    // não se tirou passa a contaminar candidatos seguintes.
    if (ctx.esgotado) return false;
  }

  ctx.memo.add(chave);
  return false;
}

export function isSolvable(b: Board, limits: Limits = DEFAULT_LIMITS): Verdict {
  const ctx = criarContexto(limits);

  if (resolver(b, ctx)) return "yes";
  return ctx.esgotado ? "inconclusive" : "no";
}

/**
 * O mesmo, guardando o caminho.
 *
 * Experimenta os grupos maiores primeiro (spec §5.4): reduzem mais o tabuleiro
 * por jogada, portanto tendem a chegar à solução mais depressa. É o único sítio
 * onde materializar `findAllGroups` se justifica — sem a lista completa não há
 * como ordenar.
 *
 * O `sort` do JavaScript é estável, portanto empates mantêm a ordem de
 * enumeração e a solução devolvida é determinística.
 */
function procurarSolucao(b: Board, ctx: Contexto, caminho: Group[]): boolean {
  if (b.length === 0) return true;
  if (excedeu(ctx)) return false;

  const chave = boardKey(b);
  if (ctx.memo.has(chave)) return false;

  ctx.estados++;

  const grupos = [...findAllGroups(b)].sort((x, y) => y.length - x.length);

  for (const g of grupos) {
    caminho.push(g);
    if (procurarSolucao(applyMove(b, g), ctx, caminho)) return true;
    caminho.pop();

    if (ctx.esgotado) return false;
  }

  ctx.memo.add(chave);
  return false;
}

/**
 * Uma solução, ou `null` — tanto quando se prova que não há como quando se
 * atinge um limite. Quem precisa de distinguir os dois casos chama `isSolvable`.
 */
export function findSolution(
  b: Board,
  limits: Limits = DEFAULT_LIMITS,
): Group[] | null {
  const ctx = criarContexto(limits);
  const caminho: Group[] = [];

  return procurarSolucao(b, ctx, caminho) ? caminho : null;
}

/**
 * **Nenhum** estado alcançável é um beco sem saída (spec §5.3).
 *
 * É a condição do modo tempo (plano §6.3): o jogador nunca perde por jogar mal,
 * só por ser lento. Provar isto exige visitar todos os estados alcançáveis, não
 * só um caminho — bastante mais caro que `isSolvable`, e por isso reservado a
 * tabuleiros pequenos.
 *
 * A ordem de visita é irrelevante (spec §5.4), portanto a travessia é iterativa:
 * o grafo de estados é largo, não profundo, e uma pilha explícita evita depender
 * do stack.
 */
export function isGreedySafe(
  b: Board,
  limits: Limits = DEFAULT_LIMITS,
): Verdict {
  const ctx = criarContexto(limits);

  const visitados = new Set<string>([boardKey(b)]);
  const pilha: Board[] = [b];

  while (pilha.length > 0) {
    if (excedeu(ctx)) return "inconclusive";

    const atual = pilha.pop() as Board;
    ctx.estados++;

    if (atual.length === 0) continue; // tabuleiro limpo: fim legítimo

    let temJogada = false;

    for (const g of findAllGroups(atual)) {
      temJogada = true;

      const seguinte = applyMove(atual, g);
      const chave = boardKey(seguinte);

      if (!visitados.has(chave)) {
        visitados.add(chave);
        pilha.push(seguinte);
      }
    }

    // Peças no tabuleiro e nenhuma jogada: encontrou-se um beco sem saída
    // alcançável, e basta um para o tabuleiro não servir ao modo tempo.
    if (!temJogada) return "no";
  }

  return "yes";
}
