/**
 * Gerador por construção reversa (spec §6).
 *
 * Constrói-se o tabuleiro do fim para o princípio: parte-se do vazio e inserem-se
 * grupos que somam 7. **A ordem inversa dos passos de construção é uma solução
 * válida**, portanto nunca é preciso perguntar se o tabuleiro tem solução — é
 * daqui que vem a garantia que sustenta o projeto inteiro (plano §4.2).
 *
 * ## A representação com células marcadas
 *
 * Inserir células desloca as que já lá estavam: dentro de uma coluna empurra
 * para cima, uma coluna nova empurra as outras para a direita. Manter
 * coordenadas atualizadas ao longo de várias inserções é exatamente o tipo de
 * contabilidade que produz o erro que §6.3 existe para apanhar.
 *
 * Por isso constrói-se sobre um tabuleiro de células **marcadas** — cada célula
 * sabe se foi inserida neste passo — e as coordenadas do grupo derivam-se no
 * fim, varrendo o resultado. Os deslocamentos passam a ser tratados pelo próprio
 * `splice`, e não há coordenadas para manter.
 */

import type { Board, Cell, Column, Group, Packed } from "./types";
import { JOKER, MAX_ROWS, packed } from "./types";
import { boardKey, jokerAt, pieceCount } from "./board";
import { isValidGroup } from "./groups";
import { applyMove } from "./moves";
import type { Composition } from "./compositions";
import { COMPOSITIONS } from "./compositions";
import type { Rng } from "./rng";
import { mulberry32, randInt, shuffled, weightedIndex } from "./rng";

/* ─── Parâmetros (spec §6.5) ───────────────────────────────────────────────
 *
 * Nenhum destes *determina* a dificuldade. Só a desloca em distribuição — a
 * dificuldade mede-se depois, na fase 5.
 */

export interface GeneratorParams {
  /** Número exato de peças do tabuleiro final. */
  readonly targetPieceCount: number;

  /** Peso de cada uma das 14 composições, por posição em `COMPOSITIONS`. */
  readonly compositionWeights?: readonly number[];

  /** Largura vs. altura: probabilidade de uma célula abrir coluna nova. */
  readonly newColumnProbability?: number;

  /**
   * Preferir o fundo de colunas altas → mais dependências. Zero é uniforme;
   * valores maiores puxam as inserções para baixo e para as colunas com mais
   * peças.
   */
  readonly insertionDepthBias?: number;

  /** Perfil de alturas alvo, opcional. É uma preferência, não uma garantia. */
  readonly silhouetteProfile?: readonly number[];

  /** Ativa a colocação de um joker (spec §6.4). No máximo um por tabuleiro. */
  readonly includeJoker?: boolean;

  /** Posições tentadas antes de desistir de um passo. */
  readonly maxPositionAttempts?: number;

  /** Passos que se pode recuar antes de reiniciar do zero. */
  readonly maxBacktracks?: number;

  /** Reinícios completos antes de devolver `null`. */
  readonly maxRestarts?: number;
}

const OMISSAO = {
  newColumnProbability: 0.35,
  insertionDepthBias: 0,
  maxPositionAttempts: 40,
  maxBacktracks: 30,
  maxRestarts: 3,
} as const;

/**
 * Contadores da geração.
 *
 * `rejectedRoundTrip` existe para responder a uma pergunta concreta: a
 * verificação de §6.3 chega alguma vez a apanhar alguma coisa que `isValidGroup`
 * já não tivesse apanhado? Se a resposta for sempre zero, a inversão é estrutural
 * e a simulação é uma rede — e vale a pena saber isso em vez de supor.
 */
export interface GenerationStats {
  steps: number;
  positionAttempts: number;
  rejectedInvalidGroup: number;
  rejectedRoundTrip: number;
  backtracks: number;
  restarts: number;
}

export interface GeneratedLevel {
  readonly board: Board;
  /** Ordem de jogo: aplicar em sequência esvazia o tabuleiro. */
  readonly solution: readonly Group[];
  readonly joker?: {
    readonly at: readonly [number, number];
    readonly trueValue: number;
  };
  readonly stats: GenerationStats;
}

/* ─── Tabuleiro marcado ────────────────────────────────────────────────────── */

interface Marcada {
  readonly value: Cell;
  readonly inserida: boolean;
}

type ColunaMarcada = readonly Marcada[];
type TabuleiroMarcado = readonly ColunaMarcada[];

type Posicao =
  | { readonly tipo: "coluna"; readonly c: number; readonly r: number }
  | { readonly tipo: "nova"; readonly c: number };

const marcar = (b: Board): TabuleiroMarcado =>
  b.map((col) => col.map((value) => ({ value, inserida: false })));

