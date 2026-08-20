/**
 * Sessão de jogo mínima para o renderer de consola.
 *
 * Pura e sem I/O, para o ciclo interativo poder ser conduzido por um guião de
 * texto nos testes. **Não é a `GameSession` da fase 7** — não tem relógio, nem
 * pontuação, nem combos. Tem o que o gate de design precisa: seleção
 * tocar-a-acumular, undo, reinício, dicas, e a contabilidade da resolução limpa
 * (plano §6.2).
 */

import type { Board, Group, Level, Packed } from "@sete/engine";
import {
  applyMove,
  cellAt,
  findAllGroups,
  findSolution,
  isValidGroup,
  toGroup,
  JOKER,
  TARGET,
} from "@sete/engine";

export type OrigemDaDica = "guardada" | "calculada" | "nenhuma";

export interface Sessao {
  readonly level: Level;
  readonly board: Board;
  /** Pilha de tabuleiros anteriores. É toda a implementação do undo. */
  readonly historico: readonly Board[];
  /** Por ordem de toque, não canónica — normaliza-se com `toGroup` na fronteira. */
  readonly selecao: readonly Packed[];

  readonly jogadas: number;
  readonly undos: number;
  readonly reinicios: number;
  readonly dicas: number;
  /** Quantas dicas exigiram recalcular por o jogador ter saído da solução guardada. */
  readonly dicasCalculadas: number;

  readonly mensagem: string;
}

export const iniciar = (level: Level): Sessao => ({
  level,
  board: level.board,
  historico: [],
  selecao: [],
  jogadas: 0,
  undos: 0,
  reinicios: 0,
  dicas: 0,
  dicasCalculadas: 0,
  mensagem: "",
});

export const terminado = (s: Sessao): boolean => s.board.length === 0;

/**
 * Selo de resolução limpa (plano §6.2). O avanço nunca é bloqueado; a qualidade
 * da resolução é que é medida.
 */
export const selo = (s: Sessao): "perfeito" | "limpo" | "concluido" | null => {
  if (!terminado(s)) return null;
  if (s.undos === 0 && s.reinicios === 0 && s.dicas === 0) return "perfeito";
  if (s.undos === 0 && s.reinicios === 0) return "limpo";
  return "concluido";
};

/** Soma das faces fixas da seleção; o joker conta 0. */
export function somaDaSelecao(b: Board, selecao: readonly Packed[]): number {
  let s = 0;
  for (const p of selecao) {
    const v = cellAt(b, p);
    if (v !== undefined && v !== JOKER) s += v;
  }
  return s;
}

export const selecaoTemJoker = (
  b: Board,
  selecao: readonly Packed[],
): boolean => selecao.some((p) => cellAt(b, p) === JOKER);

/**
 * Tocar numa célula acumula-a na seleção; tocar outra vez retira-a.
 *
 * Ao atingir um grupo válido, elimina automaticamente — é o modelo de interação
 * que o plano §3.1 fixa para a UI, e é aqui que se experimenta antes de o
 * construir a sério.
 */
export function tocar(s: Sessao, p: Packed): Sessao {
  if (terminado(s)) return { ...s, mensagem: "o tabuleiro já está limpo" };

  if (cellAt(s.board, p) === undefined) {
    return { ...s, mensagem: "não há peça nessa coordenada" };
  }

  const ja = s.selecao.includes(p);

  if (ja) {
    return { ...s, selecao: s.selecao.filter((q) => q !== p), mensagem: "" };
  }

  const selecao = [...s.selecao, p];

  /*
   * Uma peça que faça a soma passar de 7 é **recusada**, em vez de aceite e
   * deixada a atolar a seleção.
   *
   * Não é indulgência: como o mínimo de uma face é 1 e o alvo é exatamente 7, a
   * soma só cresce, portanto uma seleção acima de 7 nunca mais pode dar grupo
   * válido. Aceitá-la só deixaria o jogador num estado morto do qual tem de sair
   * a desfazer à mão — foi o que aconteceu ao primeiro teste desta ferramenta,
   * e é precisamente o género de coisa que esta fase existe para apanhar antes
   * de estar numa UI.
   */
  const somaNova = somaDaSelecao(s.board, selecao);
  const jokerNovo = selecaoTemJoker(s.board, selecao);
  const teto = jokerNovo ? TARGET - 1 : TARGET;

  if (somaNova > teto) {
    return {
      ...s,
      mensagem: jokerNovo
        ? `com joker as fixas não passam de ${teto} — essa peça daria ${somaNova}`
        : `passava de 7 — essa peça daria ${somaNova}`,
    };
  }

  const grupo = toGroup(selecao);

  if (isValidGroup(s.board, grupo)) {
    return {
      ...s,
      board: applyMove(s.board, grupo),
      historico: [...s.historico, s.board],
      selecao: [],
      jogadas: s.jogadas + 1,
      mensagem: "",
    };
  }

  /*
   * Chegou a 7 mas não é grupo válido: só pode ser falta de conexão. Dizê-lo em
   * vez de deixar o jogador a adivinhar qual das três condições de §3.1 falhou.
   */
  const mensagem =
    somaNova === teto && !jokerNovo
      ? "soma 7, mas as peças não estão todas ligadas"
      : "";

  return { ...s, selecao, mensagem };
}

