/**
 * Os capítulos da campanha.
 *
 * **Uma banda é uma receita de geração; um capítulo é o que o jogador vê.** As
 * duas coisas estavam a ser a mesma, e isso pôs sete entradas numa lista onde
 * cabem cinco — com duas delas, `meio-joker` e `denso`, a serem bandas inteiras
 * de joker.
 *
 * O plano §7 diz que o joker "aparece esporadicamente — não em todos os
 * tabuleiros". Uma banda inteira de joker contraria isso; intercalá-lo é o que
 * lá está escrito.
 *
 * ── Porque é que as bandas não se fundem ──
 *
 * Podia parecer mais simples fundir `meio` e `meio-joker` em `bands.ts` e acabar
 * com a distinção. Não pode: a `meio` aceita sobrevivência de 30–55% e a
 * `meio-joker` de 2–15%, e **nenhum tabuleiro cumpre as duas** — foi medido na
 * fase 5, um joker sozinho leva a sobrevivência de 0,83 para 0,20. A separação é
 * uma restrição de *geração*.
 *
 * A apresentação não tem essa restrição nenhuma. Daí a separação viver aqui: as
 * bandas continuam a ser oito no pipeline, e a campanha lê-as em cinco.
 */

import type { BandaNoIndice } from "./levels";
import { cabeNoEcra } from "./levels";

/** Um em cada três níveis do capítulo vem da banda com joker. */
export const CADENCIA_JOKER = 3;

export interface Capitulo {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  /** A banda que dá o corpo do capítulo. */
  readonly base: string;
  /** A banda com joker que se intercala, se houver. */
  readonly joker?: string;
}

export const CAPITULOS: readonly Capitulo[] = [
  {
    id: "tutorial",
    nome: "Tutorial",
    descricao: "Só pares. Impossível bloquear",
    base: "tutorial",
  },
  {
    id: "iniciado",
    nome: "Iniciado",
    descricao: "Pares e trios, sem pressa",
    base: "inicio",
  },
  {
    id: "medio",
    nome: "Médio",
    descricao: "Grupos até quatro, e o joker a aparecer",
    base: "meio",
    joker: "meio-joker",
  },
  {
    id: "avancado",
    nome: "Avançado",
    descricao: "Faces altas, poucos parceiros",
    base: "avancado",
    joker: "denso",
  },
  {
    id: "perito",
    nome: "Perito",
    descricao: "Tabuleiros grandes, margem nenhuma",
    base: "perito",
  },
];

/**
 * Um nível dentro de um capítulo.
 *
 * Guarda a **banda e o índice nela**, e não só a posição no capítulo, porque é
 * esse par que identifica o nível no pack — e é ele que vai na rota. Assim um
 * link para um nível continua a valer se a cadência mudar.
 */
export interface NivelDoCapitulo {
  readonly id: string;
  readonly banda: string;
  readonly indice: number;
}

export const capituloPorId = (id: string): Capitulo | undefined =>
  CAPITULOS.find((c) => c.id === id);

/** O capítulo a que uma banda pertence — para a seta de voltar saber onde subir. */
export const capituloDaBanda = (banda: string): Capitulo | undefined =>
  CAPITULOS.find((c) => c.base === banda || c.joker === banda);

/**
 * A sequência de níveis de um capítulo, já intercalada.
 *
 * A cada `CADENCIA_JOKER` posições entra um nível com joker; as outras vêm da
 * base. A base esgota-se toda — é ela que define o comprimento do capítulo — e
 * os níveis com joker que sobrarem ficam por jogar. São 15 de cada banda, e o
 * destino natural deles é o puzzle diário (desenho §8, passo 10).
 *
 * Determinística: a mesma ordem em todas as sessões e em todos os dispositivos.
 * Sem isto, "o nível 12 do Médio" não queria dizer nada.
 */
export function montarCapitulo(
  capitulo: Capitulo,
  bandas: readonly BandaNoIndice[],
): readonly NivelDoCapitulo[] {
  /*
   * O índice na banda calcula-se **antes** de filtrar, e não depois: é ele que
   * vai na rota, e tem de continuar a apontar para o nível certo dentro do
   * ficheiro da banda. Filtrar primeiro renumerava tudo e um link antigo passava
   * a abrir outro nível.
   */
  const niveisDe = (id: string | undefined): readonly NivelDoCapitulo[] =>
    id === undefined
      ? []
      : (bandas.find((b) => b.id === id)?.niveis ?? [])
          .map((n, i) => ({ id: n.id, banda: id, indice: i, colunas: n.colunas }))
          .filter((n) => cabeNoEcra(n.colunas))
          .map(({ id: nivelId, banda, indice }) => ({ id: nivelId, banda, indice }));

  const base = niveisDe(capitulo.base);
  const joker = niveisDe(capitulo.joker);

  if (joker.length === 0) return base;

  const fora: NivelDoCapitulo[] = [];
  let proximoBase = 0;
  let proximoJoker = 0;

  /*
   * A condição inclui a posição que se segue à base esgotar, e não é detalhe:
   * sem ela o ciclo parava logo a seguir ao último nível da base e o joker que
   * fecha a série ficava de fora — 44 níveis em vez de 45, e 14 jokers em vez
   * de 15.
   */
  while (
    proximoBase < base.length ||
    (fora.length + 1) % CADENCIA_JOKER === 0
  ) {
    const posicao = fora.length + 1;
    const seguinte =
      posicao % CADENCIA_JOKER === 0 && proximoJoker < joker.length
        ? joker[proximoJoker++]
        : base[proximoBase++];

    // Base esgotada e não é vez do joker — ou os jokers acabaram antes dela.
    if (seguinte === undefined) break;

    fora.push(seguinte);
  }

  return fora;
}