const projetar = (tm: TabuleiroMarcado): Board =>
  tm.map((col) => col.map((m) => m.value) as Column);

/** Coordenadas das células inseridas. Sai canónico: `c` e `r` crescem. */
function grupoInserido(tm: TabuleiroMarcado): Group {
  const out: Packed[] = [];

  for (let c = 0; c < tm.length; c++) {
    const col = tm[c] as ColunaMarcada;
    for (let r = 0; r < col.length; r++) {
      if ((col[r] as Marcada).inserida) out.push(packed(c, r));
    }
  }

  return out;
}

function inserir(
  tm: TabuleiroMarcado,
  pos: Posicao,
  value: Cell,
): TabuleiroMarcado {
  const nova: Marcada = { value, inserida: true };

  if (pos.tipo === "nova") {
    return [...tm.slice(0, pos.c), [nova], ...tm.slice(pos.c)];
  }

  const col = tm[pos.c] as ColunaMarcada;
  const atualizada = [...col.slice(0, pos.r), nova, ...col.slice(pos.r)];

  return [...tm.slice(0, pos.c), atualizada, ...tm.slice(pos.c + 1)];
}

/**
 * As células que ficarão adjacentes à célula inserida nesta posição, calculadas
 * **antes** de inserir.
 *
 * Inserir numa coluna não mexe nas outras, e a célula que estava em `(c, r)`
 * sobe para `(c, r+1)` — continua vizinha. Uma coluna nova em `c` fica entre as
 * atuais `c-1` e `c`. Não é preciso projetar nada para saber isto.
 */
function vizinhosDaPosicao(tm: TabuleiroMarcado, pos: Posicao): Marcada[] {
  const out: Marcada[] = [];

  if (pos.tipo === "nova") {
    const esquerda = tm[pos.c - 1]?.[0];
    const direita = tm[pos.c]?.[0];
    if (esquerda !== undefined) out.push(esquerda);
    if (direita !== undefined) out.push(direita);
    return out;
  }

  const col = tm[pos.c];
  if (col === undefined) return out;

  const candidatos = [
    pos.r > 0 ? col[pos.r - 1] : undefined, // fica em (c, r-1)
    col[pos.r], // é empurrada para (c, r+1)
    tm[pos.c - 1]?.[pos.r],
    tm[pos.c + 1]?.[pos.r],
  ];

  for (const m of candidatos) if (m !== undefined) out.push(m);
  return out;
}

const tocaNoGrupo = (tm: TabuleiroMarcado, pos: Posicao): boolean =>
  vizinhosDaPosicao(tm, pos).some((m) => m.inserida);

/* ─── Escolha de posição ───────────────────────────────────────────────────── */

function amostrarPosicao(
  tm: TabuleiroMarcado,
  rng: Rng,
  params: GeneratorParams,
): Posicao {
  const perfil = params.silhouetteProfile;
  const largura = tm.length;

  if (largura === 0) return { tipo: "nova", c: 0 };

  let probNova = params.newColumnProbability ?? OMISSAO.newColumnProbability;

  // O perfil é uma preferência: empurra a largura para o comprimento alvo em vez
  // de a impor.
  if (perfil !== undefined) {
    probNova = largura < perfil.length ? Math.min(1, probNova * 2.5) : probNova * 0.1;
  }

  if (rng() < probNova) {
    return { tipo: "nova", c: randInt(rng, largura + 1) };
  }

  const bias = params.insertionDepthBias ?? OMISSAO.insertionDepthBias;

  const pesos = tm.map((col, c) => {
    if (col.length >= MAX_ROWS) return 0;

    // Colunas altas atraem mais quando o bias sobe: é assim que se criam
    // dependências mais profundas (spec §6.5).
    let peso = Math.pow(col.length + 1, bias);

    if (perfil !== undefined) {
      const alvo = perfil[c];
      if (alvo !== undefined) peso *= col.length < alvo ? 3 : 0.3;
    }

    return peso;
  });

  const c = weightedIndex(rng, pesos);
  if (c < 0) return { tipo: "nova", c: randInt(rng, largura + 1) };

  const altura = (tm[c] as ColunaMarcada).length;

  // `u^(1+bias)` puxa a linha para o fundo sem nunca excluir o topo.
  const u = rng();
  const r = Math.min(altura, Math.floor(Math.pow(u, 1 + bias) * (altura + 1)));

  return { tipo: "coluna", c, r };
}

/**
 * Uma posição encostada ao grupo já inserido, se se encontrar em poucas
 * tentativas.
 *
 * É só uma heurística para subir a taxa de aceitação — a conexão real é
 * verificada no fim, sobre o candidato completo, porque uma inserção posterior
 * pode separar duas células que já estavam encostadas (uma coluna nova entre
 * elas, por exemplo).
 */
