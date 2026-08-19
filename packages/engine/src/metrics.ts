/**
 * Medição de dificuldade (spec §7).
 *
 * A dificuldade **não se define na geração — mede-se depois** (plano §5). Este
 * módulo é a parte pura dessa medição: playouts semeados e o piso de justiça. O
 * paralelismo e o pipeline vivem no pacote `tools`, porque a engine mantém-se
 * single-threaded e agnóstica (spec §7.2).
 */

import type { Board, Group } from "./types";
import { boardKey, pieceCount } from "./board";
import { findAllGroups, groupHasJoker } from "./groups";
import { applyMove } from "./moves";
import type { Limits, Verdict } from "./solver";
import { isSolvable } from "./solver";
import type { Rng } from "./rng";
import { deriveSeed, mulberry32 } from "./rng";

/**
 * O piso corre por candidato, milhares de vezes. `DEFAULT_LIMITS` é generoso
 * demais para isso — e aqui um `"inconclusive"` custa pouco, porque descartar um
 * candidato duvidoso é a direção segura.
 */
export const LIMITES_PISO: Limits = { maxStates: 20_000 };

export interface SurvivalResult {
  readonly runs: number;
  readonly survived: number;

  /** Métrica principal (plano §5.1). 1 significa greedy-safe *na amostra*. */
  readonly survivalRate: number;

  /** Grupos válidos por estado visitado. Muitas opções e baixa sobrevivência é
   * boa dificuldade; poucas opções e baixa sobrevivência é frustração. */
  readonly avgBranching: number;

  /**
   * Em que jogada, em média, o jogador se pinta ao canto. `null` quando nenhum
   * playout falhou — não há profundidade fatal a reportar, e zero seria mentira.
   */
  readonly firstFatalDepth: number | null;

  /** Grupos válidos por peça restante. Baixa = mais tempo a varrer. */
  readonly avgMoveDensity: number;

  /** Proxy direto de carga percetiva (plano §5.2). */
  readonly avgGroupSize: number;
}

/** O que um playout observou. Acumula-se sem alocar por estado. */
interface Acumulador {
  estados: number;
  grupos: number;
  densidade: number;
  jogadas: number;
  tamanhoGrupos: number;
}

/**
 * Escolhe um grupo válido ao acaso **num único varrimento**, devolvendo também
 * quantos havia.
 *
 * Amostragem por reservatório em vez de materializar `[...findAllGroups(b)]`: o
 * branching factor precisa da contagem e o playout precisa de uma escolha
 * uniforme, e assim obtêm-se as duas sem alocar um array por estado. Com milhares
 * de playouts a percorrer dezenas de estados cada, é a diferença entre criar e
 * não criar centenas de milhares de arrays (spec §11, pressão de GC).
 */
function amostrarJogada(
  b: Board,
  rng: Rng,
): { readonly escolhido: Group | undefined; readonly total: number } {
  let total = 0;
  let escolhido: Group | undefined;

  for (const g of findAllGroups(b)) {
    total++;
    // Substituir com probabilidade 1/total dá uniformidade sem guardar nada.
    if (rng() * total < 1) escolhido = g;
  }

  return { escolhido, total };
}

/**
 * Um playout: escolher um grupo válido ao acaso a cada passo, até esvaziar o
 * tabuleiro ou bloquear.
 *
 * Devolve a profundidade a que bloqueou, ou `null` se chegou ao fim.
 */
function playoutInterno(
  b: Board,
  rng: Rng,
  acc: Acumulador | undefined,
): number | null {
  let atual = b;
  let profundidade = 0;

  while (atual.length > 0) {
    const { escolhido, total } = amostrarJogada(atual, rng);

    if (acc !== undefined) {
      acc.estados++;
      acc.grupos += total;
      acc.densidade += total / pieceCount(atual);
    }

    if (escolhido === undefined) return profundidade; // beco sem saída

    if (acc !== undefined) {
      acc.jogadas++;
      acc.tamanhoGrupos += escolhido.length;
    }

    atual = applyMove(atual, escolhido);
    profundidade++;
  }

  return null;
}

/**
 * `runs` playouts, recolhendo **todas** as métricas de §7.3 num único
 * varrimento — não em passagens separadas.
 *
 * Cada playout recebe uma **seed derivada** da seed base, para que o resultado
 * seja idêntico independentemente de como os playouts sejam distribuídos por
 * workers (spec §7.2). Dividir o trabalho em qualquer ponto dá exatamente o
 * mesmo número.
 */