export const limparSelecao = (s: Sessao): Sessao => ({
  ...s,
  selecao: [],
  mensagem: "",
});

export function desfazer(s: Sessao): Sessao {
  if (s.selecao.length > 0) {
    return { ...s, selecao: s.selecao.slice(0, -1), mensagem: "" };
  }

  const anterior = s.historico[s.historico.length - 1];
  if (anterior === undefined) return { ...s, mensagem: "não há nada a desfazer" };

  // Undo ilimitado e grátis (plano §3.3): uma pilha de tabuleiros imutáveis, e
  // nada mais. Foi para isto que a engine é imutável.
  return {
    ...s,
    board: anterior,
    historico: s.historico.slice(0, -1),
    selecao: [],
    jogadas: s.jogadas - 1,
    undos: s.undos + 1,
    mensagem: "",
  };
}

export const reiniciar = (s: Sessao): Sessao => ({
  ...s,
  board: s.level.board,
  historico: [],
  selecao: [],
  jogadas: 0,
  reinicios: s.reinicios + 1,
  mensagem: "",
});

/**
 * A dica.
 *
 * Enquanto o jogador segue a solução guardada, a dica é de graça — basta olhar
 * para o passo seguinte (plano §4.3). Mal se desvie, a solução guardada deixa de
 * se aplicar e é preciso **calcular**.
 *
 * Isto é uma questão de desenho por resolver, e não um detalhe desta ferramenta:
 * a spec §7.5 diz que "o jogo em produção nunca gera nem mede nada". Uma dica
 * depois de o jogador sair do caminho guardado obriga a correr o solver em
 * runtime, ou a limitar a dica a "desfaz até ao último ponto conhecido". Este
 * contador existe para medir com que frequência isso acontece de facto.
 */
export function dica(s: Sessao): {
  readonly sessao: Sessao;
  readonly grupo: Group | undefined;
  readonly origem: OrigemDaDica;
} {
  if (terminado(s)) {
    return { sessao: s, grupo: undefined, origem: "nenhuma" };
  }

  // Ainda no caminho guardado? A solução foi construída para o tabuleiro
  // inicial, portanto o passo `jogadas` é o que se segue.
  const guardada = s.level.solution[s.jogadas];
  const naRota =
    guardada !== undefined &&
    s.undos === 0 &&
    s.reinicios === 0 &&
    isValidGroup(s.board, guardada);

  if (naRota) {
    return {
      sessao: { ...s, dicas: s.dicas + 1, mensagem: "" },
      grupo: guardada,
      origem: "guardada",
    };
  }

  const calculada = findSolution(s.board);
  const proxima = calculada?.[0];

  return {
    sessao: {
      ...s,
      dicas: s.dicas + 1,
      dicasCalculadas: s.dicasCalculadas + 1,
      mensagem:
        proxima === undefined ? "este tabuleiro já não tem solução" : "",
    },
    grupo: proxima,
    origem: proxima === undefined ? "nenhuma" : "calculada",
  };
}

/** Todos os grupos válidos no estado atual, para o comando de realce. */
export const gruposValidos = (s: Sessao): Group[] => [...findAllGroups(s.board)];
