/**
 * Bandas de dificuldade — a curva do plano §7 e os limiares do §5.1, traduzidos
 * em duas coisas separadas de propósito:
 *
 * - `params`: como **gerar** candidatos que provavelmente caem na banda.
 * - `accept`: como **aceitar** os que lá caem mesmo.
 *
 * A separação é o ponto todo do desenho: os parâmetros não determinam a
 * dificuldade, só a deslocam em distribuição. Quem decide é a medição.
 */

import type { GeneratorParams } from "@sete/engine";
import { COMPOSITIONS } from "@sete/engine";

/** Pesos que só deixam passar composições até `max` peças. */
const ateNPecas = (max: number): number[] =>
  COMPOSITIONS.map((c) => (c.length <= max ? 1 : 0));

/**
 * Favorece composições com faces de 3 para cima. São as peças com poucos
 * parceiros — um 5 só se junta a um 2 ou a `1+1` — e é daí que vem a rigidez que
 * a fase de perito quer (plano §4.4).
 */
const facesAltas = (): number[] =>
  COMPOSITIONS.map((c) => 1 + c.filter((v) => v >= 3).length * 2);

export interface BandSpec {
  readonly id: string;
  readonly label: string;

  /** Parâmetros de geração. `targetPieceCount` varia dentro de `pieces`. */
  readonly params: Omit<GeneratorParams, "targetPieceCount">;
  readonly pieces: readonly [number, number];

  readonly accept: {
    /** Intervalo fechado de taxa de sobrevivência. */
    readonly survival: readonly [number, number];

    /** Modo tempo: nenhum estado alcançável pode ser beco sem saída. */
    readonly requireGreedySafe?: boolean;

    /** Profundidade do piso de justiça. Zero desliga-o. */
    readonly fairnessDepth: number;

    /**
     * O piso ignora as jogadas que gastam o joker. Ver a nota em `OpcoesPiso`:
     * sem isto, nenhum nível com joker passa nunca.
     */
    readonly fairnessSkipsJoker?: boolean;
  };
}

/**
 * Os corpora dos dois modos são **opostos** (plano §6.1). O modo puzzle filtra
 * por sobrevivência baixa — quer armadilhas; o modo tempo exige 100% e
 * greedy-safe, porque lá o jogador só pode perder por ser lento.
 */
export const BANDS: readonly BandSpec[] = [
  {
    id: "tutorial",
    label: "Tutorial — só pares, impossível bloquear",
    params: { compositionWeights: ateNPecas(2), newColumnProbability: 0.45 },
    pieces: [10, 14],
    accept: { survival: [1, 1], requireGreedySafe: true, fairnessDepth: 3 },
  },
  {
    id: "inicio",
    label: "Início — pares e trios, relaxante",
    params: { compositionWeights: ateNPecas(3), newColumnProbability: 0.4 },
    pieces: [16, 25],
    accept: { survival: [0.9, 1], fairnessDepth: 3 },
  },
  /*
   * ── A tabela do plano §7 não fecha, e a medição é que o mostrou ──
   *
   * A fase média pede sobrevivência de 50–70% **e** a introdução do joker. Medido
   * na fase 5, um joker sozinho leva a sobrevivência de 0.83 para 0.20: as duas
   * exigências não podem valer no mesmo tabuleiro.
   *
   * Quem resolve é o próprio plano, mais abaixo em §7: o joker "aparece
   * esporadicamente — não em todos os tabuleiros", e "os níveis que o incluem são
   * construídos à volta dele". São portanto duas bandas, não uma: o grosso da
   * fase média sem joker na faixa que a tabela pede, e uma minoria com joker, mais
   * apertada, que é o estrangulamento.
   */
  {
    id: "meio",
    label: "Meio — até 4 peças, sem joker",
    params: {
      compositionWeights: ateNPecas(4),
      newColumnProbability: 0.35,
      insertionDepthBias: 1,
    },
    pieces: [25, 36],
    accept: { survival: [0.5, 0.7], fairnessDepth: 3 },
  },
  {
    id: "meio-joker",
    label: "Meio — o nível de estrangulamento, construído à volta do joker",
    params: {
      compositionWeights: ateNPecas(4),
      newColumnProbability: 0.35,
      insertionDepthBias: 1,
      includeJoker: true,
      jokerProgress: 0.3,
    },
    pieces: [22, 30],
    accept: { survival: [0.1, 0.35], fairnessDepth: 3, fairnessSkipsJoker: true },
  },
  {
    id: "avancado",
    label: "Avançado — todas as composições",
    params: { newColumnProbability: 0.3, insertionDepthBias: 2 },
    pieces: [30, 42],
    accept: { survival: [0.2, 0.4], fairnessDepth: 3 },
  },
  {
    id: "perito",
    label: "Perito — faces altas, silhuetas",
    params: {
      compositionWeights: facesAltas(),
      newColumnProbability: 0.25,
      insertionDepthBias: 3,
    },
    pieces: [35, 50],
    accept: { survival: [0, 0.2], fairnessDepth: 3 },
  },
  /*
   * ── Tamanho não é alavanca de dificuldade; o joker é ──
   *
   * Plano §7 pede níveis "curtos e muito densos (10–15 peças, sobrevivência
   * <10%)". Medida a sobrevivência mediana por tamanho, sem joker:
   *
   *   12 peças  1.000      35 peças  0.797
   *   21 peças  0.957      49 peças  0.690
   *
   * Quadruplicar o tabuleiro tira 0.31 à sobrevivência. Um joker num tabuleiro
   * de 12 peças tira 0.77 — de 1.000 para 0.233. Sem joker, esta banda aceitou
   * **0 candidatos em 8128**; a mediana observada era 1.00.
   *
   * Um tabuleiro pequeno não tem por onde correr mal: poucas peças, poucas
   * decisões, quase todas boas. O que o torna um puzzle de dedução é o joker —
   * que é exatamente o que o plano §7 quer destes níveis.
   */
  {
    id: "denso",
    label: "Denso — curto, de dedução pura, à volta do joker",
    params: {
      newColumnProbability: 0.3,
      insertionDepthBias: 3,
      includeJoker: true,
      jokerProgress: 0.3,
    },
    pieces: [10, 15],
    accept: { survival: [0, 0.15], fairnessDepth: 2, fairnessSkipsJoker: true },
  },
  {
    id: "tempo",
    label: "Modo tempo — greedy-safe, sem joker",
    params: { compositionWeights: ateNPecas(3), newColumnProbability: 0.45 },
    pieces: [10, 18],
    accept: { survival: [1, 1], requireGreedySafe: true, fairnessDepth: 0 },
  },
];

export const bandById = (id: string): BandSpec | undefined =>
  BANDS.find((b) => b.id === id);