function amostrarPosicaoEncostada(
  tm: TabuleiroMarcado,
  rng: Rng,
  params: GeneratorParams,
): Posicao {
  let ultima = amostrarPosicao(tm, rng, params);

  for (let i = 0; i < 8; i++) {
    if (tocaNoGrupo(tm, ultima)) return ultima;
    ultima = amostrarPosicao(tm, rng, params);
  }

  return ultima;
}

/* ─── Passo de construção ──────────────────────────────────────────────────── */

/**
 * Que contagens de peças se conseguem somar exatamente com os tamanhos de
 * composição disponíveis.
 *
 * Sem isto, uma escolha gulosa pinta-se ao canto: com só composições de 5, 6 e 7
 * peças e um alvo de 30, a sequência 7+7+7+7 deixa 2 peças por colocar e nenhuma
 * composição cabe. Recuar não resolve de forma fiável, porque a escolha seguinte
 * volta a ser aleatória.
 *
 * É o problema da moeda, resolvido uma vez por chamada, e depois consultado em
 * tempo constante.
 */
function contagensAlcancaveis(
  tamanhos: readonly number[],
  alvo: number,
): boolean[] {
  const ok = new Array<boolean>(alvo + 1).fill(false);
  ok[0] = true;

  for (let n = 1; n <= alvo; n++) {
    for (const t of tamanhos) {
      if (t <= n && ok[n - t] === true) {
        ok[n] = true;
        break;
      }
    }
  }

  return ok;
}

function escolherComposicao(
  rng: Rng,
  params: GeneratorParams,
  restantes: number,
  alcancavel: readonly boolean[],
): Composition | undefined {
  const pesos = COMPOSITIONS.map((comp, i) => {
    if (comp.length > restantes) return 0;

    // O que sobrar tem de ser somável com as composições disponíveis.
    if (alcancavel[restantes - comp.length] !== true) return 0;

    return params.compositionWeights?.[i] ?? 1;
  });

  const i = weightedIndex(rng, pesos);
  return i < 0 ? undefined : COMPOSITIONS[i];
}

interface Candidato {
  readonly board: Board;
  readonly grupo: Group;
  readonly trueValue?: number;
}

function construirCandidato(
  board: Board,
  comp: Composition,
  rng: Rng,
  params: GeneratorParams,
  comJoker: boolean,
): Candidato {
  const valores = shuffled(rng, comp);
  const indiceJoker = comJoker ? randInt(rng, valores.length) : -1;

  let tm = marcar(board);

  for (let i = 0; i < valores.length; i++) {
    const valor = i === indiceJoker ? JOKER : (valores[i] as Cell);
    const pos =
      i === 0
        ? amostrarPosicao(tm, rng, params)
        : amostrarPosicaoEncostada(tm, rng, params);

    tm = inserir(tm, pos, valor);
  }

  const candidato: Candidato = {
    board: projetar(tm),
    grupo: grupoInserido(tm),
  };

  return indiceJoker < 0
    ? candidato
    : { ...candidato, trueValue: valores[indiceJoker] as number };
}

/* ─── Ciclo principal ──────────────────────────────────────────────────────── */

interface Estado {
  readonly board: Board;
  readonly passos: readonly Group[];
  readonly trueValueJoker: number | undefined;
}

const INICIAL: Estado = { board: [], passos: [], trueValueJoker: undefined };

