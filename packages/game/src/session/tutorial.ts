/**
 * O tutorial do joker: o tabuleiro, a conta, e a regra do andaime.
 *
 * Aqui só há dados e aritmética — nem DOM nem estado. O ecrã vive em
 * `ui/JokerTutorial.ts`; isto é o que ele ensina, e é testável sem jsdom.
 *
 * **Porque é que este tutorial existe.** O playtest da fase 6 mediu que a regra
 * do joker não se descobre a jogar: ao quarto nível com joker a pergunta do
 * jogador foi literalmente *"o joker tem um valor fixo?"*. O plano §2.6 chama-lhe
 * obrigatório, e é a mitigação nomeada do risco *"joker mal usado mata o
 * tabuleiro"*. Tudo o resto do jogo ensina-se a jogar (desenho §5.7); isto é a
 * exceção, e é uma exceção medida.
 */

import type { Board, Level } from "@septet/engine";
import { TARGET, totalSum } from "@septet/engine";

/**
 * Quatro peças, duas jogadas, e um caminho que mata.
 *
 * ```
 *   ✳ 4      coluna a, de baixo para cima: [joker, 4]
 *   5 3      coluna b, de baixo para cima: [5, 3]
 * ```
 *
 * As faces somam **12**; falta **2** para 14, que é múltiplo de 7. **O joker
 * vale 2.** É uma conta que se segue de cabeça, e é esse o ponto: o tutorial
 * ensina o mecanismo num caso onde ele é visível de uma vez.
 *
 * O que torna este tabuleiro um tutorial e não uma demonstração é haver aqui
 * **duas saídas boas e uma má**, todas ao alcance do primeiro toque:
 *
 * | Escolha | O que acontece |
 * |---|---|
 * | Joker 2, com o 5 | 7. Sobram o 4 e o 3, que dão 7. Limpo |
 * | Começar pelo 4+3 | Sobram ✳ e 5. O joker vale 2. Limpo |
 * | **Joker 3, com o 4** | **7 — e o jogo aceita.** Sobram 5 e 3: soma 8, zero grupos, e já não há joker |
 *
 * O caminho fatal mata **numa jogada** e deixa duas peças à vista a somar 8. É o
 * argumento inteiro do joker com números pequenos: escolher mal é permitido, não
 * avisa, e não tem volta. Num nível a sério a mesma lição chegava dez jogadas
 * depois, e ninguém a ligava à causa.
 *
 * `test/tutorial.test.ts` verifica as três linhas da tabela contra a engine. Se
 * alguma deixar de valer, o tutorial deixou de ensinar o que diz que ensina.
 */
export const NIVEL_TUTORIAL_JOKER: Level = {
  id: "tutorial-joker",
  /* Feito à mão, não gerado. A seed é identidade, e esta não veio de nenhuma. */
  seed: 0,
  board: [
    [0, 4],
    [5, 3],
  ],
  joker: { at: [0, 0], trueValue: 2 },
  solution: [
    [0, 64],
    [0, 64],
  ],
  band: "tutorial-joker",
};

/**
 * A conta, com os números do tabuleiro acima.
 *
 * Deriva-se do tabuleiro em vez de ser escrita à mão: se alguém mexer no
 * `NIVEL_TUTORIAL_JOKER`, a conta acompanha em vez de passar a mentir.
 */
export interface ContaDoJoker {
  /** Soma das faces fixas. O joker conta 0, como em toda a engine. */
  readonly faces: number;
  /** O valor que o joker tem de tomar. */
  readonly joker: number;
  /** O múltiplo de 7 a que a soma chega com o joker lá dentro. */
  readonly total: number;
  /** Quantas jogadas o tabuleiro leva. É sempre `total / 7`. */
  readonly jogadas: number;
}

export function contaDoJoker(board: Board): ContaDoJoker {
  const faces = totalSum(board);
  const resto = faces % TARGET;
  const joker = resto === 0 ? 0 : TARGET - resto;
  const total = faces + joker;

  return { faces, joker, total, jogadas: total / TARGET };
}

/**
 * Durante quantos níveis com joker é que a soma das faces aparece no cabeçalho.
 *
 * **É andaime, não interface.** O número serve para o jogador poder aplicar a
 * regra que acabou de aprender sem ter de somar 26 faces de dado de cabeça — o
 * que no telemóvel, sem papel, não é um puzzle, é trabalho. O que ele *não* faz
 * é dar a resposta: continua a ser o jogador a fechar a conta, e a decisão que
 * interessa — em que grupo gastar o joker — fica intacta (desenho §5.2).
 *
 * Ao quarto nível com joker desaparece, e nunca mais volta. A banda `denso`, que
 * é dedução pura, chega sempre sem ele.
 */
export const NIVEIS_COM_ANDAIME = 3;

export const mostraSomaDasFaces = (niveisComJokerFeitos: number): boolean =>
  niveisComJokerFeitos < NIVEIS_COM_ANDAIME;
