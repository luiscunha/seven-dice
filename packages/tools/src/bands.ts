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

    /**
     * Profundidade do piso de justiça. Zero desliga-o.
     *
     * Plano §6.2 pede "as primeiras 2–3 jogadas". Usa-se **2**, e a razão é
     * medida: o piso exige que *todas* as sequências de jogadas até essa
     * profundidade deixem o tabuleiro resolúvel, portanto o seu rigor cresce com
     * o branching factor. Em tabuleiros de forma correta — que têm muito mais
     * ramificação do que as torres que o gerador produzia antes — a profundidade
     * 3 rejeitava 1840 de 1856 candidatos que já tinham passado a sobrevivência.
     * A 2 continua dentro do que o plano pede, e deixa passar níveis.
     */
    readonly fairnessDepth: number;

    /**
     * O piso ignora as jogadas que gastam o joker. Ver a nota em `OpcoesPiso`:
     * sem isto, nenhum nível com joker passa nunca.
     */
    readonly fairnessSkipsJoker?: boolean;
  };
}

/*
 * ── As alavancas de dificuldade, por ordem de força (medido na fase 6) ──
 *
 * Sobrevivência mediana observada, 120 candidatos por configuração:
 *
 *   joker                       0.83 → 0.20    esmagadoramente a maior
 *   composições só até 3 peças        0.28     restringir aperta
 *   faces altas (3–6)                 0.43
 *   todas as composições              0.70     alargar **alivia**
 *   tamanho (12 → 49 peças)      1.00 → 0.69   fraca
 *
 * A terceira linha e a quarta são a surpresa, e contrariam a tabela do plano §7,
 * que alarga as composições à medida que a dificuldade sobe. Composições grandes
 * são feitas de 1s e 2s, que se juntam a tudo — o plano §4.4 já o diz ("muitos 1s
 * e 2s → tabuleiro flexível"), só a tabela de §7 é que não o reflete.
 *
 * Daí a banda `avancado` usar faces altas em vez de tudo: com todas as
 * composições era a banda **mais fácil** do pack, com mediana 0.70.
 *
 * Os intervalos abaixo saem dos quartis medidos, não da tabela de §7 — que
 * `[M 7]` já avisava ser "o ponto de partida, não o resultado".
 *
 * Os corpora dos dois modos continuam **opostos** (plano §6.1): o puzzle filtra
 * por sobrevivência baixa, o modo tempo exige 100% e greedy-safe.
 */
export const BANDS: readonly BandSpec[] = [
  {
    id: "tutorial",
    label: "Tutorial — só pares, impossível bloquear",
    params: { compositionWeights: ateNPecas(2), newColumnProbability: 0.45 },
    pieces: [10, 14],
    accept: { survival: [1, 1], requireGreedySafe: true, fairnessDepth: 2 },
  },
  {
    id: "inicio",
    label: "Início — pares e trios, relaxante",
    params: { compositionWeights: ateNPecas(3), newColumnProbability: 0.4 },
    pieces: [16, 25],
    accept: { survival: [0.55, 1], fairnessDepth: 2 },
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
    accept: { survival: [0.3, 0.55], fairnessDepth: 2 },
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
    accept: { survival: [0.02, 0.15], fairnessDepth: 2, fairnessSkipsJoker: true },
  },
  {
    id: "avancado",
    label: "Avançado — faces altas, poucos parceiros",
    params: {
      compositionWeights: facesAltas(),
      newColumnProbability: 0.3,
      insertionDepthBias: 2,
    },
    pieces: [30, 42],
    accept: { survival: [0.2, 0.45], fairnessDepth: 2 },
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
    accept: { survival: [0.03, 0.22], fairnessDepth: 2 },
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
    accept: { survival: [0.03, 0.2], fairnessDepth: 2, fairnessSkipsJoker: true },
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