function tentarPasso(
  estado: Estado,
  rng: Rng,
  params: GeneratorParams,
  stats: GenerationStats,
  alcancavel: readonly boolean[],
): Estado | undefined {
  const restantes = params.targetPieceCount - pieceCount(estado.board);
  const tentativas = params.maxPositionAttempts ?? OMISSAO.maxPositionAttempts;

  /*
   * O joker entra num passo **tardio** da construção reversa — ou seja, cedo na
   * solução do jogador — que a spec §6.4 aponta como tendendo a criar
   * dependências mais fortes. É uma hipótese a confirmar pelas métricas da fase
   * 5, não um facto: a taxa de sobrevivência deve *descer* (plano §8).
   */
  const comJoker =
    (params.includeJoker ?? false) &&
    estado.trueValueJoker === undefined &&
    pieceCount(estado.board) >= params.targetPieceCount * 0.6;

  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    stats.positionAttempts++;

    const comp = escolherComposicao(rng, params, restantes, alcancavel);
    if (comp === undefined) return undefined;

    const candidato = construirCandidato(
      estado.board,
      comp,
      rng,
      params,
      comJoker,
    );

    /*
     * ── A verificação que não se salta (spec §6.3) ──
     *
     * `isValidGroup` cobre a soma, a conexão e a forma canónica; a simulação
     * direta confirma que aplicar a jogada devolve **exatamente** o tabuleiro
     * anterior.
     *
     * Medido: em 3500 gerações por sete perfis de parâmetros, a segunda
     * verificação **nunca** rejeitou nada que a primeira não tivesse rejeitado.
     * Não é acaso. Com a representação marcada, remover exatamente as células
     * inseridas devolve a cada coluna a sua sequência original — a gravidade
     * preserva a ordem — e as colunas novas, feitas só de células inseridas,
     * desaparecem no colapso. **A inversão é estrutural**, e a conexão é que é o
     * filtro real: rejeita entre um quarto e metade das tentativas.
     *
     * A verificação fica na mesma, e não por deferência à spec. O que ela
     * protege não é este ficheiro — é `applyMove`. No dia em que as células
     * bloqueadoras entrarem (plano §3.4), a gravidade passa a ter dois casos de
     * paragem, o colapso fica ambíguo, e a inversão deixa de ser estrutural. O
     * plano diz, por palavras suas, que é aí que nascem os níveis impossíveis.
     * Custa um `applyMove` por passo aceite e já cá está nesse dia.
     */
    if (!isValidGroup(candidato.board, candidato.grupo)) {
      stats.rejectedInvalidGroup++;
      continue;
    }

    if (
      boardKey(applyMove(candidato.board, candidato.grupo)) !==
      boardKey(estado.board)
    ) {
      stats.rejectedRoundTrip++;
      continue;
    }

    return {
      board: candidato.board,
      passos: [...estado.passos, candidato.grupo],
      trueValueJoker: candidato.trueValue ?? estado.trueValueJoker,
    };
  }

  return undefined;
}

/**
 * Gera um nível resolúvel, ou `undefined` se não conseguir dentro dos limites.
 *
 * Determinístico: a mesma seed e os mesmos parâmetros dão sempre o mesmo nível.
 */
export function generate(
  seed: number,
  params: GeneratorParams,
): GeneratedLevel | undefined {
  if (params.targetPieceCount < 2) return undefined;

  const tamanhos = COMPOSITIONS.filter(
    (_, i) => (params.compositionWeights?.[i] ?? 1) > 0,
  ).map((comp) => comp.length);

  const alcancavel = contagensAlcancaveis(tamanhos, params.targetPieceCount);

  // Alvo inatingível com estes pesos: falha já, em vez de gastar reinícios a
  // descobri-lo.
  if (alcancavel[params.targetPieceCount] !== true) return undefined;

  const rng = mulberry32(seed);
  const stats: GenerationStats = {
    steps: 0,
    positionAttempts: 0,
    rejectedInvalidGroup: 0,
    rejectedRoundTrip: 0,
    backtracks: 0,
    restarts: 0,
  };

  const maxBacktracks = params.maxBacktracks ?? OMISSAO.maxBacktracks;
  const maxRestarts = params.maxRestarts ?? OMISSAO.maxRestarts;

  let estado = INICIAL;
  let historico: Estado[] = [];
  let recuos = 0;

  while (pieceCount(estado.board) < params.targetPieceCount) {
    const seguinte = tentarPasso(estado, rng, params, stats, alcancavel);

    if (seguinte !== undefined) {
      historico.push(estado);
      estado = seguinte;
      stats.steps++;
      continue;
    }

    // Recuar um passo dá outra hipótese à mesma construção; reiniciar troca-a
    // toda. Registar as taxas importa: recuos frequentes significam parâmetros
    // mal calibrados, não azar (spec §6.1).
    if (historico.length > 0 && recuos < maxBacktracks) {
      estado = historico.pop() as Estado;
      recuos++;
      stats.backtracks++;
      continue;
    }

    if (stats.restarts < maxRestarts) {
      historico = [];
      estado = INICIAL;
      recuos = 0;
      stats.restarts++;
      continue;
    }

    return undefined;
  }

  // A ordem inversa dos passos de construção é a solução do jogador.
  const solution = [...estado.passos].reverse();

  if (estado.trueValueJoker === undefined) {
    return { board: estado.board, solution, stats };
  }

  /*
   * A posição do joker só se sabe no fim: os passos seguintes empurraram-no.
   * Derivá-la do tabuleiro final em vez de a manter atualizada é a mesma escolha
   * que se fez para o grupo inserido, pela mesma razão.
   */
  const posicao = jokerAt(estado.board);
  if (posicao === undefined) return undefined;

  return {
    board: estado.board,
    solution,
    joker: {
      at: [posicao >>> 6, posicao & 63],
      trueValue: estado.trueValueJoker,
    },
    stats,
  };
}
