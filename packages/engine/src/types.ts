/**
 * Tipos fundamentais do motor (spec §2.1, §2.5).
 *
 * A escolha central: o tabuleiro é uma **lista de colunas, cada uma uma lista de
 * células de baixo para cima**. Não é a representação óbvia, mas é a certa —
 * torna gravidade e colapso de colunas operações de lista em vez de ciclos com
 * deslocamentos manuais, que seriam uma fonte permanente de bugs de índice.
 *
 * Bónus: um `Board` **é** JSON válido, portanto o formato de nível não precisa
 * de serializador e os testes escrevem-se como literais legíveis.
 */

/** 0 = joker; 1–6 = face de dado. */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Células de uma coluna, **de baixo para cima**. Num tabuleiro canónico nunca é
 * vazia e nunca tem buracos — ambas as invariantes são automáticas nesta
 * representação (spec §2.2).
 */
export type Column = readonly Cell[];

/** Colunas da esquerda para a direita. Colunas de alturas diferentes *são* a silhueta. */
export type Board = readonly Column[];

/**
 * Coordenada empacotada `(c << 6) | r` (spec §2.5).
 *
 * Um inteiro em vez de um tuplo ou objeto: evita alocação por célula no caminho
 * quente e permite `Set<number>`, bastante mais rápido em JS do que `Set` de
 * objetos ou de strings. Limite implícito de 64 linhas por coluna, muito acima
 * de qualquer tabuleiro real.
 */
export type Packed = number;

/**
 * Conjunto de células, **estritamente crescente**.
 *
 * A ordenação canónica é o que permite comparar e desduplicar grupos sem esforço
 * (spec §3.3), e `isValidGroup` rejeita grupos fora de ordem para que a
 * propriedade seja real e não aspiracional. Entrada não normalizada — a ordem de
 * toque na UI, por exemplo — passa primeiro por {@link toGroup}.
 */
export type Group = readonly Packed[];

/** Valor da célula joker (spec §2.6). Conta 0 em qualquer soma. */
export const JOKER = 0 as const;

/** Toda a jogada retira exatamente 7 pontos (spec §2.2). */
export const TARGET = 7 as const;

/** Limite das coordenadas empacotadas: 64 linhas por coluna. */
export const MAX_ROWS = 64 as const;

export const packed = (c: number, r: number): Packed => (c << 6) | r;
export const colOf = (p: Packed): number => p >>> 6;
export const rowOf = (p: Packed): number => p & 63;

/** Normaliza células soltas (ex. ordem de toque na UI) num {@link Group} canónico. */
export const toGroup = (cells: Iterable<Packed>): Group =>
  [...new Set(cells)].sort((a, b) => a - b);