export function measureSurvival(
  b: Board,
  runs: number,
  seed: number,
): SurvivalResult {
  const acc: Acumulador = {
    estados: 0,
    grupos: 0,
    densidade: 0,
    jogadas: 0,
    tamanhoGrupos: 0,
  };

  let survived = 0;
  let falhados = 0;
  let somaProfundidadeFatal = 0;

  for (let i = 0; i < runs; i++) {
    const profundidade = playoutInterno(
      b,
      mulberry32(deriveSeed(seed, i)),
      acc,
    );

    if (profundidade === null) {
      survived++;
    } else {
      falhados++;
      somaProfundidadeFatal += profundidade;
    }
  }

  const media = (total: number, n: number): number => (n === 0 ? 0 : total / n);

  return {
    runs,
    survived,
    survivalRate: media(survived, runs),
    avgBranching: media(acc.grupos, acc.estados),
    firstFatalDepth:
      falhados === 0 ? null : somaProfundidadeFatal / falhados,
    avgMoveDensity: media(acc.densidade, acc.estados),
    avgGroupSize: media(acc.tamanhoGrupos, acc.jogadas),
  };
}

/**
 * Piso de justiça (spec §7.4) — verificação **obrigatória antes de publicar**
 * qualquer nível (plano §6.2).
 *
 * As primeiras jogadas têm de ser seguras qualquer que seja a escolha. Um
 * tabuleiro onde a jogada 2 pode ser fatal é tecnicamente resolúvel mas lê-se
 * como adivinha, não como puzzle.
 *
 * Confirma que **todos** os estados alcançáveis até `depth` continuam
 * resolúveis. Becos sem saída são detetados a cada nível; a solubilidade é
 * verificada na fronteira final, e a nota lá em baixo explica por que basta.
 */
export interface OpcoesPiso {
  /**
   * Ignorar as jogadas que gastam o joker.
   *
   * ── Por que existe esta exceção ──
   *
   * O piso de justiça (plano §6.2) exige que as primeiras jogadas sejam seguras
   * **qualquer que seja a escolha**. O joker (plano §2.6) é desenhado para que
   * gastá-lo no grupo errado mate o tabuleiro. As duas coisas não podem valer ao
   * mesmo tempo, e não é uma questão de grau: medido sobre 40 níveis com joker,
   * **os 40** tinham uma jogada fatal logo à primeira, e nos 40 a jogada fatal
   * envolvia o joker. Sem esta opção, nenhum nível com joker passa nunca — 0
   * aceites em 8128 candidatos.
   *
   * Quem decide o desempate é o próprio plano: a mitigação que §2.6 dá para
   * "joker mal usado mata o tabuleiro sem aviso" é *tutorial dedicado, undo
   * ilimitado, nunca antes da fase média* — e não o piso de justiça. O joker é,
   * por desenho, a única armadilha que o jogo ensina em vez de esconder.
   *
   * Com a opção ligada, o piso continua a garantir tudo o resto: qualquer
   * sequência de jogadas **sem** joker mantém o tabuleiro resolúvel.
   */
  readonly skipJokerMoves?: boolean;
}

export function fairnessFloor(
  b: Board,
  depth = 3,
  limits: Limits = LIMITES_PISO,
  opcoes: OpcoesPiso = {},
): Verdict {
  if (depth <= 0) return "yes";

  let fronteira: Board[] = [b];
  const vistos = new Set<string>([boardKey(b)]);

  for (let nivel = 0; nivel < depth; nivel++) {
    const seguinte: Board[] = [];

    for (const atual of fronteira) {
      let temSucessor = false;

      for (const g of findAllGroups(atual)) {
        temSucessor = true;

        if (opcoes.skipJokerMoves === true && groupHasJoker(atual, g)) continue;

        const proximo = applyMove(atual, g);
        const chave = boardKey(proximo);

        if (vistos.has(chave)) continue;
        vistos.add(chave);

        if (proximo.length > 0) seguinte.push(proximo);
      }

      // Peças e nenhuma jogada: beco sem saída alcançado dentro do piso.
      if (!temSucessor && atual.length > 0) return "no";
    }

    if (seguinte.length === 0) return "yes";
    fronteira = seguinte;
  }

  /*
   * O solver corre **só na fronteira final**, e não em todos os estados.
   *
   * Não é atalho: um estado insolúvel acima da fronteira ou não tem sucessores —
   * e aí já foi apanhado como beco — ou tem, e todos eles são insolúveis
   * também, porque insolubilidade herda-se para a frente. Esses estão aqui.
   *
   * A diferença de custo é a diferença entre o pipeline correr e não correr:
   * chamar o solver em cada estado visitado punha a banda média a levar mais de
   * vinte minutos.
   */
  for (const estado of fronteira) {
    const veredicto = isSolvable(estado, limits);
    if (veredicto !== "yes") return veredicto === "no" ? "no" : "inconclusive";
  }

  return "yes";
}

/**
 * Um playout isolado, sem recolha de métricas. Útil ao renderer de consola da
 * fase 6 e aos testes.
 */
export const runPlayout = (b: Board, rng: Rng): number | null =>
  playoutInterno(b, rng, undefined);
